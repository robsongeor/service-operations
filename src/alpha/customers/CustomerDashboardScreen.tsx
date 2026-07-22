import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEquipmentManager } from '../equipment/hooks/useEquipmentManager'
import EquipmentDrawer from '../equipment/components/EquipmentDrawer'
import { useJobs } from '../jobs/hooks/useJobs'
import JobCreateDrawer, { type JobCreateInitialValues } from '../jobs/components/JobCreateDrawer'
import JobEditDrawer from '../jobs/components/JobEditDrawer'
import type { Job } from '../jobs/types/job.types'
import { isOpenJob } from '../jobs/types/jobOpen'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Customer } from '../jobs/types/customer.types'
import type { Site } from '../jobs/types/site.types'
import { calculateHoursRemaining, calculatePrimaryNextService, calculateServiceStatus } from '../equipment/servicePlans/servicePlanStatus'
import { SERVICE_TYPE_OPTIONS } from '../equipment/servicePlans/equipmentServicePlan.types'
import CustomerDrawer, { type CustomerDraft } from './CustomerDrawer'
import { customerContactsFromSiteLinks, type CustomerContact } from './customerContact.types'
import CustomerOpenJobsTab from './CustomerOpenJobsTab'
import CustomerQuotesTab from './CustomerQuotesTab'
import './CustomerDashboardScreen.css'

const dateFormatter = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' })

function text(value?: string | null) {
    return value?.trim().toLowerCase() ?? ''
}

function display(value?: string | number | null) {
    return value == null || value === '' ? '-' : value
}

export default function CustomerDashboardScreen() {
    const navigate = useNavigate()
    const {
        equipment,
        customers,
        sites,
        jobs: equipmentJobs,
        servicePlans,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        clearSaveError,
        updateEquipment,
        saveEquipmentMaintenanceHistory,
        deleteEquipment,
    } = useEquipmentManager()
    const {
        jobs: operationalJobs,
        equipmentList: jobEquipmentList,
        mechanics,
        sites: jobSites,
        customers: jobCustomers,
        siteContacts,
        servicePlans: jobServicePlans,
        scheduleOptions,
        jobQuotes,
        jobAssignments,
        officeUpdates,
        createJob,
        createCustomer: createJobCustomer,
        createSite: createJobSite,
        createContactForSite,
        createEquipment: createJobEquipment,
        createScheduleOption,
        updateScheduleOption,
        deleteScheduleOption,
        updateJob,
        deleteJob,
        updateJobCardStatus,
        sendPrimaryJobEmail,
        sendAssignmentJobEmail,
        createJobAssignment,
        deleteJobAssignment,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        isLoading: isJobsLoading,
        loadError: jobsLoadError,
    } = useJobs()

    const [search, setSearch] = useState('')
    const [selectedCustomerId, setSelectedCustomerId] = useState('')
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [creatingJobInitialValues, setCreatingJobInitialValues] = useState<JobCreateInitialValues | null>(null)
    const [editingJob, setEditingJob] = useState<Job | null>(null)
    const [activeTab, setActiveTab] = useState<'sites' | 'open-jobs' | 'quotes' | 'contacts' | 'info'>('sites')
    const [customerDrawerMode, setCustomerDrawerMode] = useState<'create' | 'edit' | null>(null)
    const [localCustomers, setLocalCustomers] = useState<Customer[]>([])
    const [customerDrafts, setCustomerDrafts] = useState<Record<string, CustomerDraft>>({})

    const allCustomers = useMemo(() => [...customers, ...localCustomers].map((customer) => ({
        ...customer,
        gr_name: customerDrafts[customer.gr_customerid]?.name ?? customer.gr_name,
    })), [customerDrafts, customers, localCustomers])

    const allSites = useMemo(() => {
        const customersWithDrafts = new Set(Object.keys(customerDrafts))
        const unchangedSites = sites.filter((site) => !site.gr_Customer?.gr_customerid || !customersWithDrafts.has(site.gr_Customer.gr_customerid))
        const draftSites = Object.entries(customerDrafts).flatMap(([customerId, draft]) => draft.sites.map((site) => ({
            gr_siteid: site.id,
            gr_name: site.name,
            gr_address: site.address,
            gr_Customer: { gr_customerid: customerId, gr_name: draft.name },
        })))
        return [...unchangedSites, ...draftSites]
    }, [customerDrafts, sites])

    const customerOptions = useMemo(() => {
        const query = search.trim().toLowerCase()
        return allCustomers
            .filter((customer) => !query || customer.gr_name.toLowerCase().includes(query))
            .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
    }, [allCustomers, search])

    const selectedCustomer = allCustomers.find((customer) => customer.gr_customerid === selectedCustomerId)
    const customerSites = allSites
        .filter((site) => site.gr_Customer?.gr_customerid === selectedCustomerId)
        .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
    const selectedCustomerDraft = customerDrafts[selectedCustomerId]
    const customerContacts: CustomerContact[] = [
        ...(selectedCustomerDraft?.accountsContact ? [{
            id: `prototype-accounts-${selectedCustomerId}`,
            name: selectedCustomerDraft.accountsContact,
            phone: selectedCustomerDraft.accountsPhone || undefined,
            email: selectedCustomerDraft.accountsEmail || undefined,
            role: 'Accounts',
            siteIds: [],
            isPrimary: true,
        }] : []),
        ...customerContactsFromSiteLinks(siteContacts, new Set(customerSites.map((site) => site.gr_siteid))),
    ]
    const customerEquipment = equipment.filter((item) =>
        item.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
    const customerJobs = operationalJobs.filter((job) =>
        job.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
    const openJobs = customerJobs.filter(isOpenJob)
    const customerQuotes = jobQuotes.filter((quote) =>
        quote.gr_Job?.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
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

    const customerDrawerInitialValue = selectedCustomer ? customerDrafts[selectedCustomer.gr_customerid] ?? {
        name: selectedCustomer.gr_name,
        accountsContact: '',
        accountsPhone: '',
        accountsEmail: '',
        purchaseOrderRequirements: '',
        notes: '',
        sites: customerSites.map((site) => ({
            id: site.gr_siteid,
            name: site.gr_name,
            address: site.gr_address,
            operatingHours: '',
        })),
    } : undefined

    const saveCustomerDraft = (draft: CustomerDraft) => {
        if (customerDrawerMode === 'create') {
            const customerId = `prototype-customer-${crypto.randomUUID()}`
            setLocalCustomers((current) => [...current, { gr_customerid: customerId, gr_name: draft.name }])
            setCustomerDrafts((current) => ({ ...current, [customerId]: draft }))
            setSelectedCustomerId(customerId)
            setActiveTab('sites')
        } else if (selectedCustomer) {
            setCustomerDrafts((current) => ({ ...current, [selectedCustomer.gr_customerid]: draft }))
        }
        setCustomerDrawerMode(null)
    }

    return <main className="customer-dashboard-page">
        <header className="customer-dashboard-selector">
            <div className="customer-dashboard-title">
                <p>Customers</p>
                <h1>Customer Dashboard</h1>
                <button type="button" onClick={() => setCustomerDrawerMode('create')}>+ Create Customer</button>
            </div>
            <label>
                <span>Search customer</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type customer name" />
            </label>
            <label>
                <span>Select customer</span>
                <select value={selectedCustomerId} onChange={(event) => { setSelectedCustomerId(event.target.value); setActiveTab('sites') }}>
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
                    <button
                        type="button"
                        disabled={selectedCustomer.gr_customerid.startsWith('prototype-customer-')}
                        title={selectedCustomer.gr_customerid.startsWith('prototype-customer-') ? 'Save this Customer to Dataverse before creating Jobs.' : undefined}
                        onClick={() => setCreatingJobInitialValues(initialJobValuesForCustomer(selectedCustomer))}
                    >Create Job</button>
                    <button type="button" onClick={() => setCustomerDrawerMode('edit')}>Add Site</button>
                    <button type="button" onClick={() => setCustomerDrawerMode('edit')}>Edit Customer</button>
                </div>
            </section>

            <section className="customer-summary-grid" aria-label="Customer summary">
                {summaryCards.map((card) => <article key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                </article>)}
            </section>

            <nav className="customer-dashboard-tabs" aria-label="Customer sections" role="tablist">
                <button type="button" role="tab" aria-selected={activeTab === 'sites'} className={activeTab === 'sites' ? 'active' : ''} onClick={() => setActiveTab('sites')}>Sites <span>{customerSites.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'open-jobs'} className={activeTab === 'open-jobs' ? 'active' : ''} onClick={() => setActiveTab('open-jobs')}>Open Jobs <span>{openJobs.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'quotes'} className={activeTab === 'quotes' ? 'active' : ''} onClick={() => setActiveTab('quotes')}>Quotes <span>{customerQuotes.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'contacts'} className={activeTab === 'contacts' ? 'active' : ''} onClick={() => setActiveTab('contacts')}>Contacts <span>{customerContacts.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'info'} className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}>Info</button>
            </nav>

            {activeTab === 'sites' ? <section className="customer-dashboard-content" role="tabpanel">
                <div className="customer-section-heading">
                    <div>
                        <span>Current section</span>
                        <h3>Sites and Equipment</h3>
                    </div>
                    <small>Future sections: Overview, Jobs, Service History, Contacts, Documents, Audit Reporting</small>
                </div>

                {customerSites.length === 0 ? <div className="customer-dashboard-empty compact">No sites have been recorded for this customer yet.</div> : customerSites.map((site) => {
                    const rows = equipmentForSite(site)
                    const operatingHours = customerDrafts[selectedCustomer.gr_customerid]?.sites.find((item) => item.id === site.gr_siteid)?.operatingHours
                    return <article className="customer-site-card" key={site.gr_siteid}>
                        <header>
                            <div><h4>{site.gr_name || 'Unnamed Site'}</h4><p>{site.gr_address || 'No address recorded'}</p></div>
                            <div className="customer-site-meta">
                                <div><small>Operating hours</small><strong>{operatingHours || 'Not recorded'}</strong></div>
                                <span>{rows.length} {rows.length === 1 ? 'equipment' : 'equipment'}</span>
                            </div>
                        </header>
                        <div className="customer-equipment-table-wrap">
                            <table className="customer-equipment-table">
                                <thead><tr><th>Fleet Number</th><th>Make</th><th>Model</th><th>Last Known Hour Meter</th><th>Next Service</th><th>Maintenance Status</th></tr></thead>
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
            </section> : activeTab === 'open-jobs' ? <CustomerOpenJobsTab
                jobs={openJobs}
                officeUpdates={officeUpdates}
                isLoading={isJobsLoading}
                error={jobsLoadError}
                onOpenJob={setEditingJob}
            /> : activeTab === 'quotes' ? <CustomerQuotesTab
                quotes={customerQuotes}
                sites={customerSites}
                isLoading={isJobsLoading}
                error={jobsLoadError}
                onOpenQuote={(quote) => navigate(`/quotes?quoteId=${encodeURIComponent(quote.gr_quoteid)}`)}
            /> : activeTab === 'contacts' ? <section className="customer-contacts-panel" role="tabpanel">
                <header>
                    <div><span>Customer contacts</span><h3>Contacts</h3></div>
                    <button type="button" disabled title="Contact editing will be added in a future prototype iteration.">+ Add Contact</button>
                </header>
                {customerContacts.length === 0 ? <div className="customer-contacts-empty">
                    <strong>No contacts have been added for this Customer.</strong>
                    <p>Customer-wide and Site-linked contacts will appear here.</p>
                    <button type="button" disabled>Add Contact</button>
                </div> : <div className="customer-contact-list">
                    {customerContacts.map((contact) => {
                        const linkedSites = contact.siteIds
                            .map((siteId) => customerSites.find((site) => site.gr_siteid === siteId))
                            .filter((site): site is Site => Boolean(site))
                        const visibleSites = linkedSites.slice(0, 3)
                        const additionalSiteCount = linkedSites.length - visibleSites.length
                        return <article key={contact.id}>
                            <div className="customer-contact-identity">
                                <div><strong>{contact.name}</strong>{contact.isPrimary && <span>Primary</span>}</div>
                                {contact.role && <small>{contact.role}</small>}
                            </div>
                            <div className="customer-contact-details">
                                {contact.phone && <span>{contact.phone}</span>}
                                {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                                {!contact.phone && !contact.email && <span className="muted">No contact details recorded</span>}
                            </div>
                            <div className="customer-contact-sites">
                                {linkedSites.length === 0 ? <span className="customer-wide">Customer-wide</span> : <>
                                    {visibleSites.map((site) => <span key={site.gr_siteid}>{site.gr_name || 'Unnamed Site'}</span>)}
                                    {additionalSiteCount > 0 && <span>+{additionalSiteCount} more</span>}
                                </>}
                            </div>
                        </article>
                    })}
                </div>}
            </section> : <section className="customer-info-panel" role="tabpanel">
                <header>
                    <div><span>Customer information</span><h3>{selectedCustomer.gr_name}</h3></div>
                    <button type="button" onClick={() => setCustomerDrawerMode('edit')}>Edit information</button>
                </header>
                <dl className="customer-info-summary">
                    <div><dt>Name</dt><dd>{selectedCustomer.gr_name}</dd></div>
                    <div><dt>Accounts Contact</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.accountsContact || 'Not recorded'}</dd></div>
                    <div><dt>Accounts Phone</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.accountsPhone || 'Not recorded'}</dd></div>
                    <div><dt>Accounts Email</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.accountsEmail || 'Not recorded'}</dd></div>
                    <div><dt>Purchase Order Requirements</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.purchaseOrderRequirements || 'Not recorded'}</dd></div>
                    <div><dt>Site Count</dt><dd>{customerSites.length} {customerSites.length === 1 ? 'Site' : 'Sites'}</dd></div>
                    <div><dt>Contact Count</dt><dd>{customerContacts.length} {customerContacts.length === 1 ? 'Contact' : 'Contacts'}</dd></div>
                </dl>
                <div className="customer-info-notes">
                    <div className="customer-section-heading"><div><span>Long-term information</span><h3>Customer Notes</h3></div></div>
                    <p>{customerDrafts[selectedCustomer.gr_customerid]?.notes || 'No Customer notes have been recorded.'}</p>
                </div>
                {!customerDrafts[selectedCustomer.gr_customerid] && <p className="customer-info-prototype-note">Customer information is currently a local prototype and is not loaded from Dataverse.</p>}
            </section>}
        </>}

        {editingEquipment && <EquipmentDrawer
            mode="edit"
            equipment={editingEquipment}
            equipmentList={equipment}
            servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === editingEquipment.gr_equipmentid.toLowerCase())}
            customers={customers}
            sites={sites}
            jobs={equipmentJobs}
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

        {editingJob && <JobEditDrawer
            job={editingJob}
            mechanics={mechanics}
            equipmentList={jobEquipmentList}
            sites={jobSites}
            customers={jobCustomers}
            siteContacts={siteContacts}
            servicePlans={jobServicePlans}
            onCreateCustomer={createJobCustomer}
            onCreateSite={createJobSite}
            onCreateContact={createContactForSite}
            onCreateEquipment={createJobEquipment}
            onSave={updateJob}
            onDelete={deleteJob}
            scheduleOptions={scheduleOptions}
            onCreateScheduleOption={createScheduleOption}
            onUpdateScheduleOption={updateScheduleOption}
            onDeleteScheduleOption={deleteScheduleOption}
            quotes={jobQuotes.filter((quote) => quote._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
            assignments={jobAssignments.filter((assignment) => assignment._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
            onCreateQuote={(jobId) => { setEditingJob(null); navigate(`/quotes?new=1&jobId=${encodeURIComponent(jobId)}`) }}
            onOpenQuote={(quoteId) => { setEditingJob(null); navigate(`/quotes?quoteId=${encodeURIComponent(quoteId)}`) }}
            onJobCardStatusChange={updateJobCardStatus}
            onCreateAssignment={createJobAssignment}
            onSendPrimary={sendPrimaryJobEmail}
            onSendAssignment={sendAssignmentJobEmail}
            onDeleteAssignment={deleteJobAssignment}
            officeUpdates={officeUpdates.filter((update) => update.jobId.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
            onCreateOfficeUpdate={createJobOfficeUpdate}
            onSaveOfficeAttention={updateJobOfficeAttention}
            onClose={() => setEditingJob(null)}
        />}

        {customerDrawerMode && <CustomerDrawer
            key={`${customerDrawerMode}-${selectedCustomerId}`}
            mode={customerDrawerMode}
            initialValue={customerDrawerMode === 'edit' ? customerDrawerInitialValue : undefined}
            onClose={() => setCustomerDrawerMode(null)}
            onSave={saveCustomerDraft}
        />}
    </main>
}
