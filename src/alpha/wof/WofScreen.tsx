import { useMemo, useState } from 'react'
import { JOB_STATUSES, JOB_STATUS_OPTIONS } from '../jobs/types/jobStatus.types'
import JobsTableSortIcon from '../jobs/components/JobsTableSortIcon'
import PageSettingsButton from '../shared/settings/PageSettingsButton'
import PageSettingsDialog from '../shared/settings/PageSettingsDialog'
import WofEditorDrawer from './components/WofEditorDrawer'
import EquipmentDrawer from '../equipment/components/EquipmentDrawer'
import { isRoadRegistered } from '../equipment/compliance/equipmentCompliance'
import type { Equipment } from '../jobs/types/equipment.types'
import { useWof } from './hooks/useWof'
import type { WofTab } from './types/wof.types'
import { WOF_RESULTS } from './types/wof.types'
import type { WofInspection } from './types/wof.types'
import { DEFAULT_WOF_PREFERENCES, loadWofPreferences, saveWofPreferences, type WofSortKey } from './types/wofViewState.types'
import { formatWofDateOnly, getWofDueStatus } from './utils/wofRules'
import './WofScreen.css'

const tabs: { value: WofTab; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'due-soon', label: 'Due Soon' }, { value: 'expired', label: 'Expired' },
    { value: 'scheduled', label: 'Scheduled' }, { value: 'completed', label: 'Completed' },
]

export default function WofScreen({ accountId }: { accountId: string }) {
    const { equipment, inspections, qualifications, providers, customers, sites, jobs, scheduleOptions, servicePlans, loading, error, isEquipmentSaving, equipmentSaveError, reload, loadWofInspection, loadEquipment, createWof, updateWof, deleteWof, createCustomer, createSite, createEquipment, updateEquipment, saveEquipmentMaintenanceHistory, deleteEquipment, clearEquipmentSaveError } = useWof()
    const [tab, setTab] = useState<WofTab>('all')
    const [search, setSearch] = useState('')
    const [creating, setCreating] = useState(false)
    const [editingInspection, setEditingInspection] = useState<WofInspection | null>(null)
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [loadingEquipmentId, setLoadingEquipmentId] = useState<string | null>(null)
    const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null)
    const [detailLoadError, setDetailLoadError] = useState('')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [preferences, setPreferences] = useState(() => accountId === 'account-pending' ? DEFAULT_WOF_PREFERENCES : loadWofPreferences(accountId))
    const [dueSoonDraft, setDueSoonDraft] = useState(String(preferences.dueSoonDays))
    const [settingsError, setSettingsError] = useState('')
    const [deleteMessage, setDeleteMessage] = useState('')

    const roadRegisteredEquipment = useMemo(() => equipment.filter(isRoadRegistered), [equipment])
    const baseRows = useMemo(() => roadRegisteredEquipment.map((item) => {
        const inspection = inspections.filter((record) => record.gr_Equipment?.gr_equipmentid === item.gr_equipmentid).sort((a, b) => (b.gr_inspectiondate || b.gr_name).localeCompare(a.gr_inspectiondate || a.gr_name))[0]
        const jobId = inspection?.gr_Job?.gr_jobid
        const schedule = scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === jobId?.toLowerCase() && option.gr_confirmed)
            ?? scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === jobId?.toLowerCase())
        const customer = inspection?.gr_Job?.gr_Site?.gr_Customer?.gr_name || item.gr_Site?.gr_Customer?.gr_name || ''
        const site = inspection?.gr_Job?.gr_Site?.gr_name || item.gr_Site?.gr_name || ''
        return { equipment: item, inspection, schedule, customer, site, due: getWofDueStatus(true, item.gr_currentwofexpiry, undefined, preferences.dueSoonDays) }
    }), [inspections, preferences.dueSoonDays, roadRegisteredEquipment, scheduleOptions])

    const tabCounts = useMemo(() => ({
        all: baseRows.length,
        'due-soon': baseRows.filter((row) => row.due === 'due-soon').length,
        expired: baseRows.filter((row) => row.due === 'expired').length,
        scheduled: baseRows.filter((row) => row.inspection?.gr_wofresult === WOF_RESULTS.PLANNED && row.inspection.gr_Job?.gr_status !== JOB_STATUSES.COMPLETE).length,
        completed: baseRows.filter((row) => row.inspection?.gr_wofresult === WOF_RESULTS.PASSED || row.inspection?.gr_wofresult === WOF_RESULTS.FAILED).length,
    }), [baseRows])

    const rows = useMemo(() => baseRows.filter((row) => {
        if (tab === 'due-soon' || tab === 'expired') return row.due === tab
        if (tab === 'scheduled') return row.inspection && row.inspection.gr_wofresult === WOF_RESULTS.PLANNED && row.inspection.gr_Job?.gr_status !== JOB_STATUSES.COMPLETE
        if (tab === 'completed') return row.inspection && (row.inspection.gr_wofresult === WOF_RESULTS.PASSED || row.inspection.gr_wofresult === WOF_RESULTS.FAILED)
        return true
    }).filter((row) => !search.trim() || [row.equipment.gr_fleet, row.equipment.gr_serial, row.equipment.gr_registrationnumber, row.equipment.gr_regoexpiry, row.equipment.gr_Site?.gr_name, row.customer, row.inspection?.gr_Job?.gr_jobnumber].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => {
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
            setEditingInspection(await loadWofInspection(inspection.gr_wofinspectionid))
        } catch (caught) {
            setDetailLoadError(caught instanceof Error ? caught.message : 'The WOF Inspection could not be loaded.')
        } finally {
            setEditingInspectionId(null)
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
        <header className="wof-header"><div><p>Compliance operations</p><h1>WOF / REGO</h1><span>Plan and track equipment WOF inspections through protected Jobs.</span></div><div className="wof-header-actions"><PageSettingsButton active={settingsOpen} visibleLabel="Settings" title="WOF Table Settings" onClick={() => { setDueSoonDraft(String(preferences.dueSoonDays)); setSettingsError(''); setSettingsOpen(true) }} /><button type="button" onClick={() => setCreating(true)}>Create WOF</button></div></header>
        {deleteMessage && <div className="wof-success" role="status">{deleteMessage}</div>}
        {detailLoadError && <div className="wof-state error" role="alert"><p>{detailLoadError}</p><button type="button" onClick={() => setDetailLoadError('')}>Dismiss</button></div>}
        {editingInspectionId && <div className="wof-state" role="status">Loading WOF details…</div>}
        {loadingEquipmentId && <div className="wof-state" role="status">Loading Equipment details…</div>}
        <div className="wof-controls"><div className="wof-tabs" role="tablist" aria-label="WOF views">{tabs.map((item) => <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} className={tab === item.value ? 'active' : ''} onClick={() => setTab(item.value)}>{item.label} <span>{tabCounts[item.value]}</span></button>)}</div><input type="search" aria-label="Search WOF records" placeholder="Search equipment, REGO, customer or job…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {loading && <div className="wof-state">Loading WOF records…</div>}
        {error && <div className="wof-state error"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div>}
        {!loading && !error && <div className="wof-table-wrap"><table><thead><tr><th>Equipment</th><th>REGO Number</th><th><button type="button" onClick={() => changeSort('rego-expiry')}>REGO Expiry <JobsTableSortIcon active={preferences.sort.key === 'rego-expiry'} direction={preferences.sort.direction} /></button></th><th><button type="button" onClick={() => changeSort('customer')}>Customer <JobsTableSortIcon active={preferences.sort.key === 'customer'} direction={preferences.sort.direction} /></button></th><th>Site</th><th><button type="button" onClick={() => changeSort('expiry')}>WOF Expiry <JobsTableSortIcon active={preferences.sort.key === 'expiry'} direction={preferences.sort.direction} /></button></th><th>Due Status</th><th>Assigned To</th><th>Scheduled Date</th><th>Job Number</th><th>Job Status</th></tr></thead><tbody>{rows.map(({ equipment: item, inspection, schedule, customer, site, due }) => <tr key={item.gr_equipmentid} className={inspection ? 'wof-row-editable' : ''} tabIndex={inspection ? 0 : undefined} onClick={() => { if (inspection) void openInspection(inspection) }} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (inspection && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); void openInspection(inspection) } }}><td><button type="button" className="wof-equipment-link" aria-label={`Open equipment ${item.gr_fleet || item.gr_serial || 'record'}`} onClick={(event) => { event.stopPropagation(); void openEquipment(item.gr_equipmentid) }}><strong>{item.gr_fleet || item.gr_serial || 'Unnamed equipment'}</strong><small>{[item.gr_make, item.gr_model, item.gr_serial && `S/N ${item.gr_serial}`].filter(Boolean).join(' · ') || 'No equipment details'}</small></button></td><td>{item.gr_registrationnumber || '—'}</td><td>{formatWofDateOnly(item.gr_regoexpiry) || 'No expiry recorded'}</td><td>{customer || 'No customer recorded'}</td><td>{site || 'No site recorded'}</td><td>{formatWofDateOnly(item.gr_currentwofexpiry) || 'No expiry recorded'}</td><td><span className={`wof-due ${due}`}>{due.replace('-', ' ')}</span></td><td>{inspection?.gr_InternalInspector?.gr_name || inspection?.gr_ExternalProvider?.gr_name || 'Unassigned'}</td><td>{formatWofDateOnly(schedule?.gr_scheduledate) || 'Not scheduled'}</td><td>{inspection?.gr_Job?.gr_jobnumber || '—'}</td><td>{JOB_STATUS_OPTIONS.find((status) => status.value === inspection?.gr_Job?.gr_status)?.label || '—'}</td></tr>)}{rows.length === 0 && <tr><td colSpan={11} className="wof-empty">No WOF records match this view.</td></tr>}</tbody></table></div>}
        {creating && <WofEditorDrawer equipment={equipment} customers={customers} sites={sites} jobs={jobs} qualifications={qualifications} providers={providers} onCreate={createWof} onUpdate={updateWof} onDelete={deleteWof} onCreateCustomer={createCustomer} onCreateSite={createSite} onCreateEquipment={createEquipment} onClose={() => setCreating(false)} />}
        {editingInspection && <WofEditorDrawer inspection={editingInspection} schedule={scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === editingInspection.linkedJobId?.toLowerCase() && option.gr_confirmed) ?? scheduleOptions.find((option) => option._gr_job_value?.toLowerCase() === editingInspection.linkedJobId?.toLowerCase())} equipment={equipment} customers={customers} sites={sites} jobs={jobs} qualifications={qualifications} providers={providers} onCreate={createWof} onUpdate={updateWof} onDelete={async (inspection) => { await deleteWof(inspection); setDeleteMessage('WOF deleted.') }} onCreateCustomer={createCustomer} onCreateSite={createSite} onCreateEquipment={createEquipment} onClose={() => setEditingInspection(null)} />}
        {editingEquipment && <EquipmentDrawer mode="edit" equipment={editingEquipment} equipmentList={equipment} servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === editingEquipment.gr_equipmentid.toLowerCase())} customers={customers} sites={sites} jobs={jobs} isSaving={isEquipmentSaving} saveError={equipmentSaveError} onClose={() => setEditingEquipment(null)} onSave={async (input) => { const updated = await updateEquipment(editingEquipment, input); setEditingEquipment(updated) }} onSaveMaintenanceHistory={async (plans, input) => { const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input); setEditingEquipment(updated) }} onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); setEditingEquipment(null) }} />}
        <PageSettingsDialog open={settingsOpen} title="WOF Table Settings" description="Configure your WOF table preferences." onCancel={() => { setSettingsOpen(false); setSettingsError('') }} onApply={applySettings} applyLabel="Save"><label className="wof-setting-field"><span>Due soon threshold</span><input type="number" min="1" max="365" step="1" value={dueSoonDraft} onChange={(event) => { setDueSoonDraft(event.target.value); setSettingsError('') }} /><small>Mark WOFs as due soon this many days before their expiry date.</small>{settingsError && <strong role="alert">{settingsError}</strong>}</label></PageSettingsDialog>
    </main>
}
