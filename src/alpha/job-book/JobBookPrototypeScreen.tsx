import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { fetchCustomers } from '../jobs/services/customersApi'
import { fetchSites } from '../jobs/services/sitesApi'
import { fetchMechanics } from '../mechanics/services/mechanicsApi'
import { subscribeToStaffChanges } from '../mechanics/services/staffRealtime'
import type { Customer } from '../jobs/types/customer.types'
import type { Mechanic } from '../jobs/types/mechanic.types'
import type { Site } from '../jobs/types/site.types'
import VerifiedAddressField from '../jobs/components/VerifiedAddressField'
import SearchableSelect, { type SearchableSelectOption } from '../shared/searchable-select/SearchableSelect'
import { STANDARD_JOB_TYPE_OPTIONS, type JobType } from '../jobs/types/jobType.types'
import { JOB_DESCRIPTION_MAX_LENGTH } from '../jobs/domain/jobDescription'
import { createJobBookIntakeRow, fetchJobBookIntakeRows, fetchRecentJobBookRows, updateJobBookIntakeRow, updateManagedJobBookMarker } from './jobBookApi'
import { fetchJobBookEquipmentIndex } from './jobBookEquipmentIndexApi'
import {
    applyEquipmentToRow,
    createBlankJobBookRow,
    isEquipmentConfigured,
    JOB_BOOK_ENTRY_STAGES,
    splitSiteAddress,
    getPromotionReadiness,
    type JobBookRow,
    type PrototypeEquipment,
} from './jobBookPrototype'
import './JobBookPrototypeScreen.css'

type JobBookFilters = {
    search: string
    date: string
    mechanic: string
    equipment: string
    customerSite: string
}

const EMPTY_FILTERS: JobBookFilters = { search: '', date: '', mechanic: '', equipment: '', customerSite: '' }

type MachineDraft = Omit<PrototypeEquipment, 'id' | 'isLocal'>
const emptyMachineDraft: MachineDraft = {
    fleet: '', serial: '', make: '', model: '', customer: '', customerId: '', site: '', siteId: '', address: '', addressVerified: false, addressNotFoundConfirmed: false,
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

const ADD_EQUIPMENT_VALUE = '__add-equipment-details__'

function clearEquipmentContext(row: JobBookRow, customerId = '', customer = ''): JobBookRow {
    return {
        ...row,
        equipmentId: '', fleet: '', serial: '', make: '', model: '',
        equipmentConfigured: false, equipmentReviewRequired: false,
        customerId, customer, siteId: '', site: '', address: '',
        addressVerified: false, addressNotFoundConfirmed: false,
    }
}

function applyCustomerSelection(row: JobBookRow, customerId: string, customer: string): JobBookRow {
    if (customerId === row.customerId) return row
    return clearEquipmentContext(row, customerId, customer)
}

function EquipmentPicker({
    id,
    value,
    customerId,
    equipment,
    onSelect,
    onClear,
    onAdd,
}: {
    id: string
    value: string
    customerId: string
    equipment: PrototypeEquipment[]
    onSelect: (equipment: PrototypeEquipment) => void
    onClear: () => void
    onAdd: () => void
}) {
    const options = useMemo<SearchableSelectOption[]>(() => [
        { value: ADD_EQUIPMENT_VALUE, label: '+ Add machine details', secondary: 'Record Equipment that is not in the picker', emphasized: true },
        ...equipment
            .filter((item) => !customerId || item.customerId === customerId)
            .map((item) => ({
                value: item.id,
                label: item.fleet || item.serial || 'Equipment without an identifier',
                secondary: [item.make, item.model, item.serial && `S/N ${item.serial}`].filter(Boolean).join(' · '),
                searchText: [item.alternateFleetNumbers, item.customer, item.site].filter(Boolean).join(' '),
            })),
    ], [customerId, equipment])

    return <SearchableSelect
        id={id}
        label="Equipment"
        value={value}
        options={options}
        placeholder="Select Equipment"
        searchPlaceholder="Search fleet, alternate or serial"
        emptyLabel="No matching Equipment"
        resultLimit={50}
        onChange={(nextValue) => {
            if (nextValue === ADD_EQUIPMENT_VALUE) { onAdd(); return }
            if (!nextValue) { onClear(); return }
            const selected = equipment.find((item) => item.id === nextValue)
            if (selected) onSelect(selected)
        }}
    />
}

function CustomerPicker({ id, value, customerName, customers, equipment, site, loading, onOpen, onChange }: {
    id: string
    value: string
    customerName: string
    customers: Customer[]
    equipment: PrototypeEquipment[]
    site: string
    loading: boolean
    onOpen: () => void
    onChange: (customerId: string, customerName: string) => void
}) {
    const options = useMemo<SearchableSelectOption[]>(() => {
        const byId = new Map<string, SearchableSelectOption>()
        customers.forEach((customer) => byId.set(customer.gr_customerid, {
            value: customer.gr_customerid,
            label: customer.gr_name,
        }))
        equipment.forEach((item) => {
            if (item.customerId && item.customer && !byId.has(item.customerId)) byId.set(item.customerId, {
                value: item.customerId,
                label: item.customer,
            })
        })
        if (!value && customerName) byId.set('__saved-customer-text__', {
            value: '__saved-customer-text__',
            label: customerName,
            secondary: 'Saved customer text; choose a Customer to link it',
        })
        return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
    }, [customerName, customers, equipment, value])

    return <div className="job-book-customer-editor" onFocusCapture={onOpen} onPointerDownCapture={onOpen}>
        <SearchableSelect
            id={id}
            label="Customer"
            value={value || (customerName ? '__saved-customer-text__' : '')}
            options={options}
            placeholder="Select Customer"
            searchPlaceholder="Search Customers"
            emptyLabel={loading ? 'Loading Customers…' : 'No matching Customers'}
            resultLimit={50}
            onChange={(nextValue) => onChange(
                nextValue === '__saved-customer-text__' ? '' : nextValue,
                options.find((option) => option.value === nextValue)?.label ?? '',
            )}
        />
        {site && <small>{site}</small>}
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
    const navigate = useNavigate()
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [recentRows, setRecentRows] = useState<JobBookRow[]>([])
    const [intakeRows, setIntakeRows] = useState<JobBookRow[]>([])
    const [draft, setDraft] = useState<JobBookRow>(() => createBlankJobBookRow(0))
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
    const [filters, setFilters] = useState<JobBookFilters>(EMPTY_FILTERS)
    const [promotionRow, setPromotionRow] = useState<JobBookRow | null>(null)
    const [promotionJobType, setPromotionJobType] = useState<JobType>(STANDARD_JOB_TYPE_OPTIONS[0].value)
    const [savingIntake, setSavingIntake] = useState(false)
    const [savingEntryMarkers, setSavingEntryMarkers] = useState<Set<string>>(() => new Set())
    const [saveError, setSaveError] = useState('')
    const [machineReferencesLoaded, setMachineReferencesLoaded] = useState(false)
    const [machineReferencesLoading, setMachineReferencesLoading] = useState(false)
    const [machineReferencesError, setMachineReferencesError] = useState('')
    const machineReferenceRequestRef = useRef<Promise<void> | null>(null)
    const machineReferenceLoadVersionRef = useRef(0)
    const machineReferenceAccountRef = useRef('')

    useEffect(() => {
        if (!account) return
        let cancelled = false
        const load = async () => {
            setLoading(true)
            setLoadError('')
            try {
                const token = await acquireDataverseAccessToken(instance, account)
                const [equipmentRows, mechanicRows, jobRows, loadedIntakeRows] = await Promise.all([
                    fetchJobBookEquipmentIndex(token, {
                        useDeviceCache: true,
                        onDeviceSnapshot: (cached) => {
                            if (!cancelled) setEquipment((current) => [
                                ...cached,
                                ...current.filter((item) => item.isLocal),
                            ])
                        },
                        onBackgroundRefresh: (fresh) => {
                            if (!cancelled) setEquipment((current) => [
                                ...fresh,
                                ...current.filter((item) => item.isLocal),
                            ])
                        },
                    }),
                    fetchMechanics(token),
                    fetchRecentJobBookRows(token),
                    fetchJobBookIntakeRows(token),
                ])
                if (!cancelled) {
                    setEquipment((current) => [
                        ...equipmentRows,
                        ...current.filter((item) => item.isLocal),
                    ])
                    setMechanics(mechanicRows)
                    setRecentRows(jobRows)
                    setIntakeRows(loadedIntakeRows)
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

    useEffect(() => {
        if (!account) return
        let cancelled = false
        let refreshTimer: number | undefined
        const unsubscribe = subscribeToStaffChanges(() => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(async () => {
                try {
                    const token = await acquireDataverseAccessToken(instance, account)
                    const rows = await fetchMechanics(token)
                    if (!cancelled) setMechanics(rows)
                } catch {
                    // Preserve the current picker contents if a background refresh fails.
                }
            }, 750)
        })
        return () => {
            cancelled = true
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            unsubscribe()
        }
    }, [account, instance])

    const customerSites = useMemo(() => sites.filter((site) => !machineDraft.customer
        || site.gr_Customer?.gr_name === machineDraft.customer), [machineDraft.customer, sites])

    const allRows = useMemo(() => [...intakeRows, ...recentRows]
        .map((row) => {
            const sourceEquipment = equipment.find((item) => item.id.toLowerCase() === row.equipmentId.toLowerCase())
            return {
                ...row,
                make: row.make || sourceEquipment?.make || '',
                model: row.model || sourceEquipment?.model || '',
            }
        })
        .sort((a, b) => Number.parseInt(b.jobNumber, 10) - Number.parseInt(a.jobNumber, 10)), [equipment, intakeRows, recentRows])
    const displayedRows = useMemo(() => {
        const includes = (values: Array<string | undefined>, term: string) => !term.trim()
            || values.some((value) => value?.toLocaleLowerCase('en-NZ').includes(term.trim().toLocaleLowerCase('en-NZ')))
        return allRows.filter((row) => {
            if (filters.date && row.date !== filters.date) return false
            if (!includes([row.mechanicName], filters.mechanic)) return false
            if (!includes([row.fleet, row.serial, row.make, row.model], filters.equipment)) return false
            if (!includes([row.customer, row.site, row.address], filters.customerSite)) return false
            return includes([
                row.jobNumber, displayDate(row.date), row.mechanicName, row.fleet, row.serial,
                row.make, row.model, row.customer, row.site, row.address, row.description, row.customerPo,
            ], filters.search)
        })
    }, [allRows, filters])
    const mechanicFilterOptions = useMemo(() => [...new Set(allRows.map((row) => row.mechanicName.trim()).filter(Boolean))].sort(), [allRows])
    const customerSiteFilterOptions = useMemo(() => [...new Set(allRows.flatMap((row) => [row.customer.trim(), row.site.trim()]).filter(Boolean))].sort(), [allRows])
    const filtersActive = Object.values(filters).some(Boolean)
    const activeFilterCount = Object.values(filters).filter(Boolean).length
    const ensureMachineReferenceData = () => {
        if (!account) return
        const accountKey = account.homeAccountId
        const sameAccount = machineReferenceAccountRef.current === accountKey
        if (sameAccount && (machineReferencesLoaded || machineReferenceRequestRef.current)) return
        if (!sameAccount) {
            machineReferenceLoadVersionRef.current += 1
            machineReferenceRequestRef.current = null
            machineReferenceAccountRef.current = accountKey
            setCustomers([])
            setSites([])
            setMachineReferencesLoaded(false)
            setMachineReferencesError('')
        }
        const loadVersion = machineReferenceLoadVersionRef.current
        setMachineReferencesLoading(true)
        setMachineReferencesError('')
        const request = acquireDataverseAccessToken(instance, account)
            .then((token) => Promise.all([fetchCustomers(token), fetchSites(token)]))
            .then(([customerRows, siteRows]) => {
                if (loadVersion !== machineReferenceLoadVersionRef.current) return
                setCustomers(customerRows)
                setSites(siteRows)
                setMachineReferencesLoaded(true)
            })
            .catch((error) => {
                if (loadVersion !== machineReferenceLoadVersionRef.current) return
                setMachineReferencesError(error instanceof Error ? error.message : 'Customer and Site suggestions could not be loaded.')
            })
            .finally(() => {
                if (loadVersion !== machineReferenceLoadVersionRef.current) return
                machineReferenceRequestRef.current = null
                setMachineReferencesLoading(false)
            })
        machineReferenceRequestRef.current = request
    }
    const openMachineDialog = (target: 'draft' | 'edit' = 'draft', sourceOverride?: JobBookRow) => {
        ensureMachineReferenceData()
        const source = sourceOverride ?? (target === 'edit' && editingRow ? editingRow : draft)
        setMachineTarget(target)
        setMachineDialogOpen(true)
        setMachineDraft({
            fleet: source.fleet, serial: source.serial, make: source.make, model: source.model,
            customer: source.customer, customerId: source.customerId, site: source.site, siteId: source.siteId, address: source.address, addressVerified: source.addressVerified,
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
    const submitPrototypeJob = async () => {
        if (!draft.description.trim() || !addressIsAccepted(draft) || !equipmentIsAccepted(draft)) return
        if (!account) return
        setSavingIntake(true)
        setSaveError('')
        try {
            const token = await acquireDataverseAccessToken(instance, account)
            const created = await createJobBookIntakeRow(token, draft)
            setIntakeRows((current) => [created, ...current])
            setDraft(createBlankJobBookRow(0))
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'The Intake entry could not be saved.')
        } finally {
            setSavingIntake(false)
        }
    }
    const persistIntakeRow = async (row: JobBookRow) => {
        if (!account) throw new Error('Sign in before saving Intake changes.')
        const token = await acquireDataverseAccessToken(instance, account)
        const saved = await updateJobBookIntakeRow(token, row)
        setIntakeRows((current) => current.map((item) => item.intakeRecordId === saved.intakeRecordId ? saved : item))
        return saved
    }
    const updateRowField = async <K extends 'entered' | 'timecloudEntered' | 'customerPo'>(row: JobBookRow, field: K, value: JobBookRow[K]) => {
        const updated = { ...row, [field]: value }
        const isEntryMarker = field === 'entered' || field === 'timecloudEntered'
        if (isEntryMarker && savingEntryMarkers.has(row.id)) return
        if (isEntryMarker) setSavingEntryMarkers((current) => new Set(current).add(row.id))
        try {
            if (row.intakeRecordId) {
                setSaveError('')
                try { await persistIntakeRow(updated) }
                catch (error) { setSaveError(error instanceof Error ? error.message : 'The Intake changes were not saved.') }
                return
            }
            if (row.entrySource === 'dataverse-job' && (field === 'entered' || field === 'timecloudEntered')) {
                if (!account) { setSaveError('Sign in before saving Job entry markers.'); return }
                setSaveError('')
                try {
                    const token = await acquireDataverseAccessToken(instance, account)
                    const saved = await updateManagedJobBookMarker(token, row, field, value as boolean)
                    setRecentRows((current) => current.map((item) => item.linkedJobId === row.linkedJobId ? { ...item, ...saved } : item))
                } catch (error) {
                    setSaveError(error instanceof Error ? error.message : 'The Job entry marker was not saved.')
                }
                return
            }
            setSaveError('This row is no longer backed by Dataverse. Reload the page before editing it.')
        } finally {
            if (isEntryMarker) setSavingEntryMarkers((current) => {
                const next = new Set(current)
                next.delete(row.id)
                return next
            })
        }
    }
    const saveEditedRow = async () => {
        if (!editingRow || !editingRow.description.trim() || !addressIsAccepted(editingRow) || !equipmentIsAccepted(editingRow)) return
        if (editingRow.intakeRecordId) {
            setSaveError('')
            try { await persistIntakeRow(editingRow); setEditingRow(null) }
            catch (error) { setSaveError(error instanceof Error ? error.message : 'The Intake changes were not saved.') }
            return
        }
        setSaveError('This row is no longer backed by Dataverse. Reload the page before editing it.')
    }
    const chooseSite = (siteName: string) => {
        const site = sites.find((item) => item.gr_name === siteName)
        setMachineDraft((current) => ({
            ...current,
            site: siteName,
            customer: site?.gr_Customer?.gr_name ?? current.customer,
            customerId: site?.gr_Customer?.gr_customerid ?? current.customerId,
            siteId: site?.gr_siteid ?? '',
            address: site?.gr_address ?? current.address,
            addressVerified: Boolean(site?.gr_address ?? current.address),
            addressNotFoundConfirmed: false,
        }))
    }
    const promotionReadiness = promotionRow ? getPromotionReadiness(promotionRow) : null

    return <main className="job-book-screen">
        <header className="job-book-header">
            <div>
                <span className="job-book-eyebrow">LEGACY JOB BOOK</span>
                <h1>Job Book Legacy</h1>
                <p>View managed Jobs and Job Book Intake entries together in the familiar legacy layout.</p>
            </div>
        </header>

        <section className="job-book-workspace">
            <header className="job-book-workspace-header">
                <div><span className="job-book-eyebrow">OPERATIONS</span><h2>Job Book Legacy</h2></div>
                <div className="job-book-workspace-summary">
                    <span>{displayedRows.length} shown</span>
                    <span>{equipment.length.toLocaleString()} equipment</span>
                    {loading && <span>Refreshing…</span>}
                    {loadError && <span className="job-book-error" title={loadError}>Load warning</span>}
                    <span className="job-book-local-badge">LEGACY VIEW</span>
                </div>
            </header>

        <section className={`job-book-entry-card${draft.equipmentReviewRequired ? ' equipment-unconfigured' : ''}`}>
            <div className="job-book-entry-heading">
                <div><span className="job-book-new-badge">NEW INTAKE ENTRY</span><h2>Enter the next Job Book row</h2></div>
            </div>
            <div className="job-book-entry-table-wrap">
                <table className="job-book-grid job-book-entry-table">
                    <thead><tr>
                        <th className="job-number-column">Job Number</th><th className="date-column">Date</th><th className="mechanic-column">Mechanic</th>
                        <th>Equipment <span className="job-book-required-mark">*</span></th><th>Customer</th><th className="description-column">Description of the Job <span className="job-book-required-mark">*</span></th>
                        <th className="address-column">Site Address</th><th>Customer PO #</th>
                    </tr></thead>
                    <tbody><tr className={draft.equipmentReviewRequired ? 'equipment-unconfigured' : undefined}>
                        <td className="job-number-column"><span className="job-book-awaiting-number">Allocated<br />on submit</span></td>
                        <td className="date-column"><span className="job-book-readonly-date">{displayDate(draft.date)}</span></td>
                        <td className="mechanic-column"><MechanicPicker key={`${draft.id}-${draft.mechanicId}-${draft.mechanicName}`} value={draft.mechanicName} mechanics={mechanics}
                            onChange={(mechanicId, mechanicName) => setDraft((current) => ({ ...current, mechanicId, mechanicName }))} /></td>
                        <td className={`fleet-cell${!equipmentIsAccepted(draft) ? ' job-book-required-missing' : ''}`}>{draft.equipmentReviewRequired
                            ? <button type="button" className="job-book-unconfigured-link" onClick={() => openMachineDialog()}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                            : <EquipmentPicker id="job-book-draft-equipment" key={`${draft.id}-${draft.equipmentId}`} value={draft.equipmentId} customerId={draft.customerId} equipment={equipment}
                                onSelect={(item) => setDraft((current) => applyEquipmentToRow(current, item))} onClear={() => setDraft((current) => clearEquipmentContext(current, current.customerId, current.customer))} onAdd={() => openMachineDialog()} />}</td>
                        <td><CustomerPicker id="job-book-draft-customer" value={draft.customerId} customerName={draft.customer} customers={customers} equipment={equipment} site={draft.site} loading={machineReferencesLoading}
                            onOpen={ensureMachineReferenceData} onChange={(customerId, customerName) => setDraft((current) => applyCustomerSelection(current, customerId, customerName))} /></td>
                        <td className={!draft.description.trim() ? 'job-book-required-missing' : undefined}><textarea required maxLength={JOB_DESCRIPTION_MAX_LENGTH} aria-label="Job description (required)" placeholder="Required" rows={2} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></td>
                        <td className="job-book-address-cell"><div className="job-book-address-editor"><VerifiedAddressField compact verified={draft.addressVerified} value={draft.address}
                            onChange={(address, selection) => setDraft((current) => ({ ...current, address, addressVerified: Boolean(selection), addressNotFoundConfirmed: false }))} />
                            {draft.address.trim() && !draft.addressVerified && <label className="job-book-address-confirm"><input type="checkbox" checked={draft.addressNotFoundConfirmed} onChange={(event) => setDraft((current) => ({ ...current, addressNotFoundConfirmed: event.target.checked }))} /><span>Address<br />not found</span></label>}</div></td>
                        <td><input aria-label="Customer purchase order" placeholder="Optional PO" value={draft.customerPo} onChange={(event) => setDraft((current) => ({ ...current, customerPo: event.target.value }))} /></td>
                    </tr></tbody>
                </table>
            </div>
            <footer className="job-book-entry-footer">
                <span>Dataverse allocates the next unique number on save</span>
                <button type="button" className="job-book-primary" disabled={savingIntake || !draft.description.trim() || !addressIsAccepted(draft) || !equipmentIsAccepted(draft)} title={!equipmentIsAccepted(draft) ? 'Select Equipment or explicitly keep it as unconfigured.' : !draft.description.trim() ? 'Enter a Job description before submitting.' : !addressIsAccepted(draft) ? 'Select a verified address or confirm it was not found.' : undefined} onClick={() => void submitPrototypeJob()}>{savingIntake ? 'Allocating…' : 'Add to Job Book'}</button>
            </footer>
        </section>

        {saveError && <p className="job-book-save-error" role="alert">{saveError}</p>}

        <details className="job-book-filter-panel">
            <summary><span>Filters</span>{activeFilterCount > 0 && <strong>{activeFilterCount} active</strong>}</summary>
            <section className="job-book-filterbar" aria-label="Filter Job Book entries">
                <label className="job-book-filter-search"><span>Search all columns</span><input type="search" placeholder="Job number, description, PO, address…" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></label>
                <label><span>Date</span><input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} /></label>
                <label><span>Mechanic</span><input type="search" list="job-book-filter-mechanics" placeholder="Search mechanic" value={filters.mechanic} onChange={(event) => setFilters((current) => ({ ...current, mechanic: event.target.value }))} /></label>
                <label><span>Equipment</span><input type="search" placeholder="Fleet, serial, make or model" value={filters.equipment} onChange={(event) => setFilters((current) => ({ ...current, equipment: event.target.value }))} /></label>
                <label><span>Customer / Site</span><input type="search" list="job-book-filter-customer-sites" placeholder="Search customer or site" value={filters.customerSite} onChange={(event) => setFilters((current) => ({ ...current, customerSite: event.target.value }))} /></label>
                <button type="button" disabled={!filtersActive} onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
                <datalist id="job-book-filter-mechanics">{mechanicFilterOptions.map((value) => <option key={value} value={value} />)}</datalist>
                <datalist id="job-book-filter-customer-sites">{customerSiteFilterOptions.map((value) => <option key={value} value={value} />)}</datalist>
            </section>
        </details>

        <section className="job-book-grid-wrap" aria-label="Job Book Legacy">
            <table className="job-book-grid">
                <thead><tr>
                    <th className="job-number-column">Job Number</th><th className="date-column">Date</th><th className="mechanic-column">Mechanic</th>
                    <th>Equipment</th><th>Customer</th><th className="description-column">Description of the Job</th>
                    <th className="address-column">Site Address</th><th>Customer PO #</th><th className="gt-entry-column">GT Entry</th><th className="timecloud-entry-column">Timecloud Entry</th><th>Actions</th>
                </tr></thead>
                <tbody>{displayedRows.map((row) => {
                    const isEditing = editingRow?.id === row.id
                    const shown = isEditing ? editingRow : row
                    const canSaveEdit = Boolean(shown.description.trim()) && addressIsAccepted(shown) && equipmentIsAccepted(shown)
                    const isIntake = shown.entryStage === JOB_BOOK_ENTRY_STAGES.INTAKE
                    const canUpdateEntryMarkers = Boolean(row.intakeRecordId) || row.entrySource === 'dataverse-job'
                    return <tr key={row.id} className={`${shown.equipmentReviewRequired ? 'equipment-unconfigured ' : ''}${isEditing ? 'job-book-row-editing' : ''}`.trim() || undefined}>
                        <td className="job-number-column"><span className="job-book-number-value"><strong>{shown.jobNumber}</strong>{shown.entryStage === JOB_BOOK_ENTRY_STAGES.PROMOTED && <span className="job-book-managed-indicator" title="Managed Job" aria-label="Managed Job">✓</span>}</span></td>
                        <td className="date-column"><span className="job-book-readonly-date" aria-label="Job creation date">{displayDate(shown.date)}</span></td>
                        <td className="mechanic-column">{isEditing
                            ? <MechanicPicker key={`${shown.id}-${shown.mechanicId}-${shown.mechanicName}`} value={shown.mechanicName} mechanics={mechanics}
                                onChange={(mechanicId, mechanicName) => setEditingRow((current) => current ? { ...current, mechanicId, mechanicName } : current)} />
                            : <span className="job-book-table-value">{shown.mechanicName || '—'}</span>}</td>
                        <td className={isEditing ? `fleet-cell${!equipmentIsAccepted(shown) ? ' job-book-required-missing' : ''}` : undefined}>{isEditing
                            ? shown.equipmentReviewRequired
                                ? <button type="button" className="job-book-unconfigured-link" onClick={() => openMachineDialog('edit')}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                                : <EquipmentPicker id={`job-book-edit-equipment-${shown.id}`} key={`${shown.id}-${shown.equipmentId}`} value={shown.equipmentId} customerId={shown.customerId} equipment={equipment}
                                    onSelect={(item) => setEditingRow((current) => current ? applyEquipmentToRow(current, item) : current)} onClear={() => setEditingRow((current) => current ? clearEquipmentContext(current, current.customerId, current.customer) : current)} onAdd={() => openMachineDialog('edit')} />
                            : shown.equipmentReviewRequired
                                ? <button type="button" className="job-book-unconfigured-link" onClick={() => { setEditingRow(row); openMachineDialog('edit', row) }}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                                : <span className="job-book-table-value job-book-equipment-value"><strong>{shown.fleet || shown.serial || '—'}</strong>{(shown.make || shown.model) && <small>{[shown.make, shown.model].filter(Boolean).join(' ')}</small>}</span>}</td>
                        <td>{isEditing
                            ? <CustomerPicker id={`job-book-edit-customer-${shown.id}`} value={shown.customerId} customerName={shown.customer} customers={customers} equipment={equipment} site={shown.site} loading={machineReferencesLoading}
                                onOpen={ensureMachineReferenceData} onChange={(customerId, customerName) => setEditingRow((current) => current ? applyCustomerSelection(current, customerId, customerName) : current)} />
                            : <span className="job-book-table-value job-book-customer-value"><strong>{shown.customer || '—'}</strong>{shown.site && <small>{shown.site}</small>}</span>}</td>
                        <td className={isEditing && !shown.description.trim() ? 'job-book-required-missing' : undefined}>{isEditing
                            ? <textarea required maxLength={JOB_DESCRIPTION_MAX_LENGTH} aria-label={`Description for Job ${shown.jobNumber} (required)`} placeholder="Required" rows={2} value={shown.description} onChange={(event) => setEditingRow((current) => current ? { ...current, description: event.target.value } : current)} />
                            : <span className="job-book-table-value description">{shown.description || '—'}</span>}</td>
                        <td className={isEditing ? 'job-book-address-cell' : undefined}>{isEditing
                            ? <div className="job-book-address-editor"><VerifiedAddressField compact verified={shown.addressVerified} value={shown.address}
                                onChange={(address, selection) => setEditingRow((current) => current ? { ...current, address, addressVerified: Boolean(selection), addressNotFoundConfirmed: false } : current)} />
                                {shown.address.trim() && !shown.addressVerified && <label className="job-book-address-confirm"><input type="checkbox" checked={shown.addressNotFoundConfirmed} onChange={(event) => setEditingRow((current) => current ? { ...current, addressNotFoundConfirmed: event.target.checked } : current)} /><span>Address<br />not found</span></label>}</div>
                            : shown.address
                                ? <span className="job-book-table-value job-book-address-value"><strong>{splitSiteAddress(shown.address).street}</strong>{splitSiteAddress(shown.address).locality && <small>{splitSiteAddress(shown.address).locality}</small>}</span>
                                : <span className="job-book-table-value">—</span>}</td>
                        <td>{isIntake && isEditing
                            ? <input className="job-book-table-edit" aria-label={`Customer PO for Job ${shown.jobNumber}`} value={shown.customerPo} placeholder="Add PO number" onChange={(event) => setEditingRow((current) => current ? { ...current, customerPo: event.target.value } : current)} />
                            : <span className="job-book-table-value">{row.customerPo || '—'}</span>}</td>
                        <td className="gt-entry-column">{canUpdateEntryMarkers ? <label className={`job-book-table-check ${row.entered ? 'complete' : ''}`}><input type="checkbox" aria-label={`GT Entry completed for Job ${row.jobNumber}`} disabled={savingEntryMarkers.has(row.id)} checked={row.entered} onChange={(event) => void updateRowField(row, 'entered', event.target.checked)} />{savingEntryMarkers.has(row.id) ? <span>Saving</span> : row.entered ? <span>Done</span> : null}</label> : <span className="job-book-status-pill">Unavailable</span>}</td>
                        <td className="timecloud-entry-column">{canUpdateEntryMarkers ? <label className={`job-book-table-check ${row.timecloudEntered ? 'complete' : ''}`}><input type="checkbox" aria-label={`Timecloud Entry completed for Job ${row.jobNumber}`} disabled={savingEntryMarkers.has(row.id)} checked={row.timecloudEntered} onChange={(event) => void updateRowField(row, 'timecloudEntered', event.target.checked)} />{savingEntryMarkers.has(row.id) ? <span>Saving</span> : row.timecloudEntered ? <span>Done</span> : null}</label> : <span className="job-book-status-pill">Unavailable</span>}</td>
                        <td>{isEditing
                            ? <div className="job-book-row-actions"><button type="button" className="save" disabled={!canSaveEdit} title={!equipmentIsAccepted(shown) ? 'Select Equipment or explicitly keep it as unconfigured.' : !shown.description.trim() ? 'Enter a Job description before saving.' : !addressIsAccepted(shown) ? 'Select a verified address or confirm it was not found.' : undefined} onClick={() => void saveEditedRow()}>Save changes</button><button type="button" onClick={() => setEditingRow(null)}>Cancel</button></div>
                            : isIntake
                                ? <div className="job-book-row-actions"><button type="button" className="save" onClick={() => setPromotionRow(row)}>Prepare promotion</button><button type="button" onClick={() => setEditingRow(row)}>Edit row</button></div>
                                : <button type="button" className="job-book-edit-row" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(shown.linkedJobId)}`)}>Open Job</button>}</td>
                    </tr>
                })}</tbody>
            </table>
        </section>
        </section>

        {promotionRow && promotionReadiness && <div className="job-book-dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPromotionRow(null)
        }}>
            <section className="job-book-dialog job-book-promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-dialog-title">
                <header><div><span className="job-book-eyebrow">REVIEWED HANDOFF</span><h2 id="promotion-dialog-title">Prepare Job {promotionRow.jobNumber}</h2></div><button type="button" aria-label="Close" onClick={() => setPromotionRow(null)}>×</button></header>
                <p className="job-book-dialog-note">Promotion will create one managed Job using this allocated number, link it back to this Intake entry, and then mark the entry Promoted.</p>
                <div className="job-book-promotion-summary">
                    <div><span>Equipment</span><strong>{promotionRow.fleet || promotionRow.serial || 'Unconfigured'}</strong></div>
                    <div><span>Customer / Site</span><strong>{[promotionRow.customer, promotionRow.site].filter(Boolean).join(' · ') || 'Not set'}</strong></div>
                    <div><span>Description</span><strong>{promotionRow.description}</strong></div>
                </div>
                <label className="job-book-promotion-type">Managed Job type<select value={promotionJobType} onChange={(event) => setPromotionJobType(Number(event.target.value) as JobType)}>{STANDARD_JOB_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                {!promotionReadiness.ready && <div className="job-book-promotion-warning"><strong>Review required before promotion</strong><ul>{promotionReadiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
                <div className="job-book-promotion-rule"><strong>Promotion stops here safely.</strong><span>The Intake entry is already live in Dataverse. No managed Job will be created until the atomic promotion operation is connected.</span></div>
                <footer>
                    <button type="button" className="job-book-secondary" onClick={() => setPromotionRow(null)}>Close</button>
                    <button type="button" className="job-book-primary" disabled title="Dataverse promotion is not enabled in this prototype.">Create managed Job</button>
                </footer>
            </section>
        </div>}

        {machineDialogOpen && <div className="job-book-dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMachineDialogOpen(false)
        }}>
            <section className="job-book-dialog" role="dialog" aria-modal="true" aria-labelledby="machine-dialog-title">
                <header><div><span className="job-book-eyebrow">LEGACY JOB BOOK MACHINE</span><h2 id="machine-dialog-title">Add machine details</h2></div><button type="button" aria-label="Close" onClick={() => setMachineDialogOpen(false)}>×</button></header>
                <p className="job-book-dialog-note">This only fills the Job Book row. It will not create Equipment, a Customer, or a Site in Dataverse.</p>
                {machineReferencesLoading && <p className="job-book-dialog-note" role="status">Loading Customer and Site suggestions…</p>}
                {machineReferencesError && <p className="job-book-dialog-error">{machineReferencesError}</p>}
                <div className="job-book-form-grid">
                    <label>Fleet number<input autoFocus value={machineDraft.fleet} onChange={(event) => setMachineDraft((current) => ({ ...current, fleet: event.target.value }))} /></label>
                    <label>Serial number<input value={machineDraft.serial} onChange={(event) => setMachineDraft((current) => ({ ...current, serial: event.target.value }))} /></label>
                    <label>Make<input value={machineDraft.make} onChange={(event) => setMachineDraft((current) => ({ ...current, make: event.target.value }))} /></label>
                    <label>Model<input value={machineDraft.model} onChange={(event) => setMachineDraft((current) => ({ ...current, model: event.target.value }))} /></label>
                    <label>Customer<input list="job-book-customers" value={machineDraft.customer} onChange={(event) => setMachineDraft((current) => ({ ...current, customer: event.target.value, customerId: '', site: '', siteId: '' }))} /></label>
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
