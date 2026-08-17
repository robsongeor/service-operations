import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EquipmentDrawer from './components/EquipmentDrawer'
import EquipmentTable from './components/EquipmentTable'
import { useEquipmentManager } from './hooks/useEquipmentManager'
import type { Equipment } from '../jobs/types/equipment.types'
import type { EquipmentSortKey, SortDirection } from './types/equipmentManager.types'
import './EquipmentScreen.css'
import { compareEquipmentDataQuality } from './dataQuality/equipmentDataQuality'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import PageSettingsButton from '../shared/settings/PageSettingsButton'
import PageSettingsDialog from '../shared/settings/PageSettingsDialog'
import EquipmentCsvImportDrawer from './components/EquipmentCsvImportDrawer'
import {
    canUseEquipmentCsvTools,
    equipmentCsvText,
    reviewEquipmentCsv,
    type EquipmentCsvReviewRow,
} from './utils/equipmentCsv'
import EquipmentJobCreateDrawer from './components/EquipmentJobCreateDrawer'
import { paginateEquipmentRows } from './equipmentPagination'
import { equipmentIdentifierSearchValues } from './identifiers/alternateFleetNumbers'

type StateFilter = 'all' | 'active' | 'inactive'

const text = (value?: string | null) => value?.trim().toLocaleLowerCase() ?? ''

export default function EquipmentScreen() {
    const [searchParams, setSearchParams] = useSearchParams()
    const activeAccount = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(activeAccount)
    const csvToolsAllowed = canUseEquipmentCsvTools(signedInUser)
    const { equipment, customers, sites, jobs, servicePlans, equipmentCacheStatus, equipmentRealtimeStatus, isLoading, isSaving, isEquipmentJobsLoading, loadError, saveError, equipmentJobsError, reload, loadEquipmentJobs, clearEquipmentJobs, clearSaveError, createCustomer, createSite, createEquipment, updateEquipment, saveEquipmentMaintenanceHistory, applyEquipmentCsvUpdates, deleteEquipment } = useEquipmentManager()
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [creatingJobForEquipment, setCreatingJobForEquipment] = useState<Equipment | null>(null)
    const [isCreatingEquipment, setIsCreatingEquipment] = useState(false)
    const [search, setSearch] = useState('')
    const [customerId, setCustomerId] = useState('')
    const [siteId, setSiteId] = useState('')
    const [stateFilter, setStateFilter] = useState<StateFilter>('all')
    const [sortKey, setSortKey] = useState<EquipmentSortKey>('fleet')
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [csvError, setCsvError] = useState('')
    const [csvImport, setCsvImport] = useState<{ filename: string; rows: EquipmentCsvReviewRow[] } | null>(null)
    const [page, setPage] = useState(1)

    const openEquipment = useCallback((record: Equipment) => {
        setEditingEquipment(record)
        void loadEquipmentJobs(record.gr_equipmentid).catch(() => undefined)
    }, [loadEquipmentJobs])

    useEffect(() => {
        const equipmentId = searchParams.get('equipmentId')
        if (!equipmentId || isLoading || editingEquipment) return
        const record = equipment.find((item) =>
            item.gr_equipmentid.toLowerCase() === equipmentId.toLowerCase())
        if (!record) return
        const timer = window.setTimeout(() => {
            openEquipment(record)
            const next = new URLSearchParams(searchParams)
            next.delete('equipmentId')
            setSearchParams(next, { replace: true })
        }, 0)
        return () => window.clearTimeout(timer)
    }, [editingEquipment, equipment, isLoading, openEquipment, searchParams, setSearchParams])

    const siteOptions = sites.filter((site) => !customerId || site.gr_Customer?.gr_customerid === customerId)
    const plansByEquipment = useMemo(() => {
        const grouped = new Map<string, typeof servicePlans>()
        servicePlans.forEach((plan) => {
            const equipmentId = plan._gr_equipment_value?.toLowerCase()
            if (!equipmentId) return
            grouped.set(equipmentId, [...(grouped.get(equipmentId) ?? []), plan])
        })
        return grouped
    }, [servicePlans])
    const rows = useMemo(() => {
        const query = search.trim().toLocaleLowerCase()
        const sortValue = (item: Equipment) => {
            if (sortKey === 'fleet') return item.gr_fleet
            if (sortKey === 'customer') return item.gr_Site?.gr_Customer?.gr_name
            if (sortKey === 'site') return item.gr_Site?.gr_name
            if (sortKey === 'make') return item.gr_make
            if (sortKey === 'model') return item.gr_model
            if (sortKey === 'serial') return item.gr_serial
            return ''
        }
        return equipment.filter((item) => {
            if (customerId && item.gr_Site?.gr_Customer?.gr_customerid !== customerId) return false
            if (siteId && item.gr_Site?.gr_siteid !== siteId) return false
            if (stateFilter === 'active' && item.statecode !== 0) return false
            if (stateFilter === 'inactive' && item.statecode === 0) return false
            return !query || [
                ...equipmentIdentifierSearchValues(item),
                item.gr_make,
                item.gr_model,
                item.gr_Site?.gr_name,
                item.gr_Site?.gr_Customer?.gr_name,
            ].some((value) => text(value).includes(query))
        }).sort((a, b) => {
            if (sortKey === 'dataStatus') {
                const plansFor = (item: Equipment) => plansByEquipment.get(item.gr_equipmentid.toLowerCase()) ?? []
                return compareEquipmentDataQuality(a, plansFor(a), b, plansFor(b), sortDirection)
            }
            return text(sortValue(a)).localeCompare(text(sortValue(b)), undefined, { numeric: true }) * (sortDirection === 'asc' ? 1 : -1)
        })
    }, [customerId, equipment, plansByEquipment, search, siteId, sortDirection, sortKey, stateFilter])

    const paged = useMemo(() => paginateEquipmentRows(rows, page), [page, rows])

    const changeSort = (key: EquipmentSortKey) => {
        setPage(1)
        if (key === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDirection('asc') }
    }
    const openJobCreateForEquipment = (record: Equipment) => {
        clearEquipmentJobs()
        setCreatingJobForEquipment(record)
        setEditingEquipment(null)
    }
    const closeEquipmentJobCreate = () => {
        const record = creatingJobForEquipment
        setCreatingJobForEquipment(null)
        if (record) openEquipment(record)
    }
    const exportEquipmentCsv = () => {
        if (!canUseEquipmentCsvTools(signedInUser)) {
            setCsvError('You are not authorised to export Equipment data.')
            return
        }
        const blob = new Blob([equipmentCsvText(equipment)], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `equipment-export-${new Date().toISOString().slice(0, 10)}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }
    const importEquipmentCsv = async (file?: File) => {
        if (!canUseEquipmentCsvTools(signedInUser)) {
            setCsvError('You are not authorised to import Equipment data.')
            return
        }
        if (!file) return
        if (!file.name.toLowerCase().endsWith('.csv')) {
            setCsvError('Choose a CSV file exported by Equipment Manager.')
            return
        }
        try {
            const review = reviewEquipmentCsv(await file.text(), equipment, sites)
            setCsvError('')
            setSettingsOpen(false)
            setCsvImport({ filename: file.name, rows: review.rows })
        } catch (error) {
            setCsvError(error instanceof Error ? error.message : 'The CSV could not be read.')
        }
    }

    return (
        <main className="equipment-page">
            <header className="equipment-page-header"><div><p>Operations</p><h1>Equipment Manager</h1></div><div className="equipment-page-header-actions"><span>{equipment.length} records</span>{equipmentRealtimeStatus !== 'disabled' && <span className={`equipment-realtime-status ${equipmentRealtimeStatus}`}>{equipmentRealtimeStatus === 'connected' ? 'Live updates on' : equipmentRealtimeStatus === 'connecting' ? 'Connecting live updates…' : 'Live updates offline'}</span>}{equipmentCacheStatus && <span className="equipment-cache-status">{equipmentCacheStatus.refreshing ? 'Saved copy · refreshing…' : equipmentCacheStatus.source === 'device' ? `Saved copy from ${new Date(equipmentCacheStatus.savedAt).toLocaleString('en-NZ')}` : `Updated ${new Date(equipmentCacheStatus.savedAt).toLocaleString('en-NZ')}`}</span>}{csvToolsAllowed && <PageSettingsButton onClick={() => { setCsvError(''); setSettingsOpen(true) }} />}<button type="button" className="equipment-create-button" onClick={() => { clearSaveError(); setEditingEquipment(null); setIsCreatingEquipment(true) }}>New Equipment</button></div></header>
            {isLoading ? <div className="equipment-data-state">Loading equipment…</div> : loadError ? (
                <div className="equipment-data-state error"><div><strong>Equipment could not be loaded.</strong><p>{loadError}</p></div><button type="button" onClick={() => void reload()}>Try again</button></div>
            ) : <section className="equipment-list-card">
                <div className="equipment-toolbar">
                    <label className="equipment-search"><span className="equipment-visually-hidden">Search equipment</span><input type="search" placeholder="Search primary or alternate fleet, serial, make, model, Site or Customer" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
                    <label>Customer<select value={customerId} onChange={(event) => { const next = event.target.value; setCustomerId(next); setPage(1); if (siteId && !sites.some((site) => site.gr_siteid === siteId && (!next || site.gr_Customer?.gr_customerid === next))) setSiteId('') }}><option value="">All Customers</option>{customers.map((customer) => <option key={customer.gr_customerid} value={customer.gr_customerid}>{customer.gr_name}</option>)}</select></label>
                    <label>Site<select value={siteId} onChange={(event) => { setSiteId(event.target.value); setPage(1) }}><option value="">All Sites</option>{siteOptions.map((site) => <option key={site.gr_siteid} value={site.gr_siteid}>{site.gr_name || 'Unnamed Site'}</option>)}</select></label>
                    <label>State<select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value as StateFilter); setPage(1) }}><option value="all">All states</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                </div>
                <div className="equipment-results-count">Showing {rows.length ? paged.start + 1 : 0}–{paged.end} of {rows.length}{rows.length !== equipment.length ? ` filtered (${equipment.length} total)` : ''}</div>
                <EquipmentTable equipment={paged.rows} servicePlans={servicePlans} sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} onEdit={(item) => { clearSaveError(); void openEquipment(item) }} />
                {paged.totalPages > 1 && <nav className="equipment-pagination" aria-label="Equipment pages"><button type="button" onClick={() => setPage(Math.max(1, paged.page - 1))} disabled={paged.page === 1}>Previous</button><span>Page <strong>{paged.page}</strong> of <strong>{paged.totalPages}</strong></span><button type="button" onClick={() => setPage(Math.min(paged.totalPages, paged.page + 1))} disabled={paged.page === paged.totalPages}>Next</button></nav>}
            </section>}
            {isCreatingEquipment && <EquipmentDrawer mode="create" customers={customers} sites={sites} equipmentList={equipment} jobs={[]} isSaving={isSaving} saveError={saveError} onClose={() => setIsCreatingEquipment(false)} onCreateCustomer={createCustomer} onCreateSite={createSite} onCreate={async (input, resolvedSite) => { await createEquipment(input, resolvedSite); setIsCreatingEquipment(false) }} />}
            {editingEquipment && <EquipmentDrawer mode="edit" equipment={editingEquipment} equipmentList={equipment} servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === editingEquipment.gr_equipmentid.toLowerCase())} customers={customers} sites={sites} jobs={jobs} isSaving={isSaving} saveError={saveError} isJobHistoryLoading={isEquipmentJobsLoading} jobHistoryError={equipmentJobsError} onRetryJobHistory={() => { void loadEquipmentJobs(editingEquipment.gr_equipmentid).catch(() => undefined) }} onClose={() => { clearEquipmentJobs(); setEditingEquipment(null) }} onCreateCustomer={createCustomer} onCreateSite={createSite} onSave={async (input, resolvedSite) => { const updated = await updateEquipment(editingEquipment, input, resolvedSite); setEditingEquipment(updated) }} onSaveMaintenanceHistory={async (plans, input) => { const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input); setEditingEquipment(updated.equipment) }} onCreateJob={openJobCreateForEquipment} onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); clearEquipmentJobs(); setEditingEquipment(null) }} />}
            {creatingJobForEquipment && <EquipmentJobCreateDrawer
                equipment={creatingJobForEquipment}
                onCreated={reload}
                onClose={closeEquipmentJobCreate}
            />}
            <PageSettingsDialog
                open={settingsOpen && csvToolsAllowed}
                title="Equipment Settings"
                description="Administrative tools for maintaining Equipment master data."
                onCancel={() => setSettingsOpen(false)}
                onApply={() => setSettingsOpen(false)}
                applyLabel="Done"
            >
                <section className="equipment-csv-settings" aria-labelledby="equipment-csv-settings-heading">
                    <div><h3 id="equipment-csv-settings-heading">Equipment data tools</h3><p>Export all Equipment records, edit supported values in Excel, then upload the file for review.</p></div>
                    <button type="button" onClick={exportEquipmentCsv}>Export Equipment CSV</button>
                    <label className="equipment-csv-upload">Import Equipment CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { void importEquipmentCsv(event.target.files?.[0]); event.target.value = '' }} /></label>
                    {csvError && <p className="equipment-csv-error" role="alert">{csvError}</p>}
                </section>
            </PageSettingsDialog>
            {csvImport && <EquipmentCsvImportDrawer
                filename={csvImport.filename}
                rows={csvImport.rows}
                busy={isSaving}
                onApply={(reviewRows) => applyEquipmentCsvUpdates(signedInUser, reviewRows)}
                onClose={() => setCsvImport(null)}
            />}
        </main>
    )
}
