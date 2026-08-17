import { useState } from 'react'
import type { Mechanic } from '../types/mechanic.types'
import type { Equipment } from '../types/equipment.types'
import type { Site } from '../types/site.types'
import type { Customer } from '../types/customer.types'
import type { SiteContact } from '../types/siteContact.types'
import type { JobType } from '../types/jobType.types'
import { JOB_STATUSES, UNCONFIRMED_OPERATION_MESSAGE, type JobStatus } from '../types/jobStatus.types'
import type { JobSaveInput } from '../types/jobSave.types'
import { useJobEditor } from '../hooks/useJobEditor'
import JobDrawerShell from './JobDrawerShell'
import JobCoreFields from './JobCoreFields'
import JobRelationshipFields from './JobRelationshipFields'
import JobScheduleFields from './JobScheduleFields'
import type {
    JobScheduleOptionDraft,
    JobScheduleOptionInput,
} from '../types/jobSchedule.types'
import './JobDrawer.css'
import { SERVICE_TYPES } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { jobRequiresMaintenance, STANDARD_JOB_TYPE_OPTIONS } from '../types/jobType.types'
import JobMaintenanceSummary from './JobMaintenanceSummary'
import { isServiceTypeEnabled } from '../../equipment/servicePlans/maintenanceConfiguration'
import type { Job } from '../types/job.types'
import { findDuplicateJobNumber } from '../utils/jobNumber'

export type JobCreateInitialValues = {
    jobNumber?: string
    orderNumber?: string
    status?: JobStatus
    equipmentDraft?: { fleet?: string; alternateFleet?: string; serial?: string; make?: string; model?: string }
    equipmentId?: string
    siteId?: string
    customerId?: string
    contactId?: string
    jobType?: JobType
    description?: string
}

type Props = {
    mechanics: Mechanic[]
    equipmentList: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    servicePlans: EquipmentServicePlan[]
    existingJobs?: readonly Job[]
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: { customerId: string; name: string; address?: string }) => Promise<string>
    onCreateContact: (contact: { siteId: string; name: string; phone?: string; email?: string }) => Promise<string>
    onCreateEquipment: (equipment: { fleet: string; alternateFleet?: string; serial: string; make?: string; model?: string }) => Promise<string>
    onCreateJob: (job: JobSaveInput) => Promise<string>
    onCreated?: (jobId: string, job: JobSaveInput) => Promise<void> | void
    onCreateScheduleOption: (option: JobScheduleOptionInput) => Promise<void>
    initialValues?: JobCreateInitialValues
    jobTypeOptions?: { label: string; value: JobType }[]
    requireJobNumber?: boolean
    onClose: () => void
}

export default function JobCreateDrawer({
    mechanics, equipmentList, sites, customers, siteContacts, servicePlans,
    onCreateCustomer, onCreateSite, onCreateContact, onCreateEquipment,
    onCreateJob, onCreated, onCreateScheduleOption, initialValues,
    jobTypeOptions = STANDARD_JOB_TYPE_OPTIONS, requireJobNumber = false, existingJobs = [], onClose,
}: Props) {
    const initialCustomer = customers.find((customer) => customer.gr_customerid === initialValues?.customerId)
    const editor = useJobEditor({
        initialDraft: {
            jobNumber: initialValues?.jobNumber ?? '', orderNumber: initialValues?.orderNumber ?? '', description: initialValues?.description ?? '',
            jobType: initialValues?.jobType ?? '',
            status: initialValues?.status ?? JOB_STATUSES.UNALLOCATED,
            mechanicId: '',
            equipmentId: initialValues?.equipmentId ?? '',
            customerId: initialValues?.customerId ?? '',
            siteId: initialValues?.siteId ?? '',
            contactId: initialValues?.contactId ?? '',
            serviceType: SERVICE_TYPES.NONE,
        },
        initialCustomerSearch: initialCustomer?.gr_name ?? '',
        customers,
        sites,
        siteContacts,
    })
    const { draft, setDraft } = editor
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [scheduleDrafts, setScheduleDrafts] = useState<JobScheduleOptionDraft[]>([])
    const [jobWasCreated, setJobWasCreated] = useState(false)
    const [jobTypeError, setJobTypeError] = useState('')

    const createJob = async () => {
        if (!draft.jobType) {
            setJobTypeError('Select a job type before creating the job.')
            return
        }
        if (requireJobNumber && !draft.jobNumber.trim()) return setSaveError('Enter a Job Number before creating the job.')
        const duplicateJob = findDuplicateJobNumber(existingJobs, draft.jobNumber)
        if (duplicateJob) return setSaveError(`Job Number ${duplicateJob.gr_jobnumber?.trim()} already exists. Open the existing Job or enter a different number.`)
        if (!draft.description.trim()) return setSaveError('Enter a job description before creating the job.')
        if (draft.customerId && !draft.siteId) return setSaveError('Select a site for the chosen customer.')
        const selectedEquipment = equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)
        if (jobRequiresMaintenance(draft.jobType)) {
            if (!selectedEquipment) return setSaveError('Select equipment before creating a Service Job.')
            if (draft.serviceType === SERVICE_TYPES.NONE) return setSaveError('Select a service type before creating a Service Job.')
            if (!isServiceTypeEnabled(selectedEquipment, draft.serviceType)) return setSaveError('The selected Service Type is not active for this Equipment programme.')
        }

        let createdJob = false

        try {
            setIsSaving(true)
            setSaveError('')
            const jobInput: JobSaveInput = {
                jobNumber: draft.jobNumber.trim(),
                orderNumber: draft.orderNumber.trim(),
                description: draft.description.trim(),
                jobType: draft.jobType,
                status: draft.status,
                equipmentId: draft.equipmentId || undefined,
                mechanicId: draft.mechanicId || undefined,
                siteId: draft.siteId || undefined,
                contactId: draft.contactId || undefined,
                serviceType: draft.serviceType,
            }
            const jobId = await onCreateJob(jobInput)

            createdJob = true
            setJobWasCreated(true)

            const scheduleOptionsToCreate = draft.status === JOB_STATUSES.UNCONFIRMED ? [] : scheduleDrafts
            await Promise.all(scheduleOptionsToCreate.map((option) =>
                onCreateScheduleOption({
                    jobId,
                    scheduleType: option.scheduleType,
                    scheduleDate: option.scheduleDate,
                    scheduleTime: option.scheduleTime,
                    confirmed: option.confirmed,
                }),
            ))

            await onCreated?.(jobId, jobInput)

            onClose()
        } catch (error) {
            console.error(error)
            setSaveError(createdJob
                ? 'The job was created, but the follow-up workflow could not be completed. Close this drawer and refresh before continuing.'
                : error instanceof Error ? error.message : 'The job could not be created. Please try again.')
        } finally { setIsSaving(false) }
    }

    return (
        <JobDrawerShell
            eyebrow="Create job"
            title={draft.jobNumber.trim() || 'New job'}
            busy={isSaving}
            onClose={onClose}
            footer={<>
                {saveError
                    ? <span className="job-edit-save-error" role="alert">{saveError}</span>
                    : <span>Create this job in Dataverse.</span>}
                <div className="job-edit-footer-actions">
                    <button type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button
                        type="button"
                        className="primary"
                        onClick={jobWasCreated ? onClose : createJob}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Creating...' : jobWasCreated ? 'Close' : 'Create job'}
                    </button>
                </div>
            </>}
        >
            <div className="job-edit-grid">
                <JobCoreFields draft={draft} setDraft={setDraft} mechanics={mechanics} equipment={equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)} allowEmptyJobType jobTypeError={jobTypeError} jobTypeOptions={jobTypeOptions} />
                {jobRequiresMaintenance(draft.jobType) && <JobMaintenanceSummary
                    equipment={equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)}
                    servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === draft.equipmentId.toLowerCase())}
                />}
                <JobRelationshipFields
                    editor={editor}
                    equipmentList={equipmentList}
                    initialEquipmentDraft={initialValues?.equipmentDraft}
                    onCreateCustomer={onCreateCustomer}
                    onCreateSite={onCreateSite}
                    onCreateContact={onCreateContact}
                    onCreateEquipment={onCreateEquipment}
                />
                <JobScheduleFields
                    draftOptions={scheduleDrafts}
                    onDraftOptionsChange={setScheduleDrafts}
                    disabledMessage={draft.status === JOB_STATUSES.UNCONFIRMED ? UNCONFIRMED_OPERATION_MESSAGE : undefined}
                />
            </div>
        </JobDrawerShell>
    )
}
