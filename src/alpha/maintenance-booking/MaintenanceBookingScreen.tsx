import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { Link } from 'react-router-dom'
import PageHeader from '../shared/page-header/PageHeader'
import { useEquipmentManager } from '../equipment/hooks/useEquipmentManager'
import { useEquipmentJobHistory } from '../equipment/hooks/useEquipmentJobHistory'
import EquipmentJobCreateDrawer from '../equipment/components/EquipmentJobCreateDrawer'
import EquipmentDrawer from '../equipment/components/EquipmentDrawer'
import EditDrawerFormDialog from '../shared/drawer/EditDrawerFormDialog'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import { fetchSiteContactsForSite } from '../jobs/services/siteContactsApi'
import { createContact, createSiteContact } from '../jobs/services/contactsApi'
import type { SiteContact } from '../jobs/types/siteContact.types'
import { getJobTypeLabel, JOB_TYPES } from '../jobs/types/jobType.types'
import { isOpenJob } from '../jobs/types/jobOpen'
import { JOB_STATUS_OPTIONS } from '../jobs/types/jobStatus.types'
import type { Job } from '../jobs/types/job.types'
import type { Equipment } from '../jobs/types/equipment.types'
import {
    daysFromToday,
    filterMaintenanceExclusions,
    isMaintenanceRowExcluded,
    maintenanceExclusionId,
    matchMaintenanceRow,
    parseMaintenanceExport,
    readMaintenanceWorkspace,
    writeMaintenanceWorkspace,
    type MaintenanceAction,
    type MaintenanceActionStatus,
    type MaintenanceExclusion,
    type MaintenanceImportRow,
} from './maintenanceBooking'
import './MaintenanceBookingScreen.css'

type QueueFilter = 'action' | 'all' | 'waiting' | 'booked' | 'exceptions'
type WorkspaceView = 'review' | 'todo'

const STATUS_LABELS: Record<MaintenanceActionStatus, string> = {
    unreviewed: 'Needs review',
    contact: 'Contact / follow up',
    'awaiting-reply': 'Awaiting reply',
    booked: 'Booked',
    'not-due': 'Not due yet',
    'no-longer-on-site': 'No longer on site',
    'unable-to-contact': 'Unable to contact',
}

const formatDate = (value?: string | null) => {
    if (!value) return 'Not recorded'
    const date = new Date(`${value.slice(0, 10)}T00:00:00`)
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

const todayDateOnly = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function defaultAction(): MaintenanceAction {
    return { status: 'unreviewed', nextActionDate: '', note: '', updatedAt: '' }
}

function dueLabel(row: MaintenanceImportRow) {
    const days = daysFromToday(row.dueDate)
    if (days == null) return row.sourceDueDate || 'No due date'
    if (days < 0) return `${Math.abs(days)} days overdue`
    if (days === 0) return 'Due today'
    return `Due in ${days} days`
}

function jobDate(job: { gr_completeddate?: string | null; createdon: string }) {
    return job.gr_completeddate || job.createdon
}

function matchesFilter(filter: QueueFilter, action: MaintenanceAction) {
    if (filter === 'all') return true
    if (filter === 'waiting') return action.status === 'awaiting-reply' || action.status === 'unable-to-contact'
    if (filter === 'booked') return action.status === 'booked'
    if (filter === 'exceptions') return action.status === 'not-due' || action.status === 'no-longer-on-site'
    return action.status === 'unreviewed' || action.status === 'contact'
}

export default function MaintenanceBookingScreen() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(account)
    const storageKey = `service-operations:maintenance-booking:v1:${signedInUser?.storageId ?? 'account'}`
    const initialWorkspace = useMemo(() => readMaintenanceWorkspace(globalThis.localStorage, storageKey), [storageKey])
    const {
        equipment,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        updateEquipment,
        createCustomer,
        createSite,
        deleteEquipment,
        searchEquipmentCustomers,
        loadEquipmentCustomerSites,
        loadEquipmentServicePlans,
        saveEquipmentMaintenanceHistory,
    } = useEquipmentManager({
        loadGlobalRelationships: false,
        loadGlobalServicePlans: false,
    })
    const [rows, setRows] = useState<MaintenanceImportRow[]>(initialWorkspace.rows)
    const [actions, setActions] = useState<Record<string, MaintenanceAction>>(initialWorkspace.actions)
    const [exclusions, setExclusions] = useState<MaintenanceExclusion[]>(initialWorkspace.exclusions)
    const [selectedId, setSelectedId] = useState(initialWorkspace.rows[0]?.id ?? '')
    const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('review')
    const [reviewSelection, setReviewSelection] = useState<Set<string>>(new Set())
    const [filter, setFilter] = useState<QueueFilter>('action')
    const [search, setSearch] = useState('')
    const [importOpen, setImportOpen] = useState(initialWorkspace.rows.length === 0)
    const [pasteValue, setPasteValue] = useState('')
    const [importError, setImportError] = useState('')
    const [contacts, setContacts] = useState<SiteContact[]>([])
    const [contactsLoading, setContactsLoading] = useState(false)
    const [contactsError, setContactsError] = useState('')
    const [contactsRefresh, setContactsRefresh] = useState(0)
    const [bookingEquipment, setBookingEquipment] = useState<Equipment | null>(null)
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [contactDialogOpen, setContactDialogOpen] = useState(false)
    const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '' })
    const [contactSaveError, setContactSaveError] = useState('')
    const [contactSaving, setContactSaving] = useState(false)
    const [exclusionForm, setExclusionForm] = useState<{ scope: MaintenanceExclusion['scope']; reason: string }>({ scope: 'customer', reason: 'Debt collection' })
    const [importResult, setImportResult] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        writeMaintenanceWorkspace(globalThis.localStorage, storageKey, rows, actions, exclusions)
    }, [actions, exclusions, rows, storageKey])

    const matchedRows = useMemo(() => rows.map((row) => ({ row, match: matchMaintenanceRow(row, equipment) })), [equipment, rows])
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const visibleRows = useMemo(() => matchedRows
        .filter(({ row }) => workspaceView === 'review'
            ? !(actions[row.id] ?? defaultAction()).inTodo
            : Boolean((actions[row.id] ?? defaultAction()).inTodo))
        .filter(({ row }) => workspaceView === 'review' || matchesFilter(filter, actions[row.id] ?? defaultAction()))
        .filter(({ row, match }) => !normalizedSearch || [row.code, row.description, row.customer, match.equipment?.gr_fleet, match.equipment?.gr_Site?.gr_name]
            .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch)))
        .sort((left, right) => (left.row.dueDate || '9999').localeCompare(right.row.dueDate || '9999')),
    [actions, filter, matchedRows, normalizedSearch, workspaceView])

    useEffect(() => {
        if (!visibleRows.length) return
        if (!visibleRows.some(({ row }) => row.id === selectedId)) setSelectedId(visibleRows[0].row.id)
    }, [selectedId, visibleRows])

    const selected = matchedRows.find(({ row }) => row.id === selectedId) ?? visibleRows[0] ?? null
    const selectedAction = selected ? actions[selected.row.id] ?? defaultAction() : defaultAction()
    const history = useEquipmentJobHistory(
        workspaceView === 'todo' || editingEquipment
            ? selected?.match.equipment?.gr_equipmentid
            : '',
    )
    const latestJob = history.jobs[0]
    const latestService = history.jobs.find((job) => job.gr_jobtype === JOB_TYPES.SERVICE)
    const openJobs = history.jobs.filter(isOpenJob)
    const selectedSiteId = selected?.match.equipment?.gr_Site?.gr_siteid ?? ''

    useEffect(() => {
        let cancelled = false
        if (!account || !selectedSiteId || workspaceView !== 'todo') {
            setContacts([])
            setContactsError('')
            return
        }
        const controller = new AbortController()
        setContactsLoading(true)
        setContactsError('')
        void acquireDataverseAccessToken(instance, account)
            .then((token) => fetchSiteContactsForSite(token, selectedSiteId, controller.signal))
            .then((result) => { if (!cancelled) setContacts(result) })
            .catch((error) => {
                if (!cancelled && !controller.signal.aborted) setContactsError(error instanceof Error ? error.message : 'Contacts could not be loaded.')
            })
            .finally(() => { if (!cancelled) setContactsLoading(false) })
        return () => { cancelled = true; controller.abort() }
    }, [account, contactsRefresh, instance, selectedSiteId, workspaceView])

    const counts = useMemo(() => {
        const values = rows.map((row) => actions[row.id] ?? defaultAction())
        return {
            review: values.filter((action) => !action.inTodo).length,
            action: values.filter((action) => action.inTodo && matchesFilter('action', action)).length,
            waiting: values.filter((action) => action.inTodo && matchesFilter('waiting', action)).length,
            booked: values.filter((action) => action.inTodo && matchesFilter('booked', action)).length,
            exceptions: values.filter((action) => action.inTodo && matchesFilter('exceptions', action)).length,
        }
    }, [actions, rows])

    const updateAction = (patch: Partial<MaintenanceAction>) => {
        if (!selected) return
        setActions((current) => ({
            ...current,
            [selected.row.id]: {
                ...(current[selected.row.id] ?? defaultAction()),
                ...patch,
                updatedAt: new Date().toISOString(),
            },
        }))
    }

    const addRowsToTodo = (rowIds: readonly string[]) => {
        if (!rowIds.length) return
        const addedAt = new Date().toISOString()
        setActions((current) => {
            const next = { ...current }
            rowIds.forEach((rowId) => {
                next[rowId] = {
                    ...(current[rowId] ?? defaultAction()),
                    inTodo: true,
                    addedToTodoAt: addedAt,
                    updatedAt: addedAt,
                }
            })
            return next
        })
        setReviewSelection(new Set())
    }

    const returnSelectedToReview = () => {
        if (!selected) return
        updateAction({ inTodo: false, addedToTodoAt: undefined })
        setWorkspaceView('review')
    }

    const applyImport = (text: string) => {
        try {
            const parsed = parseMaintenanceExport(text)
            const { included, excluded } = filterMaintenanceExclusions(parsed, exclusions)
            setRows(included)
            setSelectedId(included[0]?.id ?? '')
            setPasteValue('')
            setImportError('')
            setImportOpen(false)
            setFilter('action')
            setWorkspaceView('review')
            setReviewSelection(new Set())
            setImportResult(excluded.length
                ? `${included.length} records imported. ${excluded.length} ${excluded.length === 1 ? 'record was' : 'records were'} skipped by your do-not-import rules.`
                : `${included.length} records imported. No records were excluded.`)
        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'The maintenance export could not be read.')
        }
    }

    const saveExclusion = () => {
        if (!selected) return
        const exclusion: MaintenanceExclusion = {
            id: maintenanceExclusionId(exclusionForm.scope, selected.row.code, selected.row.customer),
            scope: exclusionForm.scope,
            customer: selected.row.customer,
            ...(exclusionForm.scope === 'equipment' ? { code: selected.row.code } : {}),
            reason: exclusionForm.reason,
            createdAt: new Date().toISOString(),
        }
        setExclusions((current) => [...current.filter((item) => item.id !== exclusion.id), exclusion])
        setRows((current) => current.filter((row) => !isMaintenanceRowExcluded(row, [exclusion])))
        setReviewSelection((current) => new Set([...current].filter((id) => id !== selected.row.id)))
        setImportResult(exclusion.scope === 'customer'
            ? `${selected.row.customer} is now excluded from future imports.`
            : `${selected.row.code} is now excluded from future imports.`)
    }

    const copyContactSummary = async () => {
        if (!selected) return
        const bestContact = contacts.find((link) => link.gr_Contact?.gr_contactid === selectedAction.preferredContactId)?.gr_Contact
            ?? contacts[0]?.gr_Contact
        const lines = [
            selected.row.customer,
            `${selected.row.code} — ${selected.row.description}`,
            `PM due: ${formatDate(selected.row.dueDate)}`,
            `Contact: ${bestContact?.gr_name || selected.row.contact || 'Not recorded'}`,
            `Phone: ${bestContact?.gr_phone || selected.row.phone || 'Not recorded'}`,
            bestContact?.gr_email ? `Email: ${bestContact.gr_email}` : '',
        ].filter(Boolean)
        await navigator.clipboard.writeText(lines.join('\n'))
    }

    const saveContact = async () => {
        if (!account || !selectedSiteId || !contactForm.name.trim()) return
        setContactSaving(true)
        setContactSaveError('')
        try {
            const token = await acquireDataverseAccessToken(instance, account)
            const contactId = await createContact(token, {
                name: contactForm.name.trim(),
                phone: contactForm.phone.trim() || undefined,
                email: contactForm.email.trim() || undefined,
            })
            await createSiteContact(token, selectedSiteId, contactId)
            updateAction({ preferredContactId: contactId })
            setContactForm({ name: '', phone: '', email: '' })
            setContactDialogOpen(false)
            setContactsRefresh((current) => current + 1)
        } catch (error) {
            setContactSaveError(error instanceof Error ? error.message : 'The contact could not be saved.')
        } finally {
            setContactSaving(false)
        }
    }

    const attachExistingJob = (job: Job) => {
        updateAction({
            status: 'booked',
            linkedJobId: job.gr_jobid,
            linkedJobNumber: job.gr_jobnumber || undefined,
            nextActionDate: '',
        })
    }

    const detachExistingJob = () => {
        updateAction({
            status: 'unreviewed',
            linkedJobId: undefined,
            linkedJobNumber: undefined,
        })
    }

    return <main className="maintenance-booking-screen">
        <PageHeader
            eyebrow="Service planning"
            title="Maintenance booking"
            subtitle="Work through the Greentree overdue list, find the right customer, and leave every machine with a clear next action."
            actions={<button type="button" className="maintenance-import-button" onClick={() => setImportOpen(true)}>{rows.length ? 'Replace Greentree list' : 'Import Greentree list'}</button>}
        />

        {rows.length > 0 && <section className="maintenance-metrics" aria-label="Maintenance queue summary">
            {([
                ['review', 'Review inbox', counts.review],
                ['action', 'To action', counts.action],
                ['waiting', 'Waiting', counts.waiting],
                ['booked', 'Booked', counts.booked],
                ['exceptions', 'Set aside', counts.exceptions],
            ] as const).map(([key, label, count]) => <button key={key} type="button" className={(key === 'review' ? workspaceView === 'review' : workspaceView === 'todo' && filter === key) ? 'active' : ''} onClick={() => {
                if (key === 'review') setWorkspaceView('review')
                else { setWorkspaceView('todo'); setFilter(key) }
            }}><span>{label}</span><strong>{count}</strong></button>)}
            <div><span>Total imported</span><strong>{rows.length}</strong></div>
        </section>}
        {importResult && <div className="maintenance-import-result" role="status"><span>{importResult}</span><button type="button" onClick={() => setImportResult('')}>Dismiss</button></div>}

        {importOpen && <section className="maintenance-import-panel" aria-labelledby="maintenance-import-heading">
            <div>
                <span className="maintenance-step">Step 1</span>
                <h2 id="maintenance-import-heading">Bring in the Greentree table</h2>
                <p>Paste the six columns exactly as exported: Code, Description, Customer, Contact, Phone and PM Due Date.</p>
            </div>
            <textarea value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder={'Code\tDescription\tCustomer\tContact\tPhone\tPM Due Date\nFN1234\tFleet Number 1234\tExample Customer\tAlex\t021 123 4567\t12/08/2026'} aria-label="Greentree maintenance table" />
            {importError && <p className="maintenance-error" role="alert">{importError}</p>}
            <div className="maintenance-import-actions">
                <button type="button" className="primary" onClick={() => applyImport(pasteValue)}>Import pasted table</button>
                <button type="button" onClick={() => fileInputRef.current?.click()}>Choose export file</button>
                {rows.length > 0 && <button type="button" className="quiet" onClick={() => { setImportOpen(false); setImportError('') }}>Cancel</button>}
                <input ref={fileInputRef} type="file" accept=".txt,.tsv,.csv,text/plain,text/tab-separated-values" hidden onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void file.text().then(applyImport)
                    event.currentTarget.value = ''
                }} />
            </div>
            {exclusions.length > 0 && <div className="maintenance-exclusion-list">
                <div><strong>Do-not-import rules</strong><span>These are skipped automatically every time you paste a new list.</span></div>
                {exclusions.map((exclusion) => <div className="maintenance-exclusion-row" key={exclusion.id}><span><strong>{exclusion.scope === 'customer' ? exclusion.customer : `${exclusion.code} — ${exclusion.customer}`}</strong><small>{exclusion.reason} · {exclusion.scope === 'customer' ? 'Whole customer' : 'Equipment only'}</small></span><button type="button" onClick={() => { setExclusions((current) => current.filter((item) => item.id !== exclusion.id)); setImportResult(`${exclusion.customer} can be included again on the next import.`) }}>Restore</button></div>)}
            </div>}
        </section>}

        {!rows.length && !importOpen && <section className="maintenance-empty"><h2>No maintenance list loaded</h2><p>Import your Greentree export to begin.</p><button type="button" onClick={() => setImportOpen(true)}>Import list</button></section>}

        {rows.length > 0 && <div className="maintenance-workspace">
            <section className="maintenance-queue" aria-label="Maintenance booking queue">
                <div className="maintenance-queue-toolbar">
                    <label><span className="sr-only">Search maintenance queue</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment or customer" /></label>
                    {workspaceView === 'todo' ? <select value={filter} onChange={(event) => setFilter(event.target.value as QueueFilter)} aria-label="Queue filter">
                        <option value="action">To action ({counts.action})</option>
                        <option value="all">All to-dos ({rows.length - counts.review})</option>
                        <option value="waiting">Waiting ({counts.waiting})</option>
                        <option value="booked">Booked ({counts.booked})</option>
                        <option value="exceptions">Set aside ({counts.exceptions})</option>
                    </select> : <button type="button" className="maintenance-review-select-all" onClick={() => {
                        const visibleIds = visibleRows.map(({ row }) => row.id)
                        const allSelected = visibleIds.length > 0 && visibleIds.every((id) => reviewSelection.has(id))
                        setReviewSelection(allSelected ? new Set() : new Set(visibleIds))
                    }}>{visibleRows.length > 0 && visibleRows.every(({ row }) => reviewSelection.has(row.id)) ? 'Clear selection' : 'Select all shown'}</button>}
                </div>
                {workspaceView === 'review' && <div className="maintenance-review-intro"><div><strong>Review inbox</strong><span>Tick the records you want to work on now. The rest stay here for later.</span></div><button type="button" disabled={!reviewSelection.size} onClick={() => { addRowsToTodo([...reviewSelection]); setWorkspaceView('todo'); setFilter('action') }}>Add selected to to-do ({reviewSelection.size})</button></div>}
                {isLoading && <div className="maintenance-list-state">Matching against the equipment register…</div>}
                {loadError && <div className="maintenance-list-state error"><span>{loadError}</span><button type="button" onClick={() => { void reload() }}>Try again</button></div>}
                {!isLoading && !visibleRows.length && <div className="maintenance-list-state">Nothing in this view.</div>}
                <div className="maintenance-record-list">
                    {visibleRows.map(({ row, match }) => {
                        const action = actions[row.id] ?? defaultAction()
                        return <div role="button" tabIndex={0} key={row.id} className={selected?.row.id === row.id ? 'maintenance-record active' : 'maintenance-record'} onClick={() => setSelectedId(row.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(row.id) } }}>
                            {workspaceView === 'review' && <label className="maintenance-review-checkbox" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={reviewSelection.has(row.id)} aria-label={`Select ${row.code} for the to-do queue`} onChange={(event) => setReviewSelection((current) => {
                                const next = new Set(current)
                                if (event.target.checked) next.add(row.id)
                                else next.delete(row.id)
                                return next
                            })} /></label>}
                            <span className={`maintenance-due-dot ${daysFromToday(row.dueDate) != null && daysFromToday(row.dueDate)! < 0 ? 'overdue' : ''}`} aria-hidden="true" />
                            <span className="maintenance-record-copy"><strong>{row.code}</strong><span>{row.customer}</span><small>{row.description}</small></span>
                            <span className="maintenance-record-meta">{workspaceView === 'todo' && <span className={`maintenance-status-pill status-${action.status}`}>{STATUS_LABELS[action.status]}</span>}<small>{dueLabel(row)}</small>{match.kind === 'none' && <em>Not matched</em>}</span>
                        </div>
                    })}
                </div>
            </section>

            <aside className="maintenance-detail" aria-label="Selected maintenance record">
                {!selected ? <div className="maintenance-list-state">Select a maintenance record.</div> : <>
                    <header className="maintenance-detail-header">
                        <div><span>{selected.row.code}</span><h2>{selected.row.description || selected.row.code}</h2><p>{selected.row.customer}</p></div>
                        <div className="maintenance-detail-header-actions">
                            <span className={`maintenance-match-badge ${selected.match.kind}`}>{selected.match.kind === 'exact' ? 'Equipment matched' : selected.match.kind === 'likely' ? 'Likely match' : 'Needs matching'}</span>
                            {workspaceView === 'todo' && selected.match.equipment && <button type="button" className="maintenance-prejob-edit" onClick={() => setEditingEquipment(selected.match.equipment)}>Open equipment</button>}
                            {workspaceView === 'todo' && <button type="button" className="maintenance-return-review" onClick={returnSelectedToReview}>Return to review</button>}
                        </div>
                    </header>

                    <section className="maintenance-due-card">
                        <div><span>Greentree PM due</span><strong>{formatDate(selected.row.dueDate)}</strong><small>{dueLabel(selected.row)}</small></div>
                        <div><span>Site</span><strong>{selected.match.equipment?.gr_Site?.gr_name || 'Not found in equipment register'}</strong><small>{selected.match.equipment?.gr_Site?.gr_address || selected.match.equipment?.gr_Site?.gr_Customer?.gr_name || 'Check the Greentree record'}</small></div>
                    </section>

                    {workspaceView === 'review' ? <section className="maintenance-review-decision">
                        <div className="maintenance-review-decision-heading"><span className="maintenance-step">Quick review</span><h3>What should happen with this item?</h3><p>Only prepare the equipment record here. Customer contact and booking work begins after it moves to To-do.</p></div>
                        <div className="maintenance-review-options">
                            <article>
                                <span className="maintenance-review-option-number">1</span>
                                <div><strong>Edit equipment and site</strong><p>Correct the equipment details or assign its customer and site before adding it to the queue.</p></div>
                                {selected.match.equipment
                                    ? <button type="button" onClick={() => setEditingEquipment(selected.match.equipment)}>Edit equipment &amp; site</button>
                                    : <Link to={`/equipment?search=${encodeURIComponent(selected.row.code)}`}>Find in Equipment</Link>}
                            </article>
                            <article>
                                <span className="maintenance-review-option-number">2</span>
                                <div><strong>Add to the working queue</strong><p>Move this into To-do for history checking, contacting the customer, follow-up and booking.</p></div>
                                <button type="button" className="primary" onClick={() => { addRowsToTodo([selected.row.id]); setWorkspaceView('todo'); setFilter('action') }}>Add to To-do</button>
                            </article>
                            <article className="exclude">
                                <span className="maintenance-review-option-number">3</span>
                                <div><strong>Exclude from future reviews</strong><p>Use for debt collection, closed customers, disposed equipment, duplicates or anything you should not review again.</p></div>
                                <div className="maintenance-review-exclusion-controls">
                                    <label><span className="sr-only">Exclusion scope</span><select value={exclusionForm.scope} onChange={(event) => setExclusionForm((current) => ({ ...current, scope: event.target.value as MaintenanceExclusion['scope'] }))}><option value="customer">Whole customer</option><option value="equipment">This equipment only</option></select></label>
                                    <label><span className="sr-only">Exclusion reason</span><select value={exclusionForm.reason} onChange={(event) => setExclusionForm((current) => ({ ...current, reason: event.target.value }))}><option>Debt collection</option><option>Customer closed</option><option>Do not service</option><option>Equipment sold or disposed</option><option>Duplicate record</option><option>Other</option></select></label>
                                    <button type="button" onClick={saveExclusion}>Exclude</button>
                                </div>
                            </article>
                        </div>
                    </section> : <>
                    {selectedAction.linkedJobId && <section className="maintenance-linked-job" aria-label="Attached job">
                        <div><span>Attached open job</span><strong>{selectedAction.linkedJobNumber ? `Job ${selectedAction.linkedJobNumber}` : 'Open job'}</strong><small>This maintenance item is filed under Booked and no longer appears in To action.</small></div>
                        <div><Link to={`/jobs?jobId=${encodeURIComponent(selectedAction.linkedJobId)}`}>Open job</Link><button type="button" onClick={detachExistingJob}>Detach</button></div>
                    </section>}
                    <section className="maintenance-detail-section">
                        <div className="maintenance-section-heading"><div><span className="maintenance-step">Step 2</span><h3>Confirm the history</h3></div></div>
                        {!selected.match.equipment ? <p className="maintenance-help">No confident match was found. Search the Equipment page using <strong>{selected.row.code}</strong>, then add it as a Fleet or Alternate Fleet Number so future imports match automatically.</p>
                            : history.isLoading ? <p className="maintenance-help">Loading job history…</p>
                                : history.error ? <p className="maintenance-error">{history.error}</p>
                                    : <div className="maintenance-history-grid">
                                        <div><span>Last service</span><strong>{latestService ? formatDate(jobDate(latestService)) : 'No service found'}</strong><small>{latestService?.gr_jobnumber ? `Job ${latestService.gr_jobnumber}` : latestService?.gr_description || 'No recorded service job'}</small></div>
                                        <div><span>Last job</span><strong>{latestJob ? formatDate(jobDate(latestJob)) : 'No jobs found'}</strong><small>{latestJob?.gr_jobnumber ? `Job ${latestJob.gr_jobnumber}` : latestJob?.gr_description || 'No job history'}</small></div>
                                    </div>}
                        {!history.isLoading && !history.error && !selectedAction.linkedJobId && <div className="maintenance-open-jobs">
                            <div className="maintenance-open-jobs-heading"><strong>Already have an open job?</strong><span>Attach it here instead of creating a duplicate.</span></div>
                            {openJobs.length === 0
                                ? <p>No open jobs are linked to this equipment.</p>
                                : openJobs.map((job) => <article key={job.gr_jobid}>
                                    <div><strong>{job.gr_jobnumber ? `Job ${job.gr_jobnumber}` : 'Job number not set'}</strong><span>{getJobTypeLabel(job.gr_jobtype)} · {JOB_STATUS_OPTIONS.find((option) => option.value === job.gr_status)?.label ?? 'Open'}</span><small>{job.gr_description || `Created ${formatDate(job.createdon)}`}</small></div>
                                    <div><Link to={`/jobs?jobId=${encodeURIComponent(job.gr_jobid)}`}>View</Link><button type="button" onClick={() => attachExistingJob(job)}>Attach this job</button></div>
                                </article>)}
                        </div>}
                    </section>

                    <section className="maintenance-detail-section">
                        <div className="maintenance-section-heading"><div><span className="maintenance-step">Step 3</span><h3>Choose the job contact</h3></div><div className="maintenance-section-actions"><button type="button" className="text-button" onClick={() => { void copyContactSummary() }}>Copy details</button><button type="button" className="text-button" disabled={!selectedSiteId} onClick={() => { setContactSaveError(''); setContactDialogOpen(true) }}>Add contact</button></div></div>
                        {contactsLoading && <p className="maintenance-help">Finding site contacts…</p>}
                        {contactsError && <p className="maintenance-error">{contactsError}</p>}
                        {!contactsLoading && contacts.length > 0 && <div className="maintenance-contacts">{contacts.map((link) => {
                            const contact = link.gr_Contact
                            if (!contact) return null
                            const selectedContact = selectedAction.preferredContactId === contact.gr_contactid
                            return <div key={link.gr_sitecontactid} className={selectedContact ? 'selected' : ''}><strong>{contact.gr_name}</strong><span>{contact.gr_phone || 'No phone'}{contact.gr_email ? ` · ${contact.gr_email}` : ''}</span><div>{contact.gr_phone && <a href={`tel:${contact.gr_phone}`}>Call</a>}{contact.gr_email && <a href={`mailto:${contact.gr_email}`}>Email</a>}<button type="button" className="maintenance-contact-choice" onClick={() => updateAction({ preferredContactId: contact.gr_contactid })}>{selectedContact ? 'Selected' : 'Use for job'}</button></div></div>
                        })}</div>}
                        {!contactsLoading && !contacts.length && <div className="maintenance-contact-fallback"><strong>{selected.row.contact || 'No contact in export'}</strong><span>{selected.row.phone || (selectedSiteId ? 'No contact is assigned to this site yet' : 'Assign a customer and site before adding a contact')}</span>{selected.row.phone && <a href={`tel:${selected.row.phone}`}>Call</a>}</div>}
                    </section>

                    <section className="maintenance-detail-section maintenance-action-section">
                        <div><span className="maintenance-step">Step 4</span><h3>Leave a clear next action</h3></div>
                        <div className="maintenance-action-grid">
                            <label><span>Status</span><select value={selectedAction.status} onChange={(event) => updateAction({ status: event.target.value as MaintenanceActionStatus })}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                            <label><span>Contact / follow-up date</span><input type="date" value={selectedAction.nextActionDate} onChange={(event) => updateAction({ nextActionDate: event.target.value })} /></label>
                            <label className="maintenance-note-field"><span>Notes</span><textarea value={selectedAction.note} onChange={(event) => updateAction({ note: event.target.value })} placeholder="Who you spoke to, what they said, or what to check next" /></label>
                        </div>
                        <div className="maintenance-quick-actions">
                            <button type="button" onClick={() => updateAction({ status: 'contact', nextActionDate: todayDateOnly() })}>Contact today</button>
                            <button type="button" onClick={() => updateAction({ status: 'awaiting-reply' })}>Awaiting reply</button>
                            <button type="button" onClick={() => updateAction({ status: 'not-due' })}>Not due yet</button>
                            <button type="button" onClick={() => updateAction({ status: 'no-longer-on-site' })}>No longer on site</button>
                        </div>
                        <p className="maintenance-save-note">Queue notes are saved automatically on this device.</p>
                    </section>

                    <footer className="maintenance-booking-footer">
                        <div><strong>Ready to book?</strong><span>Create the Service Job with this equipment and site already selected.</span></div>
                        <button type="button" disabled={!selected.match.equipment} onClick={() => { if (!selectedAction.inTodo) addRowsToTodo([selected.row.id]); setBookingEquipment(selected.match.equipment) }}>Book service job</button>
                    </footer>
                    </>}
                </>}
            </aside>
        </div>}

        {bookingEquipment && <EquipmentJobCreateDrawer equipment={bookingEquipment} initialContactId={selectedAction.preferredContactId} onClose={() => setBookingEquipment(null)} onCreated={async () => {
            updateAction({ status: 'booked', nextActionDate: '' })
            await history.refetch()
        }} />}
        {editingEquipment && <EquipmentDrawer
            mode="edit"
            equipment={editingEquipment}
            equipmentList={equipment}
            customers={editingEquipment.gr_Site?.gr_Customer ? [editingEquipment.gr_Site.gr_Customer] : []}
            sites={editingEquipment.gr_Site ? [{ ...editingEquipment.gr_Site, gr_address: editingEquipment.gr_Site.gr_address ?? '' }] : []}
            jobs={history.jobs}
            isSaving={isSaving}
            saveError={saveError}
            isJobHistoryLoading={history.isLoading}
            jobHistoryError={history.error}
            onRetryJobHistory={() => { void history.refetch().catch(() => undefined) }}
            onLoadServicePlans={loadEquipmentServicePlans}
            onSearchCustomers={searchEquipmentCustomers}
            onLoadCustomerSites={loadEquipmentCustomerSites}
            onCreateCustomer={createCustomer}
            onCreateSite={createSite}
            onClose={() => setEditingEquipment(null)}
            onSave={async (input, resolvedSite) => {
                const updated = await updateEquipment(editingEquipment, input, resolvedSite)
                setEditingEquipment(updated)
                setContactsRefresh((current) => current + 1)
            }}
            onSaveMaintenanceHistory={async (plans, input) => {
                const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input)
                setEditingEquipment(updated.equipment)
            }}
            onCreateJob={(record) => { setEditingEquipment(null); setBookingEquipment(record) }}
            onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); setEditingEquipment(null) }}
        />}
        {contactDialogOpen && <EditDrawerFormDialog
            eyebrow="Pre-job contact"
            title="Add a contact to this site"
            error={contactSaveError}
            isBusy={contactSaving}
            submitDisabled={!contactForm.name.trim()}
            submitLabel={contactSaving ? 'Saving…' : 'Save and use for job'}
            onCancel={() => { setContactDialogOpen(false); setContactSaveError('') }}
            onSubmit={() => { void saveContact() }}
        >
            <p className="edit-form-dialog-context">This contact will be saved against {selected?.match.equipment?.gr_Site?.gr_name || 'the selected site'} and preselected when you create the Service Job.</p>
            <label>Name *<input autoFocus value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>Phone<input value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label>Email<input type="email" value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} /></label>
        </EditDrawerFormDialog>}
    </main>
}
