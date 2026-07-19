import { useMemo, useState, type FormEvent } from 'react'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Customer } from '../../jobs/types/customer.types'
import type { Job } from '../../jobs/types/job.types'
import type { Site } from '../../jobs/types/site.types'
import { getJobCardStatus, JOB_CARD_STATUS_OPTIONS } from '../../jobs/types/jobCardStatus.types'
import { getJobTypeLabel } from '../../jobs/types/jobType.types'
import { JOB_STATUS_OPTIONS } from '../../jobs/types/jobStatus.types'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import type { EquipmentServicePlan } from '../servicePlans/equipmentServicePlan.types'
import { SERVICE_TYPES, SERVICE_TYPE_OPTIONS, type PlannedServiceType } from '../servicePlans/equipmentServicePlan.types'
import type { MaintenanceHistoryInput } from '../servicePlans/servicePlanApi'
import { calculateHoursRemaining, calculateServiceStatus } from '../servicePlans/servicePlanStatus'
import type { EquipmentUpdateInput } from '../types/equipmentManager.types'

type SharedProps = {
    customers: Customer[]
    sites: Site[]
    jobs: Job[]
    isSaving: boolean
    saveError: string
    onClose: () => void
}

type CreateProps = SharedProps & {
    mode: 'create'
    onCreate: (input: EquipmentUpdateInput) => Promise<void>
    onCreateCustomer: (input: { name: string }) => Promise<Customer>
    onCreateSite: (input: { customerId: string; name: string; address?: string }, customer?: Customer) => Promise<Site>
}

type EditProps = SharedProps & {
    mode: 'edit'
    equipment: Equipment
    servicePlans: EquipmentServicePlan[]
    onSave: (input: EquipmentUpdateInput) => Promise<void>
    onSaveMaintenanceHistory: (plans: EquipmentServicePlan[], input: MaintenanceHistoryInput) => Promise<void>
    onCreateJob: (equipment: Equipment) => void
    onDelete: () => Promise<void>
}

type Props = CreateProps | EditProps
type EquipmentDrawerTab = 'details' | 'maintenance' | 'history'
type MaintenanceHistoryForm = {
    currentHourMeter: string
    plans: Record<PlannedServiceType, { lastCompletedDate: string; lastCompletedHours: string }>
}

const PLANNED_SERVICE_TYPES: PlannedServiceType[] = [SERVICE_TYPES.A, SERVICE_TYPES.B, SERVICE_TYPES.C]

const optionLabel = (site: Site) => `${site.gr_Customer?.gr_name || 'Customer not set'} - ${site.gr_name || 'Unnamed site'}`

const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' }).format(date)
}

export default function EquipmentDrawer(props: Props) {
    const { customers, sites, jobs, isSaving, saveError, onClose } = props
    const isCreate = props.mode === 'create'
    const equipment = isCreate ? undefined : props.equipment
    const [form, setForm] = useState<EquipmentUpdateInput>({
        fleet: equipment?.gr_fleet ?? '',
        make: equipment?.gr_make ?? '',
        model: equipment?.gr_model ?? '',
        serial: equipment?.gr_serial ?? '',
        siteId: equipment?.gr_Site?.gr_siteid ?? '',
    })
    const [customerId, setCustomerId] = useState(equipment?.gr_Site?.gr_Customer?.gr_customerid ?? '')
    const [formError, setFormError] = useState('')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const [relatedDialog, setRelatedDialog] = useState<'' | 'customerSite' | 'site'>('')
    const [isCreatingRelated, setIsCreatingRelated] = useState(false)
    const [relatedError, setRelatedError] = useState('')
    const [newCustomerName, setNewCustomerName] = useState('')
    const [newSite, setNewSite] = useState({ name: '', address: '' })
    const [createdCustomer, setCreatedCustomer] = useState<Customer | null>(null)
    const [activeTab, setActiveTab] = useState<EquipmentDrawerTab>('details')
    const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
    const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceHistoryForm>(() => ({
        currentHourMeter: String(equipment?.gr_currenthourmeter ?? 0),
        plans: {
            [SERVICE_TYPES.A]: { lastCompletedDate: '', lastCompletedHours: '' },
            [SERVICE_TYPES.B]: { lastCompletedDate: '', lastCompletedHours: '' },
            [SERVICE_TYPES.C]: { lastCompletedDate: '', lastCompletedHours: '' },
        },
    }))
    const [maintenanceError, setMaintenanceError] = useState('')

    const history = equipment
        ? jobs
            .filter((job) => job.gr_Equipment?.gr_equipmentid.toLowerCase() === equipment.gr_equipmentid.toLowerCase())
            .sort((a, b) => b.createdon.localeCompare(a.createdon))
        : []
    const customerOptions = useMemo(() => [...customers].sort((a, b) => a.gr_name.localeCompare(b.gr_name)), [customers])
    const visibleSites = sites
        .filter((site) => !customerId || site.gr_Customer?.gr_customerid === customerId)
        .sort((a, b) => optionLabel(a).localeCompare(optionLabel(b)))
    const busy = isSaving || isDeleting || isCreatingRelated
    const equipmentName = equipment ? [equipment.gr_fleet, equipment.gr_make, equipment.gr_model].filter(Boolean).join(' - ') || 'this equipment' : ''
    const plans = isCreate ? [] : props.servicePlans
    const tabs: Array<{ id: EquipmentDrawerTab; label: string; count?: number }> = [
        { id: 'details', label: 'Details' },
        { id: 'maintenance', label: 'Maintenance' },
        { id: 'history', label: 'Job History', count: history.length },
    ]

    const openMaintenanceDialog = () => {
        if (isCreate) return
        setMaintenanceForm({
            currentHourMeter: String(equipment?.gr_currenthourmeter ?? 0),
            plans: {
                [SERVICE_TYPES.A]: {
                    lastCompletedDate: plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.A)?.gr_lastcompleteddate?.slice(0, 10) ?? '',
                    lastCompletedHours: String(plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.A)?.gr_lastcompletedhours ?? ''),
                },
                [SERVICE_TYPES.B]: {
                    lastCompletedDate: plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.B)?.gr_lastcompleteddate?.slice(0, 10) ?? '',
                    lastCompletedHours: String(plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.B)?.gr_lastcompletedhours ?? ''),
                },
                [SERVICE_TYPES.C]: {
                    lastCompletedDate: plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.C)?.gr_lastcompleteddate?.slice(0, 10) ?? '',
                    lastCompletedHours: String(plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.C)?.gr_lastcompletedhours ?? ''),
                },
            },
        })
        setMaintenanceError('')
        setMaintenanceDialogOpen(true)
    }

    const updateMaintenancePlanField = (serviceType: PlannedServiceType, field: 'lastCompletedDate' | 'lastCompletedHours', value: string) => {
        setMaintenanceForm((current) => ({
            ...current,
            plans: {
                ...current.plans,
                [serviceType]: { ...current.plans[serviceType], [field]: value },
            },
        }))
        if (maintenanceError) setMaintenanceError('')
    }

    const saveMaintenanceHistory = async () => {
        if (isCreate) return
        const currentHourMeter = Number(maintenanceForm.currentHourMeter)
        if (!Number.isFinite(currentHourMeter) || currentHourMeter < 0) {
            setMaintenanceError('Current Hour Meter cannot be negative.')
            return
        }

        const today = new Date().toISOString().slice(0, 10)
        const nextPlans: MaintenanceHistoryInput['plans'] = []
        for (const serviceType of PLANNED_SERVICE_TYPES) {
            const values = maintenanceForm.plans[serviceType]
            const hours = values.lastCompletedHours === '' ? null : Number(values.lastCompletedHours)
            if (hours != null && (!Number.isFinite(hours) || hours < 0)) {
                setMaintenanceError('Last Completed Hours cannot be negative.')
                return
            }
            if (values.lastCompletedDate && values.lastCompletedDate > today) {
                setMaintenanceError('Last Completed Date cannot be in the future.')
                return
            }
            if (hours != null && currentHourMeter < hours) {
                setMaintenanceError('Current Hour Meter cannot be less than any entered Last Completed Hours.')
                return
            }
            nextPlans.push({
                serviceType,
                lastCompletedDate: values.lastCompletedDate || null,
                lastCompletedHours: hours,
            })
        }

        try {
            setMaintenanceError('')
            await props.onSaveMaintenanceHistory(plans, {
                currentHourMeter,
                plans: nextPlans,
            })
            setMaintenanceDialogOpen(false)
        } catch (error) {
            setMaintenanceError(error instanceof Error ? error.message : 'Maintenance history could not be saved.')
        }
    }

    const save = async (event: FormEvent) => {
        event.preventDefault()
        const trimmed = {
            ...form,
            fleet: form.fleet.trim(),
            make: form.make.trim(),
            model: form.model.trim(),
            serial: form.serial.trim(),
        }
        if (isCreate && !trimmed.fleet && !trimmed.serial) {
            setFormError('Enter either a fleet number or serial number.')
            return
        }
        try {
            setFormError('')
            if (isCreate) await props.onCreate(trimmed)
            else await props.onSave(trimmed)
        } catch {
            // The hook provides the API error in saveError.
        }
    }

    const deleteRecord = async () => {
        if (isCreate) return
        try {
            setIsDeleting(true)
            setDeleteError('')
            await props.onDelete()
            setShowDeleteConfirm(false)
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : 'The equipment could not be deleted. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    const close = () => {
        if (!busy) {
            setShowDeleteConfirm(false)
            onClose()
        }
    }

    const updateField = (field: keyof EquipmentUpdateInput, value: string) => {
        setForm((current) => ({ ...current, [field]: value }))
        if (formError) setFormError('')
    }

    const cancelRelatedCreate = () => {
        setRelatedDialog('')
        setRelatedError('')
        setNewCustomerName('')
        setNewSite({ name: '', address: '' })
        setCreatedCustomer(null)
    }

    const createCustomerAndSite = async () => {
        if (!isCreate) return
        const customerName = newCustomerName.trim()
        const siteName = newSite.name.trim()
        if (!customerName) {
            setRelatedError('Enter a customer name.')
            return
        }
        if (!siteName) {
            setRelatedError('Enter a site name.')
            return
        }
        try {
            setIsCreatingRelated(true)
            setRelatedError('')
            const customer = createdCustomer ?? await props.onCreateCustomer({ name: customerName })
            if (!createdCustomer) {
                setCreatedCustomer(customer)
                setCustomerId(customer.gr_customerid)
            }
            const site = await props.onCreateSite({
                customerId: customer.gr_customerid,
                name: siteName,
                address: newSite.address.trim() || undefined,
            }, customer)
            setCustomerId(customer.gr_customerid)
            updateField('siteId', site.gr_siteid)
            cancelRelatedCreate()
        } catch (error) {
            setRelatedError(error instanceof Error ? error.message : createdCustomer ? 'Site could not be created.' : 'Customer or site could not be created.')
        } finally {
            setIsCreatingRelated(false)
        }
    }

    const createSite = async () => {
        if (!isCreate) return
        if (!customerId) {
            setRelatedError('Select or create a Customer first.')
            return
        }
        const name = newSite.name.trim()
        if (!name) {
            setRelatedError('Enter a site name.')
            return
        }
        try {
            setIsCreatingRelated(true)
            setRelatedError('')
            const customer = customers.find((item) => item.gr_customerid === customerId)
            const site = await props.onCreateSite({ customerId, name, address: newSite.address.trim() || undefined }, customer)
            updateField('siteId', site.gr_siteid)
            cancelRelatedCreate()
        } catch (error) {
            setRelatedError(error instanceof Error ? error.message : 'Site could not be created.')
        } finally {
            setIsCreatingRelated(false)
        }
    }

    return <>
        <EditDrawerShell
            eyebrow={isCreate ? 'Equipment manager' : 'Equipment workspace'}
            title={isCreate ? 'New Equipment' : equipment?.gr_fleet || 'Equipment details'}
            busy={busy}
            onClose={close}
            headerAction={!isCreate && <button type="button" className="equipment-create-job-button" onClick={() => props.onCreateJob(props.equipment)} disabled={busy}>Create Job</button>}
            footer={<>
                <div className="equipment-footer-leading">
                    {!isCreate && <button type="button" className="equipment-delete-button" disabled={busy || history.length > 0} onClick={() => { setDeleteError(''); setShowDeleteConfirm(true) }}>Delete equipment</button>}
                    {!isCreate && history.length > 0 && <span className="equipment-delete-blocked" role="status">This equipment cannot be deleted because it has linked job history. Historical records must be preserved.</span>}
                    {formError || saveError
                        ? <span className="equipment-footer-error" role="alert">{formError || saveError}</span>
                        : !isCreate && history.length === 0 && <span>Save to update this equipment in Dataverse.</span>}
                </div>
                <div className="equipment-footer-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="primary" type="submit" form="equipment-edit-form" disabled={busy}>{isSaving ? (isCreate ? 'Creating...' : 'Saving...') : isCreate ? 'Create Equipment' : 'Save changes'}</button></div>
            </>}
        >
            <form id="equipment-edit-form" onSubmit={(event) => void save(event)}>
                {!isCreate && <nav className="equipment-edit-tabs" aria-label="Equipment sections">
                    {tabs.map((tab) => <button
                        key={tab.id}
                        type="button"
                        className={activeTab === tab.id ? 'active' : ''}
                        aria-selected={activeTab === tab.id}
                        role="tab"
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                        {tab.count != null && tab.count > 0 && <span>{tab.count}</span>}
                    </button>)}
                </nav>}

                <div className="equipment-edit-tab-panel" role="tabpanel">
                    {(isCreate || activeTab === 'details') && <EditDrawerSection title={isCreate ? 'Equipment details' : 'Current master record'} meta={!isCreate && <span className={equipment?.statecode === 0 ? 'equipment-state active' : 'equipment-state'}>{equipment?.statecode === 0 ? 'Active' : 'Inactive'}</span>}>
                        {!isCreate && <p className="equipment-state-note">State is read-only until Equipment status reason values are confirmed.</p>}
                        <div className="equipment-form-grid">
                            <label>Fleet number<input value={form.fleet} onChange={(event) => updateField('fleet', event.target.value)} /></label>
                            <label>Serial number<input value={form.serial} onChange={(event) => updateField('serial', event.target.value)} /></label>
                            <label>Make<input value={form.make} onChange={(event) => updateField('make', event.target.value)} /></label>
                            <label>Model<input value={form.model} onChange={(event) => updateField('model', event.target.value)} /></label>
                            <label>Customer (site filter)<select value={customerId} onChange={(event) => {
                                const next = event.target.value
                                if (isCreate && next === '__new_customer_site__') {
                                    setNewCustomerName('')
                                    setNewSite({ name: '', address: '' })
                                    setCreatedCustomer(null)
                                    setRelatedError('')
                                    setRelatedDialog('customerSite')
                                    return
                                }
                                setCustomerId(next)
                                if (form.siteId && !sites.some((site) => site.gr_siteid === form.siteId && (!next || site.gr_Customer?.gr_customerid === next))) updateField('siteId', '')
                            }}>
                                <option value="">All customers</option>
                                {isCreate && <option value="__new_customer_site__">+ Add new customer and site</option>}
                                {customerOptions.map((customer) => <option key={customer.gr_customerid} value={customer.gr_customerid}>{customer.gr_name}</option>)}
                            </select></label>
                            <label>Current Site<select value={form.siteId} onChange={(event) => {
                                if (isCreate && event.target.value === '__new_site__') {
                                    if (!customerId) return
                                    setNewSite({ name: '', address: '' })
                                    setRelatedError('')
                                    setRelatedDialog('site')
                                    return
                                }
                                updateField('siteId', event.target.value)
                            }}>
                                <option value="">No Site</option>
                                {isCreate && customerId && <option value="__new_site__">+ Add new site</option>}
                                {visibleSites.map((site) => <option key={site.gr_siteid} value={site.gr_siteid}>{optionLabel(site)}</option>)}
                            </select></label>
                        </div>
                    </EditDrawerSection>}

                    {!isCreate && activeTab === 'maintenance' && <EditDrawerSection title="Maintenance" meta={<span>Current hour meter: {equipment?.gr_currenthourmeter ?? '-'}</span>}>
                        <div className="equipment-maintenance-actions">
                            <button type="button" onClick={openMaintenanceDialog} disabled={busy}>Edit Maintenance History</button>
                        </div>
                        <div className="equipment-maintenance-plans">
                            {PLANNED_SERVICE_TYPES.map((serviceType) => {
                                const plan = plans.find((item) => item.gr_servicetype === serviceType)
                                const remaining = plan ? calculateHoursRemaining(equipment?.gr_currenthourmeter ?? 0, plan.gr_nextduehours) : null
                                const status = plan ? calculateServiceStatus(equipment?.gr_currenthourmeter ?? 0, plan.gr_nextduehours) : null
                                return <article key={serviceType}>
                                    <div><strong>{SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label}</strong><span className={`equipment-maintenance-status status-${status?.toLowerCase().replace(' ', '-') ?? 'unknown'}`}>{status ?? 'Not Configured'}</span></div>
                                    <dl>
                                        <div><dt>Due Hour</dt><dd>{plan?.gr_nextduehours ?? '-'}</dd></div>
                                        <div><dt>Hours Remaining</dt><dd>{remaining == null ? '-' : remaining < 0 ? `${Math.abs(remaining)} overdue` : remaining}</dd></div>
                                        <div><dt>Last Completed Date</dt><dd>{plan?.gr_lastcompleteddate ? formatDate(plan.gr_lastcompleteddate) : '-'}</dd></div>
                                        <div><dt>Last Completed Hours</dt><dd>{plan?.gr_lastcompletedhours ?? '-'}</dd></div>
                                        <div><dt>Last Completed Job</dt><dd>{plan?.gr_LastCompletedJob?.gr_jobnumber || '-'}</dd></div>
                                    </dl>
                                </article>
                            })}
                        </div>
                    </EditDrawerSection>}

                    {!isCreate && activeTab === 'history' && <EditDrawerSection title="Job History" meta={<span className="equipment-history-count">{history.length} {history.length === 1 ? 'job' : 'jobs'}</span>}>
                        <p className="equipment-history-note">Historical rows use each Job's recorded Site and are not changed when this Equipment moves.</p>
                        {history.length === 0 ? <div className="equipment-history-empty">No linked jobs found.</div> : <div className="equipment-history-list">{history.map((job) => <article key={job.gr_jobid}>
                            <div className="equipment-history-title"><strong>{job.gr_jobnumber || 'Job number not set'}</strong><time>{formatDate(job.createdon)}</time></div>
                            <div className="equipment-history-meta"><span>{getJobTypeLabel(job.gr_jobtype)}</span><span>{JOB_STATUS_OPTIONS.find((option) => option.value === job.gr_status)?.label ?? 'Status not set'}</span><span>{JOB_CARD_STATUS_OPTIONS.find((option) => option.value === getJobCardStatus(job.gr_jobcardstatus))?.label}</span></div>
                            <dl><div><dt>Job Site</dt><dd>{job.gr_Site?.gr_name || 'No Site recorded'}</dd></div><div><dt>Mechanic</dt><dd>{job.gr_Mechanic?.gr_name || 'Unassigned'}</dd></div><div><dt>Description</dt><dd>{job.gr_description || 'No description'}</dd></div></dl>
                        </article>)}</div>}
                    </EditDrawerSection>}
                </div>
            </form>
        </EditDrawerShell>

        {!isCreate && showDeleteConfirm && <EditDrawerConfirmation
            eyebrow="Delete equipment"
            title={`Delete equipment "${equipmentName}"?`}
            message="This action cannot be undone."
            error={deleteError}
            isBusy={isDeleting}
            confirmLabel={isDeleting ? 'Deleting...' : 'Delete equipment'}
            onCancel={() => setShowDeleteConfirm(false)}
            onConfirm={() => void deleteRecord()}
        />}

        {isCreate && relatedDialog === 'customerSite' && <EditDrawerFormDialog eyebrow="New customer and site" title="Create customer and site" error={relatedError} isBusy={isCreatingRelated} submitLabel={isCreatingRelated ? 'Creating...' : 'Create customer and site'} onCancel={cancelRelatedCreate} onSubmit={() => void createCustomerAndSite()}>
            <label>Customer name<input autoFocus value={newCustomerName} onChange={(event) => { setNewCustomerName(event.target.value); setRelatedError('') }} /></label>
            <label>Site name<input value={newSite.name} onChange={(event) => { setNewSite({ ...newSite, name: event.target.value }); setRelatedError('') }} /></label>
            <label>Site address (optional)<input value={newSite.address} onChange={(event) => { setNewSite({ ...newSite, address: event.target.value }); setRelatedError('') }} /></label>
        </EditDrawerFormDialog>}

        {isCreate && relatedDialog === 'site' && <EditDrawerFormDialog eyebrow="New site" title="Create site" error={relatedError} isBusy={isCreatingRelated} submitLabel={isCreatingRelated ? 'Creating...' : 'Create site'} onCancel={cancelRelatedCreate} onSubmit={() => void createSite()}>
            <p className="edit-form-dialog-context">Customer: {customers.find((customer) => customer.gr_customerid === customerId)?.gr_name || 'Selected customer'}</p>
            <label>Site name<input autoFocus value={newSite.name} onChange={(event) => { setNewSite({ ...newSite, name: event.target.value }); setRelatedError('') }} /></label>
            <label>Site address (optional)<input value={newSite.address} onChange={(event) => { setNewSite({ ...newSite, address: event.target.value }); setRelatedError('') }} /></label>
        </EditDrawerFormDialog>}

        {!isCreate && maintenanceDialogOpen && <EditDrawerFormDialog
            eyebrow="Maintenance"
            title="Edit Maintenance History"
            error={maintenanceError}
            isBusy={busy}
            submitLabel={isSaving ? 'Saving...' : 'Save'}
            onCancel={() => { if (!busy) setMaintenanceDialogOpen(false) }}
            onSubmit={() => void saveMaintenanceHistory()}
        >
            <p className="edit-form-dialog-context">Update the current meter and historical service completions. Next due hours are calculated automatically.</p>
            <label>Current Hour Meter<input type="number" min="0" value={maintenanceForm.currentHourMeter} onChange={(event) => { setMaintenanceForm((current) => ({ ...current, currentHourMeter: event.target.value })); setMaintenanceError('') }} /></label>
            {PLANNED_SERVICE_TYPES.map((serviceType) => {
                const label = SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label
                return <fieldset className="equipment-maintenance-history-group" key={serviceType}>
                    <legend>{label}</legend>
                    <label>Last Completed Date<input type="date" value={maintenanceForm.plans[serviceType].lastCompletedDate} onChange={(event) => updateMaintenancePlanField(serviceType, 'lastCompletedDate', event.target.value)} /></label>
                    <label>Last Completed Hours<input type="number" min="0" value={maintenanceForm.plans[serviceType].lastCompletedHours} onChange={(event) => updateMaintenancePlanField(serviceType, 'lastCompletedHours', event.target.value)} /></label>
                </fieldset>
            })}
        </EditDrawerFormDialog>}
    </>
}
