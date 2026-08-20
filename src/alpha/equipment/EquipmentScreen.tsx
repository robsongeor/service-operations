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
import { useEquipmentJobHistory } from './hooks/useEquipmentJobHistory'
import { useOperationalQuery } from '../shared/data/useOperationalQuery'
import {
    equipmentRegisterServicePlansQueryKey,
    operationalIdFingerprint,
} from '../shared/data/operationalCollectionKeys'
import { useOperationalScreenReady } from '../shared/data/OperationalScreenPerformanceContext'

type StateFilter = 'all' | 'active' | 'inactive'

const text = (value?: string | null) => value?.trim().toLocaleLowerCase() ?? ''

export default function EquipmentScreen() {
    const [searchParams, setSearchParams] = useSearchParams()
    const activeAccount = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(activeAccount)
    const csvToolsAllowed = canUseEquipmentCsvTools(signedInUser)
    const {
        equipment,
        equipmentCacheStatus,
        equipmentRealtimeStatus,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        clearSaveError,
        createCustomer,
        createSite,
        createEquipment,
        updateEquipment,
        loadEquipmentServicePlans,
        loadEquipmentServicePlansForIds,
        searchEquipmentCustomers,
        loadEquipmentCustomerSites,
        loadEquipmentCsvReferenceData,
        saveEquipmentMaintenanceHistory,
        applyEquipmentCsvUpdates,
        deleteEquipment,
    } = useEquipmentManager({
        loadGlobalRelationships: false,
        loadGlobalServicePlans: false,
    })
    useOperationalScreenReady('Equipment', !isLoading)
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
    const equipmentJobHistory = useEquipmentJobHistory(editingEquipment?.gr_equipmentid)

    const openEquipment = useCallback((record: Equipment) => {
        setEditingEquipment(record)
    }, [])

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

    const filterCustomers = useMemo(() => {
        const byId = new Map<string, NonNullable<Equipment['gr_Site']>['gr_Customer']>()
        equipment.forEach((item) => {
            const customer = item.gr_Site?.gr_Customer
            if (customer) byId.set(customer.gr_customerid.toLowerCase(), customer)
        })
        return [...byId.values()].filter((customer): customer is NonNullable<typeof customer> => Boolean(customer))
            .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
    }, [equipment])
    const filterSites = useMemo(() => {
        const byId = new Map<string, NonNullable<Equipment['gr_Site']>>()
        equipment.forEach((item) => {
            if (item.gr_Site) byId.set(item.gr_Site.gr_siteid.toLowerCase(), item.gr_Site)
        })
        return [...byId.values()].sort((a, b) => a.gr_name.localeCompare(b.gr_name))
    }, [equipment])
    const siteOptions = filterSites.filter((site) => !customerId || site.gr_Customer?.gr_customerid === customerId)
    const preliminaryRows = useMemo(() => {
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
            if (sortKey === 'dataStatus') return text(a.gr_fleet).localeCompare(text(b.gr_fleet), undefined, { numeric: true })
            return text(sortValue(a)).localeCompare(text(sortValue(b)), undefined, { numeric: true }) * (sortDirection === 'asc' ? 1 : -1)
        })
    }, [customerId, equipment, search, siteId, sortDirection, sortKey, stateFilter])

    const preliminaryPage = useMemo(() => paginateEquipmentRows(preliminaryRows, page), [page, preliminaryRows])
    const servicePlanEquipmentIds = useMemo(() => (
        sortKey === 'dataStatus' ? preliminaryRows : preliminaryPage.rows
    ).map((item) => item.gr_equipmentid), [preliminaryPage.rows, preliminaryRows, sortKey])
    const servicePlanFingerprint = useMemo(
        () => operationalIdFingerprint(servicePlanEquipmentIds),
        [servicePlanEquipmentIds],
    )
    const servicePlanQueryKey = useMemo(
        () => equipmentRegisterServicePlansQueryKey(servicePlanFingerprint),
        [servicePlanFingerprint],
    )
    const servicePlanQuery = useOperationalQuery({
        key: servicePlanQueryKey,
        enabled: servicePlanEquipmentIds.length > 0,
        queryFn: ({ signal }) => loadEquipmentServicePlansForIds(servicePlanEquipmentIds, signal),
        staleTimeMs: 30_000,
        cacheTimeMs: 120_000,
    })
    const servicePlans = useMemo(() => servicePlanQuery.data ?? [], [servicePlanQuery.data])
    const servicePlansLoading = servicePlanEquipmentIds.length > 0
        && servicePlanQuery.data === undefined
        && (servicePlanQuery.status === 'initial' || servicePlanQuery.status === 'loading')
    const servicePlansError = servicePlanQuery.data === undefined ? servicePlanQuery.error?.message ?? '' : ''
    const plansByEquipment = useMemo(() => {
        const grouped = new Map<string, typeof servicePlans>()
        servicePlans.forEach((plan) => {
            const equipmentId = plan._gr_equipment_value?.toLowerCase()
            if (!equipmentId) return
            grouped.set(equipmentId, [...(grouped.get(equipmentId) ?? []), plan])
        })
        return grouped
    }, [servicePlans])
    const rows = useMemo(() => sortKey !== 'dataStatus' ? preliminaryRows : [...preliminaryRows].sort((a, b) => {
        const plansFor = (item: Equipment) => plansByEquipment.get(item.gr_equipmentid.toLowerCase()) ?? []
        return compareEquipmentDataQuality(a, plansFor(a), b, plansFor(b), sortDirection)
    }), [plansByEquipment, preliminaryRows, sortDirection, sortKey])
    const paged = useMemo(() => paginateEquipmentRows(rows, page), [page, rows])

    const changeSort = (key: EquipmentSortKey) => {
        setPage(1)
        if (key === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDirection('asc') }
    }
    const openJobCreateForEquipment = (record: Equipment) => {
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
            const references = await loadEquipmentCsvReferenceData()
            const review = reviewEquipmentCsv(await file.text(), equipment, references.sites)
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
                    <label>Customer<select value={customerId} onChange={(event) => { const next = event.target.value; setCustomerId(next); setPage(1); if (siteId && !filterSites.some((site) => site.gr_siteid === siteId && (!next || site.gr_Customer?.gr_customerid === next))) setSiteId('') }}><option value="">All Customers</option>{filterCustomers.map((customer) => <option key={customer.gr_customerid} value={customer.gr_customerid}>{customer.gr_name}</option>)}</select></label>
                    <label>Site<select value={siteId} onChange={(event) => { setSiteId(event.target.value); setPage(1) }}><option value="">All Sites</option>{siteOptions.map((site) => <option key={site.gr_siteid} value={site.gr_siteid}>{site.gr_name || 'Unnamed Site'}</option>)}</select></label>
                    <label>State<select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value as StateFilter); setPage(1) }}><option value="all">All states</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                </div>
                <div className="equipment-results-count">Showing {rows.length ? paged.start + 1 : 0}–{paged.end} of {rows.length}{rows.length !== equipment.length ? ` filtered (${equipment.length} total)` : ''}</div>
                {servicePlansError && <div className="equipment-data-state error" role="alert"><div><strong>Maintenance summaries are temporarily unavailable.</strong><p>The Equipment list remains available.</p></div><button type="button" onClick={() => void servicePlanQuery.refetch()}>Try again</button></div>}
                <EquipmentTable equipment={paged.rows} servicePlans={servicePlans} servicePlansLoading={servicePlansLoading} servicePlansUnavailable={Boolean(servicePlansError)} sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} onEdit={(item) => { clearSaveError(); void openEquipment(item) }} />
                {paged.totalPages > 1 && <nav className="equipment-pagination" aria-label="Equipment pages"><button type="button" onClick={() => setPage(Math.max(1, paged.page - 1))} disabled={paged.page === 1}>Previous</button><span>Page <strong>{paged.page}</strong> of <strong>{paged.totalPages}</strong></span><button type="button" onClick={() => setPage(Math.min(paged.totalPages, paged.page + 1))} disabled={paged.page === paged.totalPages}>Next</button></nav>}
            </section>}
            {isCreatingEquipment && <EquipmentDrawer mode="create" customers={[]} sites={[]} equipmentList={equipment} jobs={[]} isSaving={isSaving} saveError={saveError} onSearchCustomers={searchEquipmentCustomers} onLoadCustomerSites={loadEquipmentCustomerSites} onClose={() => setIsCreatingEquipment(false)} onCreateCustomer={createCustomer} onCreateSite={createSite} onCreate={async (input, resolvedSite) => { await createEquipment(input, resolvedSite); setIsCreatingEquipment(false) }} />}
            {editingEquipment && <EquipmentDrawer mode="edit" equipment={editingEquipment} equipmentList={equipment} onLoadServicePlans={loadEquipmentServicePlans} customers={editingEquipment.gr_Site?.gr_Customer ? [editingEquipment.gr_Site.gr_Customer] : []} sites={editingEquipment.gr_Site ? [{ ...editingEquipment.gr_Site, gr_address: editingEquipment.gr_Site.gr_address ?? '' }] : []} jobs={equipmentJobHistory.jobs} isSaving={isSaving} saveError={saveError} isJobHistoryLoading={equipmentJobHistory.isLoading} jobHistoryError={equipmentJobHistory.error} onRetryJobHistory={() => { void equipmentJobHistory.refetch().catch(() => undefined) }} onSearchCustomers={searchEquipmentCustomers} onLoadCustomerSites={loadEquipmentCustomerSites} onClose={() => setEditingEquipment(null)} onCreateCustomer={createCustomer} onCreateSite={createSite} onSave={async (input, resolvedSite) => { const updated = await updateEquipment(editingEquipment, input, resolvedSite); setEditingEquipment(updated) }} onSaveMaintenanceHistory={async (plans, input) => { const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input); setEditingEquipment(updated.equipment) }} onCreateJob={openJobCreateForEquipment} onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); setEditingEquipment(null) }} />}
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
