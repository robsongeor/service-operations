import { useMemo, useState } from 'react'
import { useEquipmentManager } from '../equipment/hooks/useEquipmentManager'
import EquipmentDrawer from '../equipment/components/EquipmentDrawer'
import { useJobs } from '../jobs/hooks/useJobs'
import JobCreateDrawer, { type JobCreateInitialValues } from '../jobs/components/JobCreateDrawer'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Customer } from '../jobs/types/customer.types'
import type { Site } from '../jobs/types/site.types'
import { calculateHoursRemaining, calculatePrimaryNextService, calculateServiceStatus } from '../equipment/servicePlans/servicePlanStatus'
import { SERVICE_TYPE_OPTIONS } from '../equipment/servicePlans/equipmentServicePlan.types'
import EditDrawerFormDialog from '../shared/drawer/EditDrawerFormDialog'
import './CustomerDashboardScreen.css'

const dateFormatter = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' })

function text(value?: string | null) {
    return value?.trim().toLowerCase() ?? ''
}

function display(value?: string | number | null) {
    return value == null || value === '' ? '-' : value
}

export default function CustomerDashboardScreen() {
    const {
        equipment,
        customers,
        sites,
        jobs,
        servicePlans,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        clearSaveError,
        createSite,
        updateEquipment,
        saveEquipmentMaintenanceHistory,
        deleteEquipment,
    } = useEquipmentManager()
    const {
        equipmentList: jobEquipmentList,
        mechanics,
        sites: jobSites,
        customers: jobCustomers,
        siteContacts,
        servicePlans: jobServicePlans,
        createJob,
        createCustomer: createJobCustomer,
        createSite: createJobSite,
        createContactForSite,
        createEquipment: createJobEquipment,
        createScheduleOption,
    } = useJobs()

    const [search, setSearch] = useState('')
    const [selectedCustomerId, setSelectedCustomerId] = useState('')
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [creatingJobInitialValues, setCreatingJobInitialValues] = useState<JobCreateInitialValues | null>(null)
    const [siteDialogOpen, setSiteDialogOpen] = useState(false)
    const [newSite, setNewSite] = useState({ name: '', address: '' })
    const [siteError, setSiteError] = useState('')

    const customerOptions = useMemo(() => {
        const query = search.trim().toLowerCase()
        return customers
            .filter((customer) => !query || customer.gr_name.toLowerCase().includes(query))
            .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
    }, [customers, search])

    const selectedCustomer = customers.find((customer) => customer.gr_customerid === selectedCustomerId)
    const customerSites = sites
        .filter((site) => site.gr_Customer?.gr_customerid === selectedCustomerId)
        .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
    const customerEquipment = equipment.filter((item) =>
        item.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
    const customerJobs = jobs.filter((job) =>
        job.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
    const openJobs = customerJobs.filter((job) => job.gr_status !== 122830003)
    const lastJob = [...customerJobs].sort((a, b) => b.createdon.localeCompare(a.createdon))[0]

    const maintenanceCounts = customerEquipment.reduce((counts, item) => {
        const plans = servicePlans.filter((plan) =>
            plan._gr_equipment_value?.toLowerCase() === item.gr_equipmentid.toLowerCase(),
        )
        const primary = calculatePrimaryNextService(plans)
        const status = primary ? calculateServiceStatus(item.gr_currenthourmeter ?? 0, primary.gr_nextduehours) : null
        if (status === 'Due Soon') counts.dueSoon += 1
        if (status === 'Overdue' || status === 'Due') counts.overdue += 1
        return counts
    }, { dueSoon: 0, overdue: 0 })

    const summaryCards = [
        { label: 'Sites', value: customerSites.length },
        { label: 'Equipment', value: customerEquipment.length },
        { label: 'Open Jobs', value: openJobs.length },
        { label: 'Services Due Soon', value: maintenanceCounts.dueSoon },
        { label: 'Overdue Services', value: maintenanceCounts.overdue },
        { label: 'Last Job Date', value: lastJob ? dateFormatter.format(new Date(lastJob.createdon)) : '-' },
    ]

    const equipmentForSite = (site: Site) => customerEquipment
        .filter((item) => item.gr_Site?.gr_siteid === site.gr_siteid)
        .sort((a, b) => text(a.gr_fleet).localeCompare(text(b.gr_fleet), undefined, { numeric: true }))

    const initialJobValuesForCustomer = (customer: Customer): JobCreateInitialValues => {
        const onlySite = customerSites.length === 1 ? customerSites[0] : undefined
        return { customerId: customer.gr_customerid, siteId: onlySite?.gr_siteid ?? '' }
    }

    const initialJobValuesForEquipment = (record: Equipment): JobCreateInitialValues => ({
        equipmentId: record.gr_equipmentid,
        siteId: record.gr_Site?.gr_siteid ?? '',
        customerId: record.gr_Site?.gr_Customer?.gr_customerid ?? selectedCustomerId,
    })

    const saveSite = async () => {
        if (!selectedCustomer) return
        const name = newSite.name.trim()
        if (!name) {
            setSiteError('Enter a site name.')
            return
        }
        try {
            setSiteError('')
            await createSite({
                customerId: selectedCustomer.gr_customerid,
                name,
                address: newSite.address.trim() || undefined,
            }, selectedCustomer)
            setNewSite({ name: '', address: '' })
            setSiteDialogOpen(false)
        } catch (error) {
            setSiteError(error instanceof Error ? error.message : 'Site could not be created.')
        }
    }

    return <main className="customer-dashboard-page">
        <header className="customer-dashboard-selector">
            <div>
                <p>Customers</p>
                <h1>Customer Dashboard</h1>
            </div>
            <label>
                <span>Search customer</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type customer name" />
            </label>
            <label>
                <span>Select customer</span>
                <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                    <option value="">Select a customer</option>
                    {customerOptions.map((customer) => <option key={customer.gr_customerid} value={customer.gr_customerid}>{customer.gr_name}</option>)}
                </select>
            </label>
        </header>

        {isLoading ? <section className="customer-dashboard-state">Loading customer data...</section> : loadError ? (
            <section className="customer-dashboard-state error">
                <div><strong>Customer dashboard could not be loaded.</strong><p>{loadError}</p></div>
                <button type="button" onClick={() => void reload()}>Try again</button>
            </section>
        ) : !selectedCustomer ? (
            <section className="customer-dashboard-empty">
                <strong>Select a Customer</strong>
                <p>Choose a customer above to view sites, equipment, jobs, and the dashboard foundation for future service history and reporting.</p>
            </section>
        ) : <>
            <section className="customer-dashboard-header">
                <div>
                    <span>Customer account</span>
                    <h2>{selectedCustomer.gr_name}</h2>
                </div>
                <div className="customer-dashboard-actions">
                    <button type="button" onClick={() => setCreatingJobInitialValues(initialJobValuesForCustomer(selectedCustomer))}>Create Job</button>
                    <button type="button" onClick={() => { setSiteError(''); setNewSite({ name: '', address: '' }); setSiteDialogOpen(true) }}>Add Site</button>
                    <button type="button" disabled title="Customer editing will be added in a future dashboard iteration.">Edit Customer</button>
                </div>
            </section>

            <section className="customer-summary-grid" aria-label="Customer summary">
                {summaryCards.map((card) => <article key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                </article>)}
            </section>

            <section className="customer-dashboard-content">
                <div className="customer-section-heading">
                    <div>
                        <span>Current section</span>
                        <h3>Sites and Equipment</h3>
                    </div>
                    <small>Future sections: Overview, Jobs, Service History, Contacts, Documents, Audit Reporting</small>
                </div>

                {customerSites.length === 0 ? <div className="customer-dashboard-empty compact">No sites have been recorded for this customer yet.</div> : customerSites.map((site) => {
                    const rows = equipmentForSite(site)
                    return <article className="customer-site-card" key={site.gr_siteid}>
                        <header>
                            <div><h4>{site.gr_name || 'Unnamed Site'}</h4><p>{site.gr_address || 'No address recorded'}</p></div>
                            <span>{rows.length} {rows.length === 1 ? 'equipment' : 'equipment'}</span>
                        </header>
                        <div className="customer-equipment-table-wrap">
                            <table className="customer-equipment-table">
                                <thead><tr><th>Fleet Number</th><th>Make</th><th>Model</th><th>Current Hour Meter</th><th>Next Service</th><th>Maintenance Status</th></tr></thead>
                                <tbody>
                                    {rows.length === 0 ? <tr><td colSpan={6}>No equipment recorded for this site.</td></tr> : rows.map((item) => {
                                        const plans = servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === item.gr_equipmentid.toLowerCase())
                                        const primary = calculatePrimaryNextService(plans)
                                        const remaining = primary ? calculateHoursRemaining(item.gr_currenthourmeter ?? 0, primary.gr_nextduehours) : null
                                        const status = primary ? calculateServiceStatus(item.gr_currenthourmeter ?? 0, primary.gr_nextduehours) : null
                                        const serviceLabel = primary ? SERVICE_TYPE_OPTIONS.find((option) => option.value === primary.gr_servicetype)?.label : null
                                        return <tr key={item.gr_equipmentid} tabIndex={0} onClick={() => { clearSaveError(); setEditingEquipment(item) }} onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault()
                                                clearSaveError()
                                                setEditingEquipment(item)
                                            }
                                        }}>
                                            <td><strong>{display(item.gr_fleet)}</strong></td>
                                            <td>{display(item.gr_make)}</td>
                                            <td>{display(item.gr_model)}</td>
                                            <td>{display(item.gr_currenthourmeter)}</td>
                                            <td>{primary ? `${serviceLabel} @ ${primary.gr_nextduehours}` : 'Not Configured'}{remaining != null && <small>{Math.abs(remaining)} hrs {remaining < 0 ? 'overdue' : 'remaining'}</small>}</td>
                                            <td><span className={`customer-maintenance-status status-${status?.toLowerCase().replace(' ', '-') ?? 'unknown'}`}>{status ?? 'Unknown'}</span></td>
                                        </tr>
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </article>
                })}
            </section>
        </>}

        {editingEquipment && <EquipmentDrawer
            mode="edit"
            equipment={editingEquipment}
            equipmentList={equipment}
            servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === editingEquipment.gr_equipmentid.toLowerCase())}
            customers={customers}
            sites={sites}
            jobs={jobs}
            isSaving={isSaving}
            saveError={saveError}
            onClose={() => setEditingEquipment(null)}
            onSave={async (input) => { const updated = await updateEquipment(editingEquipment, input); setEditingEquipment(updated) }}
            onSaveMaintenanceHistory={async (plans, input) => { const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input); setEditingEquipment(updated.equipment) }}
            onCreateJob={(record) => { setEditingEquipment(null); setCreatingJobInitialValues(initialJobValuesForEquipment(record)) }}
            onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); setEditingEquipment(null) }}
        />}

        {creatingJobInitialValues && <JobCreateDrawer
            mechanics={mechanics}
            equipmentList={jobEquipmentList}
            sites={jobSites}
            customers={jobCustomers}
            siteContacts={siteContacts}
            servicePlans={jobServicePlans}
            initialValues={creatingJobInitialValues}
            onCreateCustomer={createJobCustomer}
            onCreateSite={createJobSite}
            onCreateContact={createContactForSite}
            onCreateEquipment={createJobEquipment}
            onCreateJob={async (input) => {
                const jobId = await createJob(input)
                await reload()
                return jobId
            }}
            onCreateScheduleOption={createScheduleOption}
            onClose={() => setCreatingJobInitialValues(null)}
        />}

        {siteDialogOpen && selectedCustomer && <EditDrawerFormDialog
            eyebrow="Customer site"
            title="Add Site"
            error={siteError}
            isBusy={isSaving}
            submitLabel={isSaving ? 'Adding...' : 'Add Site'}
            onCancel={() => setSiteDialogOpen(false)}
            onSubmit={() => void saveSite()}
        >
            <p className="edit-form-dialog-context">Customer: {selectedCustomer.gr_name}</p>
            <label>Site name<input autoFocus value={newSite.name} onChange={(event) => { setNewSite({ ...newSite, name: event.target.value }); setSiteError('') }} /></label>
            <label>Site address (optional)<input value={newSite.address} onChange={(event) => { setNewSite({ ...newSite, address: event.target.value }); setSiteError('') }} /></label>
        </EditDrawerFormDialog>}
    </main>
}
