import { useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import type { JobAssignment } from '../types/jobAssignment.types'
import { emailJobAssignment, emailJobToMechanic } from '../services/jobEmail'
import {
    getJobCardStatus,
    JOB_CARD_STATUSES,
    JOB_CARD_STATUS_OPTIONS,
    type JobCardStatus,
} from '../types/jobCardStatus.types'

type Props = {
    job: Job
    mechanics: Mechanic[]
    assignments: JobAssignment[]
    onStatusChange: (jobId: string, status: JobCardStatus) => Promise<void>
    onCreateAssignment: (assignment: {
        jobId: string
        mechanicId: string
        mechanicName: string
        instructions?: string
    }) => Promise<void>
    onAssignmentStatusChange: (assignmentId: string, status: JobCardStatus) => Promise<void>
    onDeleteAssignment: (assignmentId: string) => Promise<void>
}

const timestamp = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
})

function formatTimestamp(value?: string | null) {
    return value ? timestamp.format(new Date(value)) : 'Not recorded'
}

type TechnicianCardProps = {
    name: string
    detail: string
    status: JobCardStatus
    instructions?: string | null
    isBusy: boolean
    canSend: boolean
    onSend: () => void
    onRemove?: () => void
}

function TechnicianCard({
    name,
    detail,
    status,
    instructions,
    isBusy,
    canSend,
    onSend,
    onRemove,
}: TechnicianCardProps) {
    const statusLabel = JOB_CARD_STATUS_OPTIONS.find((option) => option.value === status)?.label

    return (
        <article className="job-assignment-card technician-job-card">
            <div className="job-assignment-main">
                <div className="job-assignment-title">
                    <div>
                        <strong>{name}</strong>
                        <small>{detail}</small>
                    </div>
                    <span className={`job-card-current status-${status}`}>{statusLabel}</span>
                </div>
                {instructions && <p>{instructions}</p>}
                <div className="job-assignment-controls">
                    <button
                        type="button"
                        className="job-assignment-send"
                        onClick={onSend}
                        disabled={isBusy || !canSend || status !== JOB_CARD_STATUSES.NOT_SENT}
                    >
                        {isBusy
                            ? 'Sending...'
                            : status === JOB_CARD_STATUSES.NOT_SENT
                                ? 'Send job'
                                : statusLabel}
                    </button>
                    {onRemove && (
                        <button
                            type="button"
                            className="job-assignment-remove"
                            disabled={isBusy}
                            onClick={onRemove}
                        >
                            Remove
                        </button>
                    )}
                </div>
            </div>
        </article>
    )
}

export default function JobCardFields({
    job,
    mechanics,
    assignments,
    onStatusChange,
    onCreateAssignment,
    onAssignmentStatusChange,
    onDeleteAssignment,
}: Props) {
    const [status, setStatus] = useState(() => getJobCardStatus(job.gr_jobcardstatus))
    const [sentOn, setSentOn] = useState(job.gr_jobcardsenton)
    const [submittedOn, setSubmittedOn] = useState(job.gr_jobcardsubmittedon)
    const [closedOn, setClosedOn] = useState(job.gr_jobcardclosedon)
    const [isUpdating, setIsUpdating] = useState(false)
    const [updatingAssignmentId, setUpdatingAssignmentId] = useState('')
    const [showAssignmentForm, setShowAssignmentForm] = useState(false)
    const [mechanicId, setMechanicId] = useState('')
    const [error, setError] = useState('')

    const changeStatus = async (nextStatus: JobCardStatus) => {
        setIsUpdating(true)
        setError('')
        try {
            await onStatusChange(job.gr_jobid, nextStatus)
            const now = new Date().toISOString()
            setStatus(nextStatus)
            if (nextStatus === JOB_CARD_STATUSES.SENT) setSentOn(now)
            if (nextStatus === JOB_CARD_STATUSES.SUBMITTED) setSubmittedOn(now)
            if (nextStatus === JOB_CARD_STATUSES.CLOSED) setClosedOn(now)
        } catch (updateError) {
            setError(updateError instanceof Error
                ? updateError.message
                : 'The job card status could not be updated.')
        } finally {
            setIsUpdating(false)
        }
    }

    const addAssignment = async () => {
        const mechanic = mechanics.find((item) => item.gr_mechanicid === mechanicId)
        if (!mechanic) {
            setError('Choose a technician first.')
            return
        }

        setIsUpdating(true)
        setError('')
        try {
            await onCreateAssignment({
                jobId: job.gr_jobid,
                mechanicId,
                mechanicName: mechanic.gr_name,
            })
            setMechanicId('')
            setShowAssignmentForm(false)
        } catch (createError) {
            setError(createError instanceof Error
                ? createError.message
                : 'The technician could not be assigned.')
        } finally {
            setIsUpdating(false)
        }
    }

    const sendAssignment = async (assignment: JobAssignment) => {
        if (!assignment.gr_Mechanic?.gr_email) {
            setError('This technician needs an email address before the job can be sent.')
            return
        }

        setUpdatingAssignmentId(assignment.gr_jobassignmentid)
        setError('')
        try {
            emailJobAssignment(job, assignment)
            await onAssignmentStatusChange(
                assignment.gr_jobassignmentid,
                JOB_CARD_STATUSES.SENT,
            )
        } catch (sendError) {
            setError(sendError instanceof Error
                ? sendError.message
                : 'The job could not be recorded as sent.')
        } finally {
            setUpdatingAssignmentId('')
        }
    }

    const sendPrimaryTechnician = async () => {
        if (!job.gr_Mechanic?.gr_email) {
            setError('The primary technician needs an email address before the job can be sent.')
            return
        }

        emailJobToMechanic(job)
        await changeStatus(JOB_CARD_STATUSES.SENT)
    }

    const removeAssignment = async (assignment: JobAssignment) => {
        if (!window.confirm(`Remove ${assignment.gr_Mechanic?.gr_name ?? 'this technician'} from the assignment history?`)) return
        setUpdatingAssignmentId(assignment.gr_jobassignmentid)
        setError('')
        try {
            await onDeleteAssignment(assignment.gr_jobassignmentid)
        } catch (deleteError) {
            setError(deleteError instanceof Error
                ? deleteError.message
                : 'The assignment could not be removed.')
        } finally {
            setUpdatingAssignmentId('')
        }
    }

    return (
        <div className="job-card-layout">
            <section className="job-card-section overall-job-card-section">
                <div className="job-card-heading">
                    <div>
                        <span>Primary technician</span>
                        <h3>Job card</h3>
                        <p>The normal workflow for the technician assigned on the Details tab.</p>
                    </div>
                </div>

                <TechnicianCard
                    name={job.gr_Mechanic?.gr_name ?? 'No technician assigned'}
                    detail={job.gr_Mechanic?.gr_email
                        ? `Primary technician · ${job.gr_Mechanic.gr_email}`
                        : 'Assign a technician with an email address on the Details tab.'}
                    status={status}
                    isBusy={isUpdating}
                    canSend={Boolean(job.gr_Mechanic?.gr_email)}
                    onSend={() => void sendPrimaryTechnician()}
                />

                <div className="job-additional-technicians">
                    {assignments.length > 0 && (
                        <div className="job-assignment-list">
                            {assignments.map((assignment) => {
                                const assignmentStatus = getJobCardStatus(assignment.gr_jobcardstatus)
                                const isBusy = updatingAssignmentId === assignment.gr_jobassignmentid
                                return (
                                    <TechnicianCard
                                        key={assignment.gr_jobassignmentid}
                                        name={assignment.gr_Mechanic?.gr_name ?? 'Unknown technician'}
                                        detail={`Added technician · ${formatTimestamp(assignment.gr_assignedon)}`}
                                        status={assignmentStatus}
                                        instructions={assignment.gr_workinstructions}
                                        isBusy={isBusy}
                                        canSend={Boolean(assignment.gr_Mechanic?.gr_email)}
                                        onSend={() => void sendAssignment(assignment)}
                                        onRemove={() => void removeAssignment(assignment)}
                                    />
                                )
                            })}
                        </div>
                    )}

                    {showAssignmentForm && (
                        <div className="job-assignment-form">
                            <label className="job-edit-field">
                                <span>Technician</span>
                                <select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}>
                                    <option value="">Select technician</option>
                                    {mechanics.filter((mechanic) =>
                                        mechanic.statecode !== 1
                                        && mechanic.gr_mechanicid !== job.gr_Mechanic?.gr_mechanicid
                                        && !assignments.some((assignment) =>
                                            assignment.gr_Mechanic?.gr_mechanicid === mechanic.gr_mechanicid,
                                        )
                                    ).map((mechanic) => (
                                        <option key={mechanic.gr_mechanicid} value={mechanic.gr_mechanicid}>
                                            {mechanic.gr_name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className="job-assignment-save" onClick={() => void addAssignment()} disabled={isUpdating}>
                                {isUpdating ? 'Adding...' : 'Add technician'}
                            </button>
                        </div>
                    )}

                    <button
                        type="button"
                        className="job-assignment-add"
                        onClick={() => setShowAssignmentForm((current) => !current)}
                        disabled={isUpdating}
                    >
                        {showAssignmentForm ? 'Cancel adding technician' : '+ Add another tech'}
                    </button>
                </div>

                <label className="job-edit-field job-card-status-field">
                    <span>Job card status</span>
                    <select
                        value={status}
                        disabled={isUpdating}
                        onChange={(event) => void changeStatus(Number(event.target.value) as JobCardStatus)}
                    >
                        {JOB_CARD_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <small>This remains office-controlled while technician submission automation is being built.</small>
                </label>

                <div className="job-card-timeline">
                    <div className={sentOn ? 'complete' : ''}>
                        <span aria-hidden="true" />
                        <div><strong>Sent</strong><small>{formatTimestamp(sentOn)}</small></div>
                    </div>
                    <div className={submittedOn ? 'complete' : ''}>
                        <span aria-hidden="true" />
                        <div><strong>Submitted</strong><small>{formatTimestamp(submittedOn)}</small></div>
                    </div>
                    <div className={closedOn ? 'complete' : ''}>
                        <span aria-hidden="true" />
                        <div><strong>Closed</strong><small>{formatTimestamp(closedOn)}</small></div>
                    </div>
                </div>
            </section>

            {error && <p className="job-card-error" role="alert">{error}</p>}
        </div>
    )
}
