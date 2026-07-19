import { useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import type { Equipment } from '../types/equipment.types'
import type { Site } from '../types/site.types'
import type { Customer } from '../types/customer.types'
import type { SiteContact } from '../types/siteContact.types'
import { JOB_TYPES, jobRequiresMaintenance } from '../types/jobType.types'
import type { JobSaveInput } from '../types/jobSave.types'
import { useJobEditor } from '../hooks/useJobEditor'
import JobCoreFields from './JobCoreFields'
import JobRelationshipFields from './JobRelationshipFields'
import JobScheduleFields from './JobScheduleFields'
import JobDrawerShell from './JobDrawerShell'
import JobQuotesSection from './JobQuotesSection'
import JobCardFields from './JobCardFields'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import './JobDrawer.css'
import type {
    JobScheduleOption,
    JobScheduleOptionInput,
} from '../types/jobSchedule.types'
import type { Quote } from '../../quotes/types/quote.types'
import type { JobCardStatus } from '../types/jobCardStatus.types'
import type { JobAssignment, JobAssignmentInput } from '../types/jobAssignment.types'
import { SERVICE_TYPES, type EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import JobMaintenanceSummary from './JobMaintenanceSummary'
import { JOB_CARD_STATUSES, getJobCardStatus } from '../types/jobCardStatus.types'
import { JOB_NUMBER_REQUIRED_EMAIL_MESSAGE, jobHasEmailableJobNumber } from '../services/jobEmailRules'

type Props = {
    job: Job
    mechanics: Mechanic[]
    equipmentList: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    scheduleOptions: JobScheduleOption[]
    quotes: Quote[]
    assignments: JobAssignment[]
    servicePlans: EquipmentServicePlan[]
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: {
        customerId: string
        name: string
        address?: string
    }) => Promise<string>
    onCreateContact: (contact: {
        siteId: string
        name: string
        phone?: string
        email?: string
    }) => Promise<string>
    onCreateEquipment: (equipment: {
        fleet: string
        serial: string
        make?: string
        model?: string
    }) => Promise<string>
    onSave: (jobId: string, job: JobSaveInput) => Promise<void>
    onDelete: (jobId: string) => Promise<void>
    onCreateScheduleOption: (option: JobScheduleOptionInput) => Promise<void>
    onUpdateScheduleOption: (
        optionId: string,
        option: JobScheduleOptionInput,
    ) => Promise<void>
    onDeleteScheduleOption: (optionId: string) => Promise<void>
    onCreateQuote: (jobId: string) => void
    onOpenQuote: (quoteId: string) => void
    onJobCardStatusChange: (jobId: string, status: JobCardStatus) => Promise<void>
    onCreateAssignment: (assignment: JobAssignmentInput) => Promise<void>
    onSendPrimary: (job: Job) => Promise<void>
    onSendAssignment: (job: Job, assignment: JobAssignment) => Promise<void>
    onDeleteAssignment: (assignmentId: string) => Promise<void>
    initialTab?: 'details' | 'scheduling' | 'jobcard' | 'quotes'
    onClose: () => void
}

export default function JobEditDrawer({
    job,
    mechanics,
    equipmentList,
    sites,
    customers,
    siteContacts,
    scheduleOptions,
    quotes,
    assignments,
    servicePlans,
    onCreateCustomer,
    onCreateSite,
    onCreateContact,
    onCreateEquipment,
    onSave,
    onDelete,
    onCreateScheduleOption,
    onUpdateScheduleOption,
    onDeleteScheduleOption,
    onCreateQuote,
    onOpenQuote,
    onJobCardStatusChange,
    onCreateAssignment,
    onSendPrimary,
    onSendAssignment,
    onDeleteAssignment,
    initialTab = 'details',
    onClose,
}: Props) {
    const editor = useJobEditor({
        initialDraft: {
            jobNumber: job.gr_jobnumber ?? '',
            orderNumber: job.gr_ordernumber ?? '',
            description: job.gr_description ?? '',
            jobType: job.gr_jobtype ?? JOB_TYPES.BREAKDOWN,
            mechanicId: job.gr_Mechanic?.gr_mechanicid ?? '',
            status: job.gr_status,
            equipmentId: job.gr_Equipment?.gr_equipmentid ?? '',
            customerId: job.gr_Site?.gr_Customer?.gr_customerid ?? '',
            siteId: job.gr_Site?.gr_siteid ?? '',
            contactId: job.gr_Contact?.gr_contactid ?? '',
            serviceType: job.gr_servicetype ?? SERVICE_TYPES.NONE,
        },
        initialCustomerSearch: job.gr_Site?.gr_Customer?.gr_name ?? '',
        customers,
        sites,
        siteContacts,
    })
    const { draft, setDraft } = editor
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const [isEmailing, setIsEmailing] = useState(false)
    const [activeTab, setActiveTab] = useState<'details' | 'scheduling' | 'jobcard' | 'quotes'>(initialTab)
    const jobScheduleCount = scheduleOptions.filter(
        (option) => option._gr_job_value?.toLowerCase() === job.gr_jobid.toLowerCase(),
    ).length
    const jobCardStatus = getJobCardStatus(job.gr_jobcardstatus)
    const hasJobNumber = jobHasEmailableJobNumber(job)
    const emailLabel = jobCardStatus === JOB_CARD_STATUSES.NOT_SENT
        ? isEmailing ? 'Sending...' : 'Email'
        : jobCardStatus === JOB_CARD_STATUSES.SENT
            ? '✓ Sent'
            : jobCardStatus === JOB_CARD_STATUSES.SUBMITTED
                ? 'Submitted'
                : 'Closed'
    const emailTitle = !hasJobNumber
        ? JOB_NUMBER_REQUIRED_EMAIL_MESSAGE
        : !job.gr_Mechanic
            ? 'Assign a technician before emailing this job.'
            : jobCardStatus === JOB_CARD_STATUSES.NOT_SENT
                ? `Email job to ${job.gr_Mechanic.gr_name}`
                : 'Job card has already been emailed.'
    const canEmailJob = hasJobNumber && Boolean(job.gr_Mechanic) && jobCardStatus === JOB_CARD_STATUSES.NOT_SENT

    const saveChanges = async () => {
        if (!draft.description.trim()) {
            setSaveError('Enter a job description before saving.')
            return
        }

        if (draft.customerId && !draft.siteId) {
            setSaveError('Select a site for the chosen customer before saving.')
            return
        }
        if (draft.status === 122830003 && jobRequiresMaintenance(draft.jobType)) {
            if (!draft.equipmentId) return setSaveError('Select equipment before completing a service job.')
            if (draft.serviceType === SERVICE_TYPES.NONE) return setSaveError('Select a service type before completing a service job.')
        }

        try {
            setIsSaving(true)
            setSaveError('')
            await onSave(job.gr_jobid, {
                jobNumber: draft.jobNumber.trim(),
                orderNumber: draft.orderNumber.trim(),
                description: draft.description.trim(),
                jobType: draft.jobType,
                status: draft.status,
                equipmentId: draft.equipmentId,
                mechanicId: draft.mechanicId,
                siteId: draft.siteId,
                contactId: draft.contactId,
                serviceType: draft.serviceType,
                hourMeter: job.gr_hourmeter ?? undefined,
            })
            onClose()
        } catch (error) {
            console.error(error)
            setSaveError('Changes could not be saved. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const deleteJob = async () => {
        try {
            setIsDeleting(true)
            setDeleteError('')
            await onDelete(job.gr_jobid)
            setShowDeleteConfirm(false)
            onClose()
        } catch (error) {
            console.error(error)
            setDeleteError('The job could not be deleted. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    const emailJob = async () => {
        if (!hasJobNumber) {
            setSaveError(JOB_NUMBER_REQUIRED_EMAIL_MESSAGE)
            return
        }
        if (!job.gr_Mechanic) {
            setSaveError('Assign a technician before emailing this job.')
            return
        }

        try {
            setIsEmailing(true)
            setSaveError('')
            await onSendPrimary(job)
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'The job email flow did not complete.')
        } finally {
            setIsEmailing(false)
        }
    }

    return (
        <>
        <JobDrawerShell
            eyebrow="Edit job"
            title={job.gr_jobnumber || 'Unnumbered job'}
            busy={isSaving || isDeleting || isEmailing}
            onClose={onClose}
            headerAction={
                <button
                    type="button"
                    className={`job-drawer-email-action status-${jobCardStatus}`}
                    title={emailTitle}
                    onClick={() => void emailJob()}
                    disabled={isSaving || isDeleting || isEmailing || !canEmailJob}
                >
                    {emailLabel}
                </button>
            }
            footer={
                <>
                    <div className="job-edit-footer-leading">
                        <button
                            type="button"
                            className="job-edit-delete-button"
                            onClick={() => {
                                setDeleteError('')
                                setShowDeleteConfirm(true)
                            }}
                            disabled={isSaving}
                        >
                            Delete job
                        </button>
                        {saveError
                            ? <span className="job-edit-save-error" role="alert">{saveError}</span>
                            : <span>Save to update this job in Dataverse.</span>}
                    </div>
                    <div className="job-edit-footer-actions">
                        <button type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
                        <button
                            type="button"
                            className="primary"
                            onClick={saveChanges}
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </>
            }
        >
            <nav className="job-edit-tabs" aria-label="Job sections">
                <button
                    type="button"
                    className={activeTab === 'details' ? 'active' : ''}
                    aria-selected={activeTab === 'details'}
                    role="tab"
                    onClick={() => setActiveTab('details')}
                >
                    Details
                </button>
                <button
                    type="button"
                    className={activeTab === 'scheduling' ? 'active' : ''}
                    aria-selected={activeTab === 'scheduling'}
                    role="tab"
                    onClick={() => setActiveTab('scheduling')}
                >
                    Scheduling
                    {jobScheduleCount > 0 && <span>{jobScheduleCount}</span>}
                </button>
                <button
                    type="button"
                    className={activeTab === 'quotes' ? 'active' : ''}
                    aria-selected={activeTab === 'quotes'}
                    role="tab"
                    onClick={() => setActiveTab('quotes')}
                >
                    Quotes
                    {quotes.length > 0 && <span>{quotes.length}</span>}
                </button>
                <button
                    type="button"
                    className={activeTab === 'jobcard' ? 'active' : ''}
                    aria-selected={activeTab === 'jobcard'}
                    role="tab"
                    onClick={() => setActiveTab('jobcard')}
                >
                    Job card
                </button>
            </nav>

            <div className="job-edit-tab-panel" role="tabpanel">
                {activeTab === 'details' && (
                    <div className="job-edit-grid">
                        <JobCoreFields
                            draft={draft}
                            setDraft={setDraft}
                            mechanics={mechanics}
                        />

                        {jobRequiresMaintenance(draft.jobType) && <JobMaintenanceSummary
                            equipment={equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)}
                            servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === draft.equipmentId.toLowerCase())}
                        />}

                        <JobRelationshipFields
                            editor={editor}
                            equipmentList={equipmentList}
                            onCreateCustomer={onCreateCustomer}
                            onCreateSite={onCreateSite}
                            onCreateContact={onCreateContact}
                            onCreateEquipment={onCreateEquipment}
                        />
                    </div>
                )}

                {activeTab === 'scheduling' && (
                    <div className="job-edit-grid">
                        <JobScheduleFields
                            jobId={job.gr_jobid}
                            scheduleOptions={scheduleOptions}
                            onCreate={onCreateScheduleOption}
                            onUpdate={onUpdateScheduleOption}
                            onDelete={onDeleteScheduleOption}
                        />
                    </div>
                )}

                {activeTab === 'quotes' && (
                    <div className="job-edit-grid">
                        <JobQuotesSection
                            quotes={quotes}
                            onCreateQuote={() => onCreateQuote(job.gr_jobid)}
                            onOpenQuote={onOpenQuote}
                        />
                    </div>
                )}

                {activeTab === 'jobcard' && (
                    <JobCardFields
                        job={job}
                        mechanics={mechanics}
                        assignments={assignments}
                        onStatusChange={onJobCardStatusChange}
                        onCreateAssignment={onCreateAssignment}
                        onSendPrimary={onSendPrimary}
                        onSendAssignment={onSendAssignment}
                        onDeleteAssignment={onDeleteAssignment}
                    />
                )}
            </div>
        </JobDrawerShell>

        {showDeleteConfirm && <EditDrawerConfirmation
            eyebrow="Delete job"
            title={`Delete ${job.gr_jobnumber || 'this unnumbered job'}?`}
            message="This permanently removes the job from Dataverse. This action cannot be undone."
            error={deleteError}
            isBusy={isDeleting}
            confirmLabel={isDeleting ? 'Deleting...' : 'Delete job'}
            onCancel={() => setShowDeleteConfirm(false)}
            onConfirm={() => void deleteJob()}
        />}
        </>
    )
}
