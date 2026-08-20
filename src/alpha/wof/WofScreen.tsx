import { useMemo, useState } from 'react'
import { JOB_STATUS_OPTIONS } from '../jobs/types/jobStatus.types'
import { JOB_TYPES, JOB_TYPE_OPTIONS } from '../jobs/types/jobType.types'
import JobCreateDrawer from '../jobs/components/JobCreateDrawer'
import JobsTableSortIcon from '../jobs/components/JobsTableSortIcon'
import PageSettingsButton from '../shared/settings/PageSettingsButton'
import PageSettingsDialog from '../shared/settings/PageSettingsDialog'
import PageHeader from '../shared/page-header/PageHeader'
import WofEditorDrawer from './components/WofEditorDrawer'
import WofJobDrawer from './components/WofJobDrawer'
import EquipmentDrawer from '../equipment/components/EquipmentDrawer'
import { isRoadRegistered } from '../equipment/compliance/equipmentCompliance'
import type { Equipment } from '../jobs/types/equipment.types'
import { useWof } from './hooks/useWof'
import type { WofTab } from './types/wof.types'
import type { WofInspection } from './types/wof.types'
import { DEFAULT_WOF_PREFERENCES, loadWofPreferences, saveWofPreferences, type WofSortKey } from './types/wofViewState.types'
import { formatWofDateOnly, getLatestWofInspection, getWofDueStatus, getWofWorkflowStatus, wofCanCreateJob, wofNeedsAdministration, WOF_WORKFLOW_LABELS } from './utils/wofRules'
import './WofScreen.css'
import { equipmentIdentifierSearchValues } from '../equipment/identifiers/alternateFleetNumbers'
import { useEquipmentJobHistory } from '../equipment/hooks/useEquipmentJobHistory'
import { useOperationalScreenReady } from '../shared/data/OperationalScreenPerformanceContext'

const tabs: { value: WofTab; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'due-soon', label: 'Due Soon' }, { value: 'expired', label: 'Expired' },
    { value: 'in-progress', label: 'In Progress' }, { value: 'ready', label: 'Ready to Issue' },
]

export default function WofScreen({ accountId }: { accountId: string }) {
    const {
        equipment, inspections, qualifications, providers, customers, sites, mechanics, siteContacts,
        scheduleOptions, servicePlans, loading, error, isEquipmentSaving, equipmentSaveError,
        reload, refreshWorkflowData, loadWofInspection, loadEquipment, loadEquipmentServicePlans,
        loadWofEditorSupport, loadWofJobCreationSupport,
        searchEquipmentForEditor, searchCustomersForEditor, loadCustomerSitesForEditor,
        loadSiteContactsForEditor, loadEquipmentForEditor,
        createWof, createWofJob, createWofScheduleOption, updateWof, deleteWof, createCustomer,
        createSite, createContact, createJobEquipment, createEquipment, updateEquipment,
        saveEquipmentMaintenanceHistory, deleteEquipment, clearEquipmentSaveError,
    } = useWof()
    useOperationalScreenReady('WOF', !loading)
    const [tab, setTab] = useState<WofTab>('all')
    const [search, setSearch] = useState('')
    const [jobEquipment, setJobEquipment] = useState<Equipment | null>(null)
    const [viewingJobId, setViewingJobId] = useState<string | null>(null)
    const [editingInspection, setEditingInspection] = useState<WofInspection | null>(null)
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [loadingEquipmentId, setLoadingEquipmentId] = useState<string | null>(null)
    const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null)
    const [loadingJobEquipmentId, setLoadingJobEquipmentId] = useState<string | null>(null)
    const [detailLoadError, setDetailLoadError] = useState('')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [preferences, setPreferences] = useState(() => accountId === 'account-pending' ? DEFAULT_WOF_PREFERENCES : loadWofPreferences(accountId))
    const [dueSoonDraft, setDueSoonDraft] = useState(String(preferences.dueSoonDays))
    const [settingsError, setSettingsError] = useState('')
    const [deleteMessage, setDeleteMessage] = useState('')
    const equipmentJobHistory = useEquipmentJobHistory(editingEquipment?.gr_equipmentid)

    const roadRegisteredEquipment = useMemo(() => equipment.filter(isRoadRegistered), [equipment])
    const baseRows = useMemo(() => roadRegisteredEquipment.map((item) => {
        const inspection = getLatestWofInspection(inspections, item.gr_equipmentid)
        const jobId = inspection?.gr_Job?.gr_jobid
        const schedule = scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === jobId?.toLowerCase() && option.gr_confirmed)
            ?? scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === jobId?.toLowerCase())
        const customer = inspection?.gr_Job?.gr_Site?.gr_Customer?.gr_name || item.gr_Site?.gr_Customer?.gr_name || ''
        const site = inspection?.gr_Job?.gr_Site?.gr_name || item.gr_Site?.gr_name || ''
        const due = getWofDueStatus(true, item.gr_currentwofexpiry, undefined, preferences.dueSoonDays)
        const workflow = getWofWorkflowStatus(item, inspection, schedule, preferences.dueSoonDays)
        return { equipment: item, inspection, schedule, customer, site, due, workflow }
    }), [inspections, preferences.dueSoonDays, roadRegisteredEquipment, scheduleOptions])

    const tabCounts = useMemo(() => ({
        all: baseRows.length,
        'due-soon': baseRows.filter((row) => row.due === 'due-soon').length,
        expired: baseRows.filter((row) => row.due === 'expired').length,
        'in-progress': baseRows.filter((row) => ['job-created', 'scheduled'].includes(row.workflow)).length,
        ready: baseRows.filter((row) => ['inspection-complete', 'ready-to-issue'].includes(row.workflow)).length,
    }), [baseRows])

    const rows = useMemo(() => baseRows.filter((row) => {
        if (tab === 'due-soon' || tab === 'expired') return row.due === tab
        if (tab === 'in-progress') return ['job-created', 'scheduled'].includes(row.workflow)
        if (tab === 'ready') return ['inspection-complete', 'ready-to-issue'].includes(row.workflow)
        return true
    }).filter((row) => !search.trim() || [...equipmentIdentifierSearchValues(row.equipment), row.equipment.gr_registrationnumber, row.equipment.gr_regoexpiry, row.equipment.gr_Site?.gr_name, row.customer, row.inspection?.gr_Job?.gr_jobnumber].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => {
        const sortValue = (row: typeof a) => {
            if (preferences.sort.key === 'customer') return row.customer
            if (preferences.sort.key === 'rego-expiry') return row.equipment.gr_regoexpiry || ''
            return row.equipment.gr_currentwofexpiry || ''
        }
        const left = sortValue(a)
        const right = sortValue(b)
        if (!left && !right) return 0
        if (!left) return 1
        if (!right) return -1
        return left.localeCompare(right, undefined, { sensitivity: 'base' }) * (preferences.sort.direction === 'ascending' ? 1 : -1)
    }), [baseRows, preferences.sort, search, tab])

    const changeSort = (key: WofSortKey) => {
        const next = { ...preferences, sort: { key, direction: preferences.sort.key === key && preferences.sort.direction === 'ascending' ? 'descending' as const : 'ascending' as const } }
        setPreferences(next)
        if (accountId !== 'account-pending') saveWofPreferences(accountId, next)
    }
    const applySettings = () => {
        const days = Number(dueSoonDraft)
        if (!Number.isInteger(days) || days < 1 || days > 365) return setSettingsError('Enter a whole number from 1 to 365.')
        const next = { ...preferences, dueSoonDays: days }
        setPreferences(next); if (accountId !== 'account-pending') saveWofPreferences(accountId, next)
        setSettingsError(''); setSettingsOpen(false)
    }

    const openInspection = async (inspection: WofInspection) => {
        if (!inspection.gr_wofinspectionid) {
            setDetailLoadError('The selected table row does not contain a WOF Inspection identifier.')
            return
        }
        setEditingInspectionId(inspection.gr_wofinspectionid)
        setDetailLoadError('')
        try {
            const [record] = await Promise.all([
                loadWofInspection(inspection.gr_wofinspectionid),
                loadWofEditorSupport(),
            ])
            setEditingInspection(record)
        } catch (caught) {
            setDetailLoadError(caught instanceof Error ? caught.message : 'The WOF Inspection could not be loaded.')
        } finally {
            setEditingInspectionId(null)
        }
    }

    const openWofJobCreate = async (record: Equipment) => {
        setLoadingJobEquipmentId(record.gr_equipmentid)
        setDetailLoadError('')
        try {
            await loadWofJobCreationSupport(record)
            setJobEquipment(record)
        } catch (caught) {
            setDetailLoadError(caught instanceof Error ? caught.message : 'The WOF Job editor data could not be loaded.')
        } finally {
            setLoadingJobEquipmentId(null)
        }
    }

    const openEquipment = async (equipmentId: string) => {
        setLoadingEquipmentId(equipmentId)
        setDetailLoadError('')
        clearEquipmentSaveError()
        try {
            setEditingEquipment(await loadEquipment(equipmentId))
        } catch (caught) {
            setDetailLoadError(caught instanceof Error ? caught.message : 'The Equipment record could not be loaded.')
        } finally {
            setLoadingEquipmentId(null)
        }
    }

    return <main className="wof-screen">
        <PageHeader
            eyebrow="Compliance Operations"
            title="WOF Management"
            subtitle="Monitor expiry, create WOF Jobs, and complete compliance administration from one queue."
            actions={<PageSettingsButton active={settingsOpen} visibleLabel="Settings" title="WOF Table Settings" onClick={() => { setDueSoonDraft(String(preferences.dueSoonDays)); setSettingsError(''); setSettingsOpen(true) }} />}
        />
        {deleteMessage && <div className="wof-success" role="status">{deleteMessage}</div>}
        {detailLoadError && <div className="wof-state error" role="alert"><p>{detailLoadError}</p><button type="button" onClick={() => setDetailLoadError('')}>Dismiss</button></div>}
        {editingInspectionId && <div className="wof-state" role="status">Loading WOF details…</div>}
        {loadingJobEquipmentId && <div className="wof-state" role="status">Loading WOF Job details…</div>}
        {loadingEquipmentId && <div className="wof-state" role="status">Loading Equipment details…</div>}
        <div className="wof-controls"><div className="wof-tabs" role="tablist" aria-label="WOF views">{tabs.map((item) => <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} className={tab === item.value ? 'active' : ''} onClick={() => setTab(item.value)}>{item.label} <span>{tabCounts[item.value]}</span></button>)}</div><input type="search" aria-label="Search WOF records" placeholder="Search equipment, REGO, customer or job…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {loading && <div className="wof-state">Loading WOF records…</div>}
        {error && <div className="wof-state error"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div>}
        {!loading && !error && <div className="wof-table-wrap"><table><thead><tr><th>Equipment</th><th>REGO</th><th><button type="button" onClick={() => changeSort('customer')}>Customer <JobsTableSortIcon active={preferences.sort.key === 'customer'} direction={preferences.sort.direction} /></button></th><th>Site</th><th><button type="button" onClick={() => changeSort('expiry')}>WOF Expiry <JobsTableSortIcon active={preferences.sort.key === 'expiry'} direction={preferences.sort.direction} /></button></th><th>Workflow Status</th><th>Schedule / Job</th><th>Action</th></tr></thead><tbody>{rows.map(({ equipment: item, inspection, schedule, customer, site, workflow }) => {
            const ready = wofNeedsAdministration(workflow)
            const activeJob = ['job-created', 'scheduled', 'inspection-complete', 'ready-to-issue'].includes(workflow)
            const action = wofCanCreateJob(workflow)
                ? <button type="button" className="wof-row-action primary" disabled={loadingJobEquipmentId === item.gr_equipmentid} onClick={() => void openWofJobCreate(item)}>{loadingJobEquipmentId === item.gr_equipmentid ? 'Loading…' : 'Create WOF Job'}</button>
                : activeJob && inspection?.gr_Job
                    ? <button type="button" className="wof-row-action" onClick={() => setViewingJobId(inspection.gr_Job!.gr_jobid)}>{ready ? 'Open Job' : 'View Job'}</button>
                    : <button type="button" className="wof-row-action subtle" onClick={() => void openEquipment(item.gr_equipmentid)}>Edit</button>
            return <tr key={item.gr_equipmentid}><td><button type="button" className="wof-equipment-link" aria-label={`Open equipment ${item.gr_fleet || item.gr_serial || 'record'}`} onClick={() => void openEquipment(item.gr_equipmentid)}><strong>{item.gr_fleet || item.gr_serial || 'Unnamed equipment'}</strong><small>{[item.gr_make, item.gr_model, item.gr_serial && `S/N ${item.gr_serial}`].filter(Boolean).join(' · ') || 'No equipment details'}</small></button></td><td>{item.gr_registrationnumber || '—'}</td><td>{customer || 'No customer recorded'}</td><td>{site || 'No site recorded'}</td><td>{formatWofDateOnly(item.gr_currentwofexpiry) || 'No expiry recorded'}</td><td><span className={`wof-workflow ${workflow}`}>{WOF_WORKFLOW_LABELS[workflow]}</span>{workflow === 'scheduled' && schedule?.gr_scheduledate && <small>Scheduled – {formatWofDateOnly(schedule.gr_scheduledate)}</small>}{ready && <button type="button" className="wof-admin-link" onClick={() => inspection && void openInspection(inspection)}>Update inspection and expiry</button>}</td><td><strong>{inspection?.gr_Job?.gr_jobnumber || 'No active Job'}</strong><small>{inspection?.gr_Job ? JOB_STATUS_OPTIONS.find((status) => status.value === inspection.gr_Job?.gr_status)?.label || 'Unknown status' : '—'}</small></td><td>{action}</td></tr>
        })}{rows.length === 0 && <tr><td colSpan={8} className="wof-empty">No WOF records match this view.</td></tr>}</tbody></table></div>}
        {jobEquipment && <JobCreateDrawer mechanics={mechanics} equipmentList={equipment} sites={sites} customers={customers} siteContacts={siteContacts} servicePlans={servicePlans} initialValues={{ equipmentId: jobEquipment.gr_equipmentid, siteId: jobEquipment.gr_Site?.gr_siteid, customerId: jobEquipment.gr_Site?.gr_Customer?.gr_customerid, jobType: JOB_TYPES.WOF, description: `WOF inspection – ${jobEquipment.gr_fleet || jobEquipment.gr_serial || jobEquipment.gr_registrationnumber || 'Equipment'}` }} jobTypeOptions={JOB_TYPE_OPTIONS.filter((option) => option.value === JOB_TYPES.WOF)} onSearchEquipment={searchEquipmentForEditor} onSearchCustomers={searchCustomersForEditor} onLoadCustomerSites={loadCustomerSitesForEditor} onLoadSiteContacts={loadSiteContactsForEditor} onLoadEquipment={loadEquipmentForEditor} onLoadEquipmentServicePlans={loadEquipmentServicePlans} onCreateCustomer={async (input) => (await createCustomer(input)).gr_customerid} onCreateSite={async (input) => (await createSite(input)).gr_siteid} onCreateContact={createContact} onCreateEquipment={createJobEquipment} onCreateJob={async (job) => {
            const selected = equipment.find((item) => item.gr_equipmentid === job.equipmentId)
            if (!selected) throw new Error('Select Equipment before creating a WOF Job.')
            return createWofJob(selected, job)
        }} onCreateScheduleOption={createWofScheduleOption} onClose={() => setJobEquipment(null)} />}
        {viewingJobId && <WofJobDrawer
            key={viewingJobId}
            jobId={viewingJobId}
            scheduleOptions={scheduleOptions.filter((option) => option._gr_job_value?.toLowerCase() === viewingJobId.toLowerCase())}
            onChanged={refreshWorkflowData}
            onClose={() => setViewingJobId(null)}
        />}
        {editingInspection && <WofEditorDrawer inspection={editingInspection} schedule={scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === editingInspection.linkedJobId?.toLowerCase() && option.gr_confirmed) ?? scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === editingInspection.linkedJobId?.toLowerCase())} equipment={equipment} customers={customers} sites={sites} qualifications={qualifications} providers={providers} onCreate={createWof} onUpdate={updateWof} onDelete={async (inspection) => { await deleteWof(inspection); setDeleteMessage('WOF deleted.') }} onCreateCustomer={createCustomer} onCreateSite={createSite} onCreateEquipment={createEquipment} onClose={() => setEditingInspection(null)} />}
        {editingEquipment && <EquipmentDrawer mode="edit" equipment={editingEquipment} equipmentList={equipment} onLoadServicePlans={loadEquipmentServicePlans} customers={customers} sites={sites} jobs={equipmentJobHistory.jobs} isSaving={isEquipmentSaving} saveError={equipmentSaveError} isJobHistoryLoading={equipmentJobHistory.isLoading} jobHistoryError={equipmentJobHistory.error} onRetryJobHistory={() => { void equipmentJobHistory.refetch().catch(() => undefined) }} onClose={() => setEditingEquipment(null)} onSave={async (input) => { const updated = await updateEquipment(editingEquipment, input); setEditingEquipment(updated) }} onSaveMaintenanceHistory={async (plans, input) => { const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input); setEditingEquipment(updated) }} onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); setEditingEquipment(null) }} />}
        <PageSettingsDialog open={settingsOpen} title="WOF Table Settings" description="Configure your WOF table preferences." onCancel={() => { setSettingsOpen(false); setSettingsError('') }} onApply={applySettings} applyLabel="Save"><label className="wof-setting-field"><span>Due soon threshold</span><input type="number" min="1" max="365" step="1" value={dueSoonDraft} onChange={(event) => { setDueSoonDraft(event.target.value); setSettingsError('') }} /><small>Mark WOFs as due soon this many days before their expiry date.</small>{settingsError && <strong role="alert">{settingsError}</strong>}</label></PageSettingsDialog>
    </main>
}
