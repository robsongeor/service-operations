import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { fetchEquipment } from '../jobs/services/equipmentApi'
import { fetchCustomers } from '../jobs/services/customersApi'
import { fetchSites } from '../jobs/services/sitesApi'
import { fetchMechanics } from '../mechanics/services/mechanicsApi'
import type { Customer } from '../jobs/types/customer.types'
import type { Mechanic } from '../jobs/types/mechanic.types'
import type { Site } from '../jobs/types/site.types'
import VerifiedAddressField from '../jobs/components/VerifiedAddressField'
import { fetchRecentJobBookRows } from './jobBookApi'
import {
    applyEquipmentToRow,
    createBlankJobBookRow,
    equipmentToPrototype,
    isEquipmentConfigured,
    nextPrototypeJobNumber,
    type JobBookRow,
    type PrototypeEquipment,
} from './jobBookPrototype'
import './JobBookPrototypeScreen.css'

const SESSION_KEY = 'service-operations:job-book-prototype:v2'
const STATUS_OVERRIDES_KEY = 'service-operations:job-book-status-overrides:v1'

type RowOverride = Partial<Pick<JobBookRow,
    'entered' | 'timecloudEntered' | 'customerPo' | 'mechanicId' | 'mechanicName' |
    'equipmentId' | 'fleet' | 'serial' | 'make' | 'model' | 'equipmentConfigured' |
    'equipmentReviewRequired' | 'customer' | 'site' | 'description' | 'address' |
    'addressVerified' | 'addressNotFoundConfirmed'>>

type MachineDraft = Omit<PrototypeEquipment, 'id' | 'isLocal'>
const emptyMachineDraft: MachineDraft = {
    fleet: '', serial: '', make: '', model: '', customer: '', site: '', address: '', addressVerified: false, addressNotFoundConfirmed: false,
}

function parseStoredRows(): JobBookRow[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '[]')
        return Array.isArray(parsed)
            ? parsed.map((row) => ({
                ...row,
                mechanicId: row.mechanicId ?? '',
                mechanicName: row.mechanicName ?? '',
                make: row.make ?? '',
                addressVerified: row.addressVerified ?? Boolean(row.address),
                addressNotFoundConfirmed: row.addressNotFoundConfirmed ?? false,
                equipmentReviewRequired: row.equipmentReviewRequired ?? false,
            }))
            : []
    } catch {
        return []
    }
}

function parseRowOverrides(): Record<string, RowOverride> {
    try {
        const parsed = JSON.parse(localStorage.getItem(STATUS_OVERRIDES_KEY) ?? '{}')
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function displayDate(value: string) {
    if (!value) return '—'
    const [year, month, day] = value.split('-')
    return year && month && day ? `${day}/${month}/${year}` : value
}

function addressIsAccepted(record: Pick<JobBookRow, 'address' | 'addressVerified' | 'addressNotFoundConfirmed'>) {
    return !record.address.trim() || record.addressVerified || record.addressNotFoundConfirmed
}

function equipmentIsAccepted(record: Pick<JobBookRow, 'equipmentConfigured' | 'equipmentReviewRequired'>) {
    return record.equipmentConfigured || record.equipmentReviewRequired
}

function EquipmentPicker({
    value,
    selected,
    equipment,
    onSelect,
    onAdd,
}: {
    value: string
    selected?: Pick<PrototypeEquipment, 'fleet' | 'serial' | 'make' | 'model'>
    equipment: PrototypeEquipment[]
    onSelect: (equipment: PrototypeEquipment) => void
    onAdd: () => void
}) {
    const [query, setQuery] = useState(value)
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [])
    const normalized = query.trim().toLocaleLowerCase('en-NZ')
    const results = equipment.filter((item) => [item.fleet, item.serial, item.make, item.model, item.customer, item.site]
        .some((field) => field.toLocaleLowerCase('en-NZ').includes(normalized))).slice(0, 25)

    return <div className="job-book-equipment-picker" ref={rootRef}>
        {selected && !open
            ? <button type="button" className="job-book-equipment-selected-trigger" onClick={() => { setQuery(selected.fleet || selected.serial); setOpen(true) }}>
                <strong>{selected.fleet || selected.serial}</strong>
                {(selected.make || selected.model) && <small>{[selected.make, selected.model].filter(Boolean).join(' ')}</small>}
            </button>
            : <input
                value={query}
                aria-label="Equipment search"
                placeholder="Search fleet or serial"
                onFocus={() => setOpen(true)}
                onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
            />}
        {open && <div className="job-book-equipment-menu">
            <button type="button" className="job-book-equipment-add" onClick={() => { setOpen(false); onAdd() }}>
                + Add machine details
            </button>
            {results.map((item) => <button
                type="button"
                key={item.id}
                onClick={() => { setQuery(item.fleet || item.serial); onSelect(item); setOpen(false) }}
            >
                <strong>{item.fleet || 'No fleet'}</strong>
                <span>{[item.make, item.model, item.serial && `S/N ${item.serial}`].filter(Boolean).join(' · ')}</span>
                <small>{[item.customer, item.site].filter(Boolean).join(' — ')}</small>
            </button>)}
            {!results.length && <p>No matching equipment</p>}
        </div>}
    </div>
}

function MechanicPicker({
    value,
    mechanics,
    onChange,
}: {
    value: string
    mechanics: Mechanic[]
    onChange: (mechanicId: string, mechanicName: string) => void
}) {
    const [query, setQuery] = useState(value)
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
    }, [])
    const search = query.trim().toLocaleLowerCase('en-NZ')
    const results = mechanics
        .filter((item) => !search || `${item.gr_name} ${item.gr_email ?? ''}`.toLocaleLowerCase('en-NZ').includes(search))
        .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
        .slice(0, 20)
    const choose = (id: string, name: string) => {
        setQuery(name)
        onChange(id, name)
        setOpen(false)
    }
    const customName = query.trim()

    return <div className="job-book-mechanic-picker" ref={rootRef}>
        <input
            type="search"
            aria-label="Mechanic or custom entry"
            placeholder="Search staff or type custom"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && customName) {
                    event.preventDefault()
                    choose('', customName)
                }
                if (event.key === 'Escape') setOpen(false)
            }}
        />
        {open && <div className="job-book-mechanic-menu">
            {customName && <button type="button" className="job-book-custom-mechanic" onClick={() => choose('', customName)}>
                <strong>Use “{customName}”</strong><small>Custom entry, for example outwork</small>
            </button>}
            {results.map((item) => <button type="button" key={item.gr_mechanicid} onClick={() => choose(item.gr_mechanicid, item.gr_name)}>
                <strong>{item.gr_name}</strong><small>{item.gr_email || 'Staff member'}</small>
            </button>)}
            {!results.length && !customName && <p>Start typing to find staff</p>}
        </div>}
    </div>
}

export default function JobBookPrototypeScreen() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [rows, setRows] = useState<JobBookRow[]>(parseStoredRows)
    const [recentRows, setRecentRows] = useState<JobBookRow[]>([])
    const [draft, setDraft] = useState<JobBookRow>(() => createBlankJobBookRow(0))
    const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>(parseRowOverrides)
    const [equipment, setEquipment] = useState<PrototypeEquipment[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [machineDialogOpen, setMachineDialogOpen] = useState(false)
    const [machineTarget, setMachineTarget] = useState<'draft' | 'edit'>('draft')
    const [editingRow, setEditingRow] = useState<JobBookRow | null>(null)
    const [machineDraft, setMachineDraft] = useState<MachineDraft>(emptyMachineDraft)
    const [machineWarning, setMachineWarning] = useState('')
    const [keepEquipmentUnconfigured, setKeepEquipmentUnconfigured] = useState(false)

    useEffect(() => localStorage.setItem(SESSION_KEY, JSON.stringify(rows)), [rows])
    useEffect(() => localStorage.setItem(STATUS_OVERRIDES_KEY, JSON.stringify(rowOverrides)), [rowOverrides])

    useEffect(() => {
        if (!account) return
        let cancelled = false
        const load = async () => {
            setLoading(true)
            setLoadError('')
            try {
                const token = await acquireDataverseAccessToken(instance, account)
                const [equipmentRows, customerRows, siteRows, mechanicRows, jobRows] = await Promise.all([
                    fetchEquipment(token, {
                        useDeviceCache: true,
                        onDeviceSnapshot: (cached) => {
                            if (!cancelled) { setEquipment(cached.map(equipmentToPrototype)); setLoading(false) }
                        },
                        onBackgroundRefresh: (fresh) => {
                            if (!cancelled) setEquipment((current) => [
                                ...fresh.map(equipmentToPrototype),
                                ...current.filter((item) => item.isLocal),
                            ])
                        },
                    }),
                    fetchCustomers(token),
                    fetchSites(token),
                    fetchMechanics(token),
                    fetchRecentJobBookRows(token),
                ])
                if (!cancelled) {
                    setEquipment((current) => [
                        ...equipmentRows.map(equipmentToPrototype),
                        ...current.filter((item) => item.isLocal),
                    ])
                    setCustomers(customerRows)
                    setSites(siteRows)
                    setMechanics(mechanicRows)
                    setRecentRows(jobRows)
                }
            } catch (error) {
                if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Reference data could not be loaded.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void load()
        return () => { cancelled = true }
    }, [account, instance])

    const customerSites = useMemo(() => sites.filter((site) => !machineDraft.customer
        || site.gr_Customer?.gr_name === machineDraft.customer), [machineDraft.customer, sites])

    const displayedRows = useMemo(() => [...rows, ...recentRows]
        .map((row) => {
            const merged = { ...row, ...rowOverrides[row.id] }
            const sourceEquipment = equipment.find((item) => item.id.toLowerCase() === merged.equipmentId.toLowerCase())
            return {
                ...merged,
                make: merged.make || sourceEquipment?.make || '',
                model: merged.model || sourceEquipment?.model || '',
            }
        })
        .sort((a, b) => Number.parseInt(b.jobNumber, 10) - Number.parseInt(a.jobNumber, 10)), [equipment, recentRows, rowOverrides, rows])
    const openMachineDialog = (target: 'draft' | 'edit' = 'draft', sourceOverride?: JobBookRow) => {
        const source = sourceOverride ?? (target === 'edit' && editingRow ? editingRow : draft)
        setMachineTarget(target)
        setMachineDialogOpen(true)
        setMachineDraft({
            fleet: source.fleet, serial: source.serial, make: source.make, model: source.model,
            customer: source.customer, site: source.site, address: source.address, addressVerified: source.addressVerified,
            addressNotFoundConfirmed: source.addressNotFoundConfirmed,
        })
        setMachineWarning('')
        setKeepEquipmentUnconfigured(source.equipmentReviewRequired)
    }
    const saveMachine = () => {
        const configured = isEquipmentConfigured(machineDraft)
        if (!configured && !keepEquipmentUnconfigured) {
            setMachineWarning('Enter a fleet number or serial number before saving.')
            return
        }
        if (!addressIsAccepted(machineDraft)) {
            setMachineWarning('Select a verified address or confirm that the address was not found.')
            return
        }
        const record: PrototypeEquipment = {
            ...machineDraft,
            id: `prototype-${crypto.randomUUID()}`,
            isLocal: true,
        }
        if (configured) setEquipment((current) => [record, ...current])
        const applyRecord = (row: JobBookRow) => ({
            ...applyEquipmentToRow(row, record),
            equipmentReviewRequired: !configured && keepEquipmentUnconfigured,
        })
        if (machineTarget === 'edit') setEditingRow((current) => current ? applyRecord(current) : current)
        else setDraft((current) => applyRecord(current))
        setMachineDialogOpen(false)
        setMachineDraft(emptyMachineDraft)
        setMachineWarning('')
        setKeepEquipmentUnconfigured(false)
    }
    const submitPrototypeJob = () => {
        if (!draft.description.trim() || !addressIsAccepted(draft) || !equipmentIsAccepted(draft)) return
        const allocatedNumber = nextPrototypeJobNumber(displayedRows)
        const created = {
            ...draft,
            id: crypto.randomUUID(),
            jobNumber: String(allocatedNumber),
            date: createBlankJobBookRow(0).date,
        }
        setRows((current) => [created, ...current])
        setDraft(createBlankJobBookRow(0))
    }
    const updateRowField = <K extends 'entered' | 'timecloudEntered' | 'customerPo'>(row: JobBookRow, field: K, value: JobBookRow[K]) => {
        if (row.id.startsWith('dataverse-')) {
            setRowOverrides((current) => ({
                ...current,
                [row.id]: { ...current[row.id], [field]: value },
            }))
            return
        }
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, [field]: value } : item))
    }
    const saveEditedRow = () => {
        if (!editingRow || !editingRow.description.trim() || !addressIsAccepted(editingRow) || !equipmentIsAccepted(editingRow)) return
        const changes: RowOverride = {
            mechanicId: editingRow.mechanicId,
            mechanicName: editingRow.mechanicName,
            equipmentId: editingRow.equipmentId,
            fleet: editingRow.fleet,
            serial: editingRow.serial,
            make: editingRow.make,
            model: editingRow.model,
            equipmentConfigured: editingRow.equipmentConfigured,
            equipmentReviewRequired: editingRow.equipmentReviewRequired,
            customer: editingRow.customer,
            site: editingRow.site,
            description: editingRow.description,
            address: editingRow.address,
            addressVerified: editingRow.addressVerified,
            addressNotFoundConfirmed: editingRow.addressNotFoundConfirmed,
        }
        if (editingRow.id.startsWith('dataverse-')) {
            setRowOverrides((current) => ({ ...current, [editingRow.id]: { ...current[editingRow.id], ...changes } }))
        } else {
            setRows((current) => current.map((row) => row.id === editingRow.id ? { ...row, ...changes } : row))
        }
        setEditingRow(null)
    }
    const chooseSite = (siteName: string) => {
        const site = sites.find((item) => item.gr_name === siteName)
        setMachineDraft((current) => ({
            ...current,
            site: siteName,
            customer: site?.gr_Customer?.gr_name ?? current.customer,
            address: site?.gr_address ?? current.address,
            addressVerified: Boolean(site?.gr_address ?? current.address),
            addressNotFoundConfirmed: false,
        }))
    }
    const draftSourceEquipment = equipment.find((item) => item.id.toLowerCase() === draft.equipmentId.toLowerCase())
    const draftEquipmentDisplay = {
        fleet: draft.fleet,
        serial: draft.serial,
        make: draft.make || draftSourceEquipment?.make || '',
        model: draft.model || draftSourceEquipment?.model || '',
    }

    return <main className="job-book-screen">
        <header className="job-book-header">
            <div>
                <span className="job-book-eyebrow">PROTOTYPE · NO DATAVERSE WRITES</span>
                <h1>Job Book</h1>
                <p>Allocate Job numbers in the familiar Job Book layout. Drafts are saved on this PC.</p>
            </div>
            <div className="job-book-actions">
                <button type="button" className="job-book-secondary" onClick={() => {
                    localStorage.removeItem(SESSION_KEY)
                    localStorage.removeItem(STATUS_OVERRIDES_KEY)
                    setRows([])
                    setRowOverrides({})
                    setDraft(createBlankJobBookRow(0))
                }}>Reset prototype</button>
            </div>
        </header>

        <section className={`job-book-entry-card${draft.equipmentReviewRequired ? ' equipment-unconfigured' : ''}`}>
            <div className="job-book-entry-heading">
                <div><span className="job-book-new-badge">NEW JOB ENTRY</span><h2>Enter the next Job Book row</h2></div>
                <div className="job-book-entry-submit"><span>No Dataverse write · allocation is locally simulated</span><button type="button" className="job-book-primary" disabled={!draft.description.trim() || !addressIsAccepted(draft) || !equipmentIsAccepted(draft)} title={!equipmentIsAccepted(draft) ? 'Select Equipment or explicitly keep it as unconfigured.' : !draft.description.trim() ? 'Enter a Job description before submitting.' : !addressIsAccepted(draft) ? 'Select a verified address or confirm it was not found.' : undefined} onClick={submitPrototypeJob}>Submit new row</button></div>
            </div>
            <div className="job-book-entry-table-wrap">
                <table className="job-book-grid job-book-entry-table">
                    <thead><tr>
                        <th className="job-number-column">Job Number</th><th>Date</th><th>Mechanic</th>
                        <th>Equipment <span className="job-book-required-mark">*</span></th><th>Customer</th><th className="description-column">Description of the Job <span className="job-book-required-mark">*</span></th>
                        <th className="address-column">Site Address</th><th>Customer PO #</th><th>Entered</th><th>Timecloud Entry</th><th>Actions</th>
                    </tr></thead>
                    <tbody><tr className={draft.equipmentReviewRequired ? 'equipment-unconfigured' : undefined}>
                        <td className="job-number-column"><span className="job-book-awaiting-number">Allocated<br />on submit</span></td>
                        <td><span className="job-book-readonly-date">{displayDate(draft.date)}</span></td>
                        <td><MechanicPicker key={`${draft.id}-${draft.mechanicId}-${draft.mechanicName}`} value={draft.mechanicName} mechanics={mechanics}
                            onChange={(mechanicId, mechanicName) => setDraft((current) => ({ ...current, mechanicId, mechanicName }))} /></td>
                        <td className={`fleet-cell${!equipmentIsAccepted(draft) ? ' job-book-required-missing' : ''}`}>{draft.equipmentReviewRequired
                            ? <button type="button" className="job-book-unconfigured-link" onClick={() => openMachineDialog()}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                            : <EquipmentPicker key={`${draft.id}-${draft.equipmentId}`} value={draft.fleet || draft.serial} selected={draft.equipmentConfigured ? draftEquipmentDisplay : undefined} equipment={equipment}
                                onSelect={(item) => setDraft((current) => applyEquipmentToRow(current, item))} onAdd={() => openMachineDialog()} />}</td>
                        <td><div className="job-book-customer-editor"><input aria-label="Customer" value={draft.customer} onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value, site: '' }))} />{draft.site && <small>{draft.site}</small>}</div></td>
                        <td className={!draft.description.trim() ? 'job-book-required-missing' : undefined}><textarea required aria-label="Job description (required)" placeholder="Required" rows={2} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></td>
                        <td className="job-book-address-cell"><div className="job-book-address-editor"><VerifiedAddressField compact verified={draft.addressVerified} value={draft.address}
                            onChange={(address, selection) => setDraft((current) => ({ ...current, address, addressVerified: Boolean(selection), addressNotFoundConfirmed: false }))} />
                            {draft.address.trim() && !draft.addressVerified && <label className="job-book-address-confirm"><input type="checkbox" checked={draft.addressNotFoundConfirmed} onChange={(event) => setDraft((current) => ({ ...current, addressNotFoundConfirmed: event.target.checked }))} /><span>Address<br />not found</span></label>}</div></td>
                        <td><input aria-label="Customer purchase order" value={draft.customerPo} onChange={(event) => setDraft((current) => ({ ...current, customerPo: event.target.value }))} /></td>
                        <td><span className="job-book-status-pill">After submit</span></td>
                        <td><span className="job-book-status-pill">After submit</span></td>
                        <td><span className="job-book-new-row-label">New row</span></td>
                    </tr></tbody>
                </table>
            </div>
        </section>

        <div className="job-book-statusbar">
            <strong>Latest Jobs</strong>
            <span>{displayedRows.length} shown · highest Job Number first</span>
            <span>{equipment.length.toLocaleString()} equipment available</span>
            {loading && <span>Loading reference data…</span>}
            {loadError && <span className="job-book-error">{loadError}</span>}
            <span className="job-book-local-badge">LOCAL ONLY</span>
        </div>

        <section className="job-book-grid-wrap" aria-label="Prototype Job Book">
            <table className="job-book-grid">
                <thead><tr>
                    <th className="job-number-column">Job Number</th><th>Date</th><th>Mechanic</th>
                    <th>Equipment</th><th>Customer</th><th className="description-column">Description of the Job</th>
                    <th className="address-column">Site Address</th><th>Customer PO #</th><th>Entered</th><th>Timecloud Entry</th><th>Actions</th>
                </tr></thead>
                <tbody>{displayedRows.map((row) => {
                    const isEditing = editingRow?.id === row.id
                    const shown = isEditing ? editingRow : row
                    const canSaveEdit = Boolean(shown.description.trim()) && addressIsAccepted(shown) && equipmentIsAccepted(shown)
                    return <tr key={row.id} className={`${shown.equipmentReviewRequired ? 'equipment-unconfigured ' : ''}${isEditing ? 'job-book-row-editing' : ''}`.trim() || undefined}>
                        <td className="job-number-column"><strong>{shown.jobNumber}</strong></td>
                        <td><span className="job-book-readonly-date" aria-label="Job creation date">{displayDate(shown.date)}</span></td>
                        <td>{isEditing
                            ? <MechanicPicker key={`${shown.id}-${shown.mechanicId}-${shown.mechanicName}`} value={shown.mechanicName} mechanics={mechanics}
                                onChange={(mechanicId, mechanicName) => setEditingRow((current) => current ? { ...current, mechanicId, mechanicName } : current)} />
                            : <span className="job-book-table-value">{shown.mechanicName || '—'}</span>}</td>
                        <td className={isEditing ? `fleet-cell${!equipmentIsAccepted(shown) ? ' job-book-required-missing' : ''}` : undefined}>{isEditing
                            ? shown.equipmentReviewRequired
                                ? <button type="button" className="job-book-unconfigured-link" onClick={() => openMachineDialog('edit')}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                                : <EquipmentPicker key={`${shown.id}-${shown.equipmentId}`} value={shown.fleet || shown.serial} selected={shown.equipmentConfigured ? shown : undefined} equipment={equipment}
                                    onSelect={(item) => setEditingRow((current) => current ? applyEquipmentToRow(current, item) : current)} onAdd={() => openMachineDialog('edit')} />
                            : shown.equipmentReviewRequired
                                ? <button type="button" className="job-book-unconfigured-link" onClick={() => { setEditingRow(row); openMachineDialog('edit', row) }}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                                : <span className="job-book-table-value job-book-equipment-value"><strong>{shown.fleet || shown.serial || '—'}</strong>{(shown.make || shown.model) && <small>{[shown.make, shown.model].filter(Boolean).join(' ')}</small>}</span>}</td>
                        <td>{isEditing
                            ? <div className="job-book-customer-editor"><input aria-label={`Customer for Job ${shown.jobNumber}`} value={shown.customer} onChange={(event) => setEditingRow((current) => current ? { ...current, customer: event.target.value, site: '' } : current)} />{shown.site && <small>{shown.site}</small>}</div>
                            : <span className="job-book-table-value job-book-customer-value"><strong>{shown.customer || '—'}</strong>{shown.site && <small>{shown.site}</small>}</span>}</td>
                        <td className={isEditing && !shown.description.trim() ? 'job-book-required-missing' : undefined}>{isEditing
                            ? <textarea required aria-label={`Description for Job ${shown.jobNumber} (required)`} placeholder="Required" rows={2} value={shown.description} onChange={(event) => setEditingRow((current) => current ? { ...current, description: event.target.value } : current)} />
                            : <span className="job-book-table-value description">{shown.description || '—'}</span>}</td>
                        <td className={isEditing ? 'job-book-address-cell' : undefined}>{isEditing
                            ? <div className="job-book-address-editor"><VerifiedAddressField compact verified={shown.addressVerified} value={shown.address}
                                onChange={(address, selection) => setEditingRow((current) => current ? { ...current, address, addressVerified: Boolean(selection), addressNotFoundConfirmed: false } : current)} />
                                {shown.address.trim() && !shown.addressVerified && <label className="job-book-address-confirm"><input type="checkbox" checked={shown.addressNotFoundConfirmed} onChange={(event) => setEditingRow((current) => current ? { ...current, addressNotFoundConfirmed: event.target.checked } : current)} /><span>Address<br />not found</span></label>}</div>
                            : <span className="job-book-table-value">{shown.address || '—'}</span>}</td>
                        <td><input className="job-book-table-edit" aria-label={`Customer PO for Job ${shown.jobNumber}`} value={row.customerPo} placeholder="Add PO number" onChange={(event) => updateRowField(row, 'customerPo', event.target.value)} /></td>
                        <td><label className={`job-book-table-check ${row.entered ? 'complete' : ''}`}><input type="checkbox" checked={row.entered} onChange={(event) => updateRowField(row, 'entered', event.target.checked)} /><span>{row.entered ? 'Entered' : 'Pending'}</span></label></td>
                        <td><label className={`job-book-table-check ${row.timecloudEntered ? 'complete' : ''}`}><input type="checkbox" checked={row.timecloudEntered} onChange={(event) => updateRowField(row, 'timecloudEntered', event.target.checked)} /><span>{row.timecloudEntered ? 'Entered' : 'Pending'}</span></label></td>
                        <td>{isEditing
                            ? <div className="job-book-row-actions"><button type="button" className="save" disabled={!canSaveEdit} title={!equipmentIsAccepted(shown) ? 'Select Equipment or explicitly keep it as unconfigured.' : !shown.description.trim() ? 'Enter a Job description before saving.' : !addressIsAccepted(shown) ? 'Select a verified address or confirm it was not found.' : undefined} onClick={saveEditedRow}>Save changes</button><button type="button" onClick={() => setEditingRow(null)}>Cancel</button></div>
                            : <button type="button" className="job-book-edit-row" onClick={() => setEditingRow(row)}>Edit row</button>}</td>
                    </tr>
                })}</tbody>
            </table>
        </section>

        {machineDialogOpen && <div className="job-book-dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMachineDialogOpen(false)
        }}>
            <section className="job-book-dialog" role="dialog" aria-modal="true" aria-labelledby="machine-dialog-title">
                <header><div><span className="job-book-eyebrow">PROTOTYPE MACHINE</span><h2 id="machine-dialog-title">Add machine details</h2></div><button type="button" aria-label="Close" onClick={() => setMachineDialogOpen(false)}>×</button></header>
                <p className="job-book-dialog-note">This only fills the Job Book row. It will not create Equipment, a Customer, or a Site in Dataverse.</p>
                <div className="job-book-form-grid">
                    <label>Fleet number<input autoFocus value={machineDraft.fleet} onChange={(event) => setMachineDraft((current) => ({ ...current, fleet: event.target.value }))} /></label>
                    <label>Serial number<input value={machineDraft.serial} onChange={(event) => setMachineDraft((current) => ({ ...current, serial: event.target.value }))} /></label>
                    <label>Make<input value={machineDraft.make} onChange={(event) => setMachineDraft((current) => ({ ...current, make: event.target.value }))} /></label>
                    <label>Model<input value={machineDraft.model} onChange={(event) => setMachineDraft((current) => ({ ...current, model: event.target.value }))} /></label>
                    <label>Customer<input list="job-book-customers" value={machineDraft.customer} onChange={(event) => setMachineDraft((current) => ({ ...current, customer: event.target.value, site: '' }))} /></label>
                    <label>Site<input list="job-book-sites" value={machineDraft.site} onChange={(event) => chooseSite(event.target.value)} /></label>
                    <div className="full-width"><VerifiedAddressField verified={machineDraft.addressVerified} value={machineDraft.address}
                        onChange={(address, selection) => setMachineDraft((current) => ({ ...current, address, addressVerified: Boolean(selection), addressNotFoundConfirmed: false }))} />
                        {machineDraft.address.trim() && !machineDraft.addressVerified && <label className="job-book-address-confirm dialog"><input type="checkbox" checked={machineDraft.addressNotFoundConfirmed} onChange={(event) => setMachineDraft((current) => ({ ...current, addressNotFoundConfirmed: event.target.checked }))} /><span>Address<br />not found</span></label>}</div>
                </div>
                <datalist id="job-book-customers">{customers.map((item) => <option key={item.gr_customerid} value={item.gr_name} />)}</datalist>
                <datalist id="job-book-sites">{customerSites.map((item) => <option key={item.gr_siteid} value={item.gr_name} />)}</datalist>
                {!isEquipmentConfigured(machineDraft) && <label className="job-book-keep-unconfigured"><input type="checkbox" checked={keepEquipmentUnconfigured} onChange={(event) => setKeepEquipmentUnconfigured(event.target.checked)} /><span><strong>Keep as unconfigured for now</strong><small>The Job row will be highlighted until a Fleet or Serial Number is added.</small></span></label>}
                {machineWarning && <p className="job-book-dialog-error">{machineWarning}</p>}
                <footer>
                    <button type="button" className="job-book-secondary" onClick={() => setMachineDialogOpen(false)}>Cancel</button>
                    <button type="button" className="job-book-primary" disabled={(!isEquipmentConfigured(machineDraft) && !keepEquipmentUnconfigured) || !addressIsAccepted(machineDraft)} onClick={saveMachine}>Save</button>
                </footer>
            </section>
        </div>}
    </main>
}
