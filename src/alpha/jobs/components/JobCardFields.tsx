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
    const [instructions, setInstructions] = useState('')
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
                instructions,
            })
            setMechanicId('')
            setInstructions('')
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
                    <span className={`job-card-current status-${status}`}>
                        {JOB_CARD_STATUS_OPTIONS.find((option) => option.value === status)?.label}
                    </span>
                </div>

                <div className="primary-technician-card">
                    <div>
                        <strong>{job.gr_Mechanic?.gr_name ?? 'No technician assigned'}</strong>
                        <small>
                            {job.gr_Mechanic?.gr_email
                                || 'Assign a technician with an email address on the Details tab.'}
                        </small>
                    </div>
                    <div className="primary-technician-actions">
                        <button
                            type="button"
                            disabled={!job.gr_Mechanic?.gr_email || status !== JOB_CARD_STATUSES.NOT_SENT}
                            onClick={() => emailJobToMechanic(job)}
                        >
                            {status === JOB_CARD_STATUSES.NOT_SENT ? 'Open email' : 'Email recorded'}
                        </button>
                        {status === JOB_CARD_STATUSES.NOT_SENT && job.gr_Mechanic?.gr_email && (
                            <button
                                type="button"
                                className="job-assignment-mark-sent"
                                disabled={isUpdating}
                                onClick={() => void changeStatus(JOB_CARD_STATUSES.SENT)}
                            >
                                Mark sent
                            </button>
                        )}
                    </div>
                </div>

                <div className="job-additional-technicians">
                    {assignments.length > 0 && (
                        <div className="job-assignment-list">
                            {assignments.map((assignment) => {
                                const assignmentStatus = getJobCardStatus(assignment.gr_jobcardstatus)
                                const isBusy = updatingAssignmentId === assignment.gr_jobassignmentid
                                return (
                                    <article className="job-assignment-card" key={assignment.gr_jobassignmentid}>
                                        <div className="job-assignment-main">
                                            <div className="job-assignment-title">
                                                <div>
                                                    <strong>{assignment.gr_Mechanic?.gr_name ?? 'Unknown technician'}</strong>
                                                    <small>Added technician · {formatTimestamp(assignment.gr_assignedon)}</small>
                                                </div>
                                                <span className={`job-card-current status-${assignmentStatus}`}>
                                                    {JOB_CARD_STATUS_OPTIONS.find((option) => option.value === assignmentStatus)?.label}
                                                </span>
                                            </div>
                                            {assignment.gr_workinstructions && <p>{assignment.gr_workinstructions}</p>}
                                            <div className="job-assignment-controls">
                                                <button
                                                    type="button"
                                                    className="job-assignment-send"
                                                    onClick={() => void sendAssignment(assignment)}
                                                    disabled={!assignment.gr_Mechanic?.gr_email || assignmentStatus !== JOB_CARD_STATUSES.NOT_SENT}
                                                >
                                                    {isBusy
                                                        ? 'Sending...'
                                                        : assignmentStatus === JOB_CARD_STATUSES.NOT_SENT
                                                            ? 'Send job'
                                                            : JOB_CARD_STATUS_OPTIONS.find((option) => option.value === assignmentStatus)?.label}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="job-assignment-remove"
                                                    disabled={isBusy}
                                                    onClick={() => void removeAssignment(assignment)}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                            <div className="job-assignment-dates">
                                                <span>Sent: {formatTimestamp(assignment.gr_emailsenton)}</span>
                                                <span>Submitted: {formatTimestamp(assignment.gr_submittedon)}</span>
                                                <span>Closed: {formatTimestamp(assignment.gr_closedon)}</span>
                                            </div>
                                        </div>
                                    </article>
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
                            <label className="job-edit-field job-edit-field-wide">
                                <span>Work instructions</span>
                                <textarea
                                    rows={3}
                                    value={instructions}
                                    placeholder="What should this technician complete?"
                                    onChange={(event) => setInstructions(event.target.value)}
                                />
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
