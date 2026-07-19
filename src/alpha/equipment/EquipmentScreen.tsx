import { useMemo, useState } from 'react'
import EquipmentDrawer from './components/EquipmentDrawer'
import EquipmentTable from './components/EquipmentTable'
import { useEquipmentManager } from './hooks/useEquipmentManager'
import type { Equipment } from '../jobs/types/equipment.types'
import type { EquipmentSortKey, SortDirection } from './types/equipmentManager.types'
import './EquipmentScreen.css'

type StateFilter = 'all' | 'active' | 'inactive'

const text = (value?: string | null) => value?.trim().toLocaleLowerCase() ?? ''

export default function EquipmentScreen() {
    const { equipment, customers, sites, jobs, isLoading, isSaving, loadError, saveError, reload, clearSaveError, createCustomer, createSite, createEquipment, updateEquipment, deleteEquipment } = useEquipmentManager()
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [isCreatingEquipment, setIsCreatingEquipment] = useState(false)
    const [search, setSearch] = useState('')
    const [customerId, setCustomerId] = useState('')
    const [siteId, setSiteId] = useState('')
    const [stateFilter, setStateFilter] = useState<StateFilter>('all')
    const [sortKey, setSortKey] = useState<EquipmentSortKey>('fleet')
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

    const siteOptions = sites.filter((site) => !customerId || site.gr_Customer?.gr_customerid === customerId)
    const rows = useMemo(() => {
        const query = search.trim().toLocaleLowerCase()
        const sortValue = (item: Equipment) => ({
            fleet: item.gr_fleet, customer: item.gr_Site?.gr_Customer?.gr_name, site: item.gr_Site?.gr_name,
            make: item.gr_make, model: item.gr_model, serial: item.gr_serial,
        }[sortKey] ?? '')
        return equipment.filter((item) => {
            if (customerId && item.gr_Site?.gr_Customer?.gr_customerid !== customerId) return false
            if (siteId && item.gr_Site?.gr_siteid !== siteId) return false
            if (stateFilter === 'active' && item.statecode !== 0) return false
            if (stateFilter === 'inactive' && item.statecode === 0) return false
            return !query || [item.gr_fleet, item.gr_serial, item.gr_make, item.gr_model, item.gr_Site?.gr_name, item.gr_Site?.gr_Customer?.gr_name].some((value) => text(value).includes(query))
        }).sort((a, b) => text(sortValue(a)).localeCompare(text(sortValue(b)), undefined, { numeric: true }) * (sortDirection === 'asc' ? 1 : -1))
    }, [customerId, equipment, search, siteId, sortDirection, sortKey, stateFilter])

    const changeSort = (key: EquipmentSortKey) => {
        if (key === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
        else { setSortKey(key); setSortDirection('asc') }
    }

    return (
        <main className="equipment-page">
            <header className="equipment-page-header"><div><p>Operations</p><h1>Equipment Manager</h1></div><div className="equipment-page-header-actions"><span>{equipment.length} records</span><button type="button" className="equipment-create-button" onClick={() => { clearSaveError(); setEditingEquipment(null); setIsCreatingEquipment(true) }}>New Equipment</button></div></header>
            {isLoading ? <div className="equipment-data-state">Loading equipment…</div> : loadError ? (
                <div className="equipment-data-state error"><div><strong>Equipment could not be loaded.</strong><p>{loadError}</p></div><button type="button" onClick={() => void reload()}>Try again</button></div>
            ) : <section className="equipment-list-card">
                <div className="equipment-toolbar">
                    <label className="equipment-search"><span className="equipment-visually-hidden">Search equipment</span><input type="search" placeholder="Search fleet, serial, make, model, Site or Customer" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                    <label>Customer<select value={customerId} onChange={(event) => { const next = event.target.value; setCustomerId(next); if (siteId && !sites.some((site) => site.gr_siteid === siteId && (!next || site.gr_Customer?.gr_customerid === next))) setSiteId('') }}><option value="">All Customers</option>{customers.map((customer) => <option key={customer.gr_customerid} value={customer.gr_customerid}>{customer.gr_name}</option>)}</select></label>
                    <label>Site<select value={siteId} onChange={(event) => setSiteId(event.target.value)}><option value="">All Sites</option>{siteOptions.map((site) => <option key={site.gr_siteid} value={site.gr_siteid}>{site.gr_name || 'Unnamed Site'}</option>)}</select></label>
                    <label>State<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as StateFilter)}><option value="all">All states</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                </div>
                <div className="equipment-results-count">Showing {rows.length} of {equipment.length}</div>
                <EquipmentTable equipment={rows} sortKey={sortKey} sortDirection={sortDirection} onSort={changeSort} onEdit={(item) => { clearSaveError(); setEditingEquipment(item) }} />
            </section>}
            {isCreatingEquipment && <EquipmentDrawer mode="create" customers={customers} sites={sites} jobs={jobs} isSaving={isSaving} saveError={saveError} onClose={() => setIsCreatingEquipment(false)} onCreateCustomer={createCustomer} onCreateSite={createSite} onCreate={async (input) => { await createEquipment(input); setIsCreatingEquipment(false) }} />}
            {editingEquipment && <EquipmentDrawer mode="edit" equipment={editingEquipment} customers={customers} sites={sites} jobs={jobs} isSaving={isSaving} saveError={saveError} onClose={() => setEditingEquipment(null)} onSave={async (input) => { const updated = await updateEquipment(editingEquipment, input); setEditingEquipment(updated) }} onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); setEditingEquipment(null) }} />}
        </main>
    )
}
