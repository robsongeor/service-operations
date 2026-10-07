import type { Dispatch, SetStateAction } from 'react'
import type { Mechanic } from '../types/mechanic.types'
import { JOB_TYPE_OPTIONS, type JobType } from '../types/jobType.types'
import { jobRequiresMaintenance } from '../types/jobType.types'
import type { JobEditorDraft } from '../hooks/useJobEditor'
import { JOB_STATUSES, JOB_STATUS_OPTIONS, UNCONFIRMED_OPERATION_MESSAGE, type JobStatus } from '../types/jobStatus.types'
import { SERVICE_TYPES, SERVICE_TYPE_OPTIONS, type ServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { Equipment } from '../types/equipment.types'
import { isServiceTypeEnabled, resolveMaintenanceConfiguration } from '../../equipment/servicePlans/maintenanceConfiguration'
import type { Job } from '../types/job.types'
import JobDetailsFields from './JobDetailsFields'

type Props = {
    draft: JobEditorDraft
    setDraft: Dispatch<SetStateAction<JobEditorDraft>>
    mechanics: Mechanic[]
    mechanicsLoading?: boolean
    mechanicsError?: string
    onRetryMechanics?: () => void
    allowEmptyJobType?: boolean
    jobTypeError?: string
    jobTypeOptions?: typeof JOB_TYPE_OPTIONS
    equipment?: Equipment
    jobBookJob?: Job
    correctionsOnly?: boolean
    stagingOnly?: boolean
}

export default function JobCoreFields({ draft, setDraft, mechanics, mechanicsLoading = false, mechanicsError = '', onRetryMechanics, equipment, jobBookJob, allowEmptyJobType = false, jobTypeError = '', jobTypeOptions = JOB_TYPE_OPTIONS, correctionsOnly = false }: Props) {
    return (
        <>
            <JobDetailsFields
                additionalFields={<>
                    <label className="job-edit-field">
                        <span>Job type</span>
                        <select disabled={correctionsOnly} value={draft.jobType} onChange={(event) => setDraft((current) => ({ ...current, jobType: event.target.value ? Number(event.target.value) as JobType : '' }))}>
                            {allowEmptyJobType && <option value="">{correctionsOnly ? 'Not configured' : 'Select job type'}</option>}
                            {jobTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        {jobTypeError && !draft.jobType && <small className="job-edit-field-error" role="alert">{jobTypeError}</small>}
                    </label>
                    <label className="job-edit-field">
                        <span>Status</span>
                        <select disabled={correctionsOnly} value={draft.status} onChange={(event) => { const status = Number(event.target.value) as JobStatus; setDraft((current) => ({ ...current, status, mechanicId: status === JOB_STATUSES.UNCONFIRMED ? '' : current.mechanicId })) }}>
                            {JOB_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                </>}
                description={draft.description}
                onDescriptionChange={(description) => setDraft((current) => ({ ...current, description }))}
                mechanics={mechanics}
                mechanicId={draft.mechanicId}
                mechanicName={jobBookJob?.gr_Mechanic?.gr_name ?? ''}
                onMechanicChange={correctionsOnly ? undefined : (mechanicId) => setDraft((current) => ({ ...current, mechanicId }))}
                mechanicDisabledMessage={draft.status === JOB_STATUSES.UNCONFIRMED ? UNCONFIRMED_OPERATION_MESSAGE : undefined}
                mechanicsLoading={mechanicsLoading}
                mechanicsError={mechanicsError}
                onRetryMechanics={onRetryMechanics}
                customerPo={draft.orderNumber}
                onCustomerPoChange={(orderNumber) => setDraft((current) => ({ ...current, orderNumber }))}
            />

            {jobRequiresMaintenance(draft.jobType) && <>
                <div className="job-edit-divider job-edit-field-wide">
                    <h3>Maintenance</h3>
                    <p>Select the maintenance type to be carried out. The maintenance summary below shows the equipment's current service schedule.</p>
                </div>
                <label className="job-edit-field">
                    <span>Service type *</span>
                    <select disabled={correctionsOnly} value={draft.serviceType} onChange={(event) => setDraft((current) => ({
                        ...current,
                        serviceType: Number(event.target.value) as ServiceType,
                    }))}>
                        <option value={SERVICE_TYPES.NONE}>Select service type</option>
                        {SERVICE_TYPE_OPTIONS.filter((option) => option.value !== SERVICE_TYPES.NONE && (correctionsOnly || isServiceTypeEnabled(equipment, option.value))).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    {equipment && <small>{resolveMaintenanceConfiguration(equipment).activeServiceTypes.length === 2 ? 'Electric programme: A and C services' : 'Service types follow the Equipment programme'}</small>}
                </label>
            </>}
        </>
    )
}
