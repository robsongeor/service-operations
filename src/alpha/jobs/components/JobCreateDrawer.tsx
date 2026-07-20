import { useState } from 'react'
import type { Mechanic } from '../types/mechanic.types'
import type { Equipment } from '../types/equipment.types'
import type { Site } from '../types/site.types'
import type { Customer } from '../types/customer.types'
import type { SiteContact } from '../types/siteContact.types'
import type { JobType } from '../types/jobType.types'
import { JOB_STATUSES } from '../types/jobStatus.types'
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
import { jobRequiresMaintenance } from '../types/jobType.types'
import JobMaintenanceSummary from './JobMaintenanceSummary'

export type JobCreateInitialValues = {
    equipmentId?: string
    siteId?: string
    customerId?: string
    contactId?: string
    jobType?: JobType
}

type Props = {
    mechanics: Mechanic[]
    equipmentList: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    servicePlans: EquipmentServicePlan[]
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: { customerId: string; name: string; address?: string }) => Promise<string>
    onCreateContact: (contact: { siteId: string; name: string; phone?: string; email?: string }) => Promise<string>
    onCreateEquipment: (equipment: { fleet: string; serial: string; make?: string; model?: string }) => Promise<string>
    onCreateJob: (job: JobSaveInput) => Promise<string>
    onCreateScheduleOption: (option: JobScheduleOptionInput) => Promise<void>
    initialValues?: JobCreateInitialValues
    onClose: () => void
}

export default function JobCreateDrawer({
    mechanics, equipmentList, sites, customers, siteContacts, servicePlans,
    onCreateCustomer, onCreateSite, onCreateContact, onCreateEquipment,
    onCreateJob, onCreateScheduleOption, initialValues, onClose,
}: Props) {
    const initialCustomer = customers.find((customer) => customer.gr_customerid === initialValues?.customerId)
    const editor = useJobEditor({
        initialDraft: {
            jobNumber: '', orderNumber: '', description: '',
            jobType: initialValues?.jobType ?? '',
            status: JOB_STATUSES.UNALLOCATED,
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
        if (!draft.description.trim()) return setSaveError('Enter a job description before creating the job.')
        if (draft.customerId && !draft.siteId) return setSaveError('Select a site for the chosen customer.')

        let createdJob = false

        try {
            setIsSaving(true)
            setSaveError('')
            const jobId = await onCreateJob({
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
            })

            createdJob = true
            setJobWasCreated(true)

            await Promise.all(scheduleDrafts.map((option) =>
                onCreateScheduleOption({
                    jobId,
                    scheduleType: option.scheduleType,
                    scheduleDate: option.scheduleDate,
                    scheduleTime: option.scheduleTime,
                    confirmed: option.confirmed,
                }),
            ))

            onClose()
        } catch (error) {
            console.error(error)
            setSaveError(createdJob
                ? 'The job was created, but its schedule could not be saved. Close this drawer and add it from Edit Job.'
                : 'The job could not be created. Please try again.')
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
                <JobCoreFields draft={draft} setDraft={setDraft} mechanics={mechanics} allowEmptyJobType jobTypeError={jobTypeError} />
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
                <JobScheduleFields
                    draftOptions={scheduleDrafts}
                    onDraftOptionsChange={setScheduleDrafts}
                />
            </div>
        </JobDrawerShell>
    )
}
