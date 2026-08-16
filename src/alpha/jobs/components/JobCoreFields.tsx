import { useState, type Dispatch, type SetStateAction } from 'react'
import type { Mechanic } from '../types/mechanic.types'
import { JOB_TYPE_OPTIONS, type JobType } from '../types/jobType.types'
import { jobRequiresMaintenance } from '../types/jobType.types'
import type { JobEditorDraft } from '../hooks/useJobEditor'
import { JOB_STATUSES, JOB_STATUS_OPTIONS, UNCONFIRMED_OPERATION_MESSAGE, type JobStatus } from '../types/jobStatus.types'
import { SERVICE_TYPES, SERVICE_TYPE_OPTIONS, type ServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types'
import SearchableMechanicSelect from './SearchableMechanicSelect'
import type { Equipment } from '../types/equipment.types'
import { isServiceTypeEnabled, resolveMaintenanceConfiguration } from '../../equipment/servicePlans/maintenanceConfiguration'
import { JOB_DESCRIPTION_MAX_LENGTH } from '../domain/jobDescription'

type Props = {
    draft: JobEditorDraft
    setDraft: Dispatch<SetStateAction<JobEditorDraft>>
    mechanics: Mechanic[]
    allowEmptyJobType?: boolean
    jobTypeError?: string
    jobTypeOptions?: typeof JOB_TYPE_OPTIONS
    equipment?: Equipment
}

export default function JobCoreFields({ draft, setDraft, mechanics, equipment, allowEmptyJobType = false, jobTypeError = '', jobTypeOptions = JOB_TYPE_OPTIONS }: Props) {
    const [mechanicSelectOpen, setMechanicSelectOpen] = useState(false)

    return (
        <>
            <label className="job-edit-field">
                <span>Job type</span>
                <select
                    value={draft.jobType}
                    onChange={(event) => setDraft((current) => ({
                        ...current,
                        jobType: event.target.value ? Number(event.target.value) as JobType : '',
                    }))}
                >
                    {allowEmptyJobType && <option value="">Select job type</option>}
                    {jobTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
                {jobTypeError && !draft.jobType && <small className="job-edit-field-error" role="alert">{jobTypeError}</small>}
            </label>

            <label className="job-edit-field">
                <span>Status</span>
                <select
                    value={draft.status}
                    onChange={(event) => {
                        const status = Number(event.target.value) as JobStatus
                        setDraft((current) => ({
                            ...current,
                            status,
                            mechanicId: status === JOB_STATUSES.UNCONFIRMED ? '' : current.mechanicId,
                        }))
                    }}
                >
                    {JOB_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </label>

            <label className="job-edit-field">
                <span>Job number</span>
                <input
                    value={draft.jobNumber}
                    onChange={(event) => setDraft((current) => ({
                        ...current,
                        jobNumber: event.target.value,
                    }))}
                />
            </label>

            <label className="job-edit-field">
                <span>Order number</span>
                <input
                    value={draft.orderNumber}
                    onChange={(event) => setDraft((current) => ({
                        ...current,
                        orderNumber: event.target.value,
                    }))}
                />
            </label>

            <label className="job-edit-field job-edit-field-wide">
                <span>Description</span>
                <textarea
                    rows={5}
                    maxLength={JOB_DESCRIPTION_MAX_LENGTH}
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({
                        ...current,
                        description: event.target.value,
                    }))}
                />
            </label>

            <label className="job-edit-field job-edit-field-wide">
                <span>Mechanic</span>
                {draft.status === JOB_STATUSES.UNCONFIRMED ? (
                    <span className="job-edit-field-note">{UNCONFIRMED_OPERATION_MESSAGE}</span>
                ) : <SearchableMechanicSelect
                    mechanics={mechanics}
                    selectedId={draft.mechanicId}
                    isOpen={mechanicSelectOpen}
                    isSaving={false}
                    variant="drawer"
                    onOpen={() => setMechanicSelectOpen(true)}
                    onClose={() => setMechanicSelectOpen(false)}
                    onSelect={(mechanicId) => {
                        setDraft((current) => ({ ...current, mechanicId }))
                        setMechanicSelectOpen(false)
                    }}
                />}
            </label>

            {jobRequiresMaintenance(draft.jobType) && <>
                <div className="job-edit-divider job-edit-field-wide">
                    <h3>Maintenance</h3>
                    <p>Select the maintenance type to be carried out. The maintenance summary below shows the equipment's current service schedule.</p>
                </div>
                <label className="job-edit-field">
                    <span>Service type *</span>
                    <select value={draft.serviceType} onChange={(event) => setDraft((current) => ({
                        ...current,
                        serviceType: Number(event.target.value) as ServiceType,
                    }))}>
                        <option value={SERVICE_TYPES.NONE}>Select service type</option>
                        {SERVICE_TYPE_OPTIONS.filter((option) => option.value !== SERVICE_TYPES.NONE && isServiceTypeEnabled(equipment, option.value)).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    {equipment && <small>{resolveMaintenanceConfiguration(equipment).activeServiceTypes.length === 2 ? 'Electric programme: A and C services' : 'Service types follow the Equipment programme'}</small>}
                </label>
            </>}
        </>
    )
}
