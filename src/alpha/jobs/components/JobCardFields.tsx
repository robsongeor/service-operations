import { useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import type { JobAssignment } from '../types/jobAssignment.types'
import { canBeAssignedJobs } from '../../mechanics/staffDirectory.ts'
import {
    getJobCardStatus,
    JOB_CARD_STATUSES,
    JOB_CARD_STATUS_OPTIONS,
    type JobCardStatus,
} from '../types/jobCardStatus.types'
import { JOB_NUMBER_REQUIRED_EMAIL_MESSAGE, jobHasEmailableJobNumber } from '../services/jobEmailRules'
import { jobHasActiveSubmissionLink } from '../services/jobSubmissionLinkApi'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import {
    formatTechnicianSubmissionHourMeter,
    formatTechnicianSubmissionTimestamp,
    hasTechnicianSubmission,
} from '../types/technicianSubmission'

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
    onSendPrimary: (job: Job) => Promise<void>
    onSendAssignment: (job: Job, assignment: JobAssignment) => Promise<void>
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

function formatEntryDate(value: string) {
    const [year, month, day] = value.slice(0, 10).split('-')
    return year && month && day ? `${day}/${month}/${year}` : value
}

type TechnicianCardProps = {
    name: string
    detail: string
    status: JobCardStatus
    instructions?: string | null
    isBusy: boolean
    canSend: boolean
    disabledHint?: string
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
    disabledHint,
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
                        title={!canSend ? disabledHint : undefined}
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
    onSendPrimary,
    onSendAssignment,
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
    const [pendingEmail, setPendingEmail] = useState<'primary' | JobAssignment | null>(null)
    const [previewPhotoId, setPreviewPhotoId] = useState('')
    const hasJobNumber = jobHasEmailableJobNumber(job)

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

    const sendAssignment = async (assignment: JobAssignment, confirmedReplacement = false) => {
        if (!hasJobNumber) {
            setError(JOB_NUMBER_REQUIRED_EMAIL_MESSAGE)
            return
        }

        if (!assignment.gr_Mechanic?.gr_email) {
            setError('This technician needs an email address before the job can be sent.')
            return
        }
        if (!confirmedReplacement && jobHasActiveSubmissionLink(job)) {
            setPendingEmail(assignment)
            return
        }

        setUpdatingAssignmentId(assignment.gr_jobassignmentid)
        setError('')
        setPendingEmail(null)
        try {
            await onSendAssignment(job, assignment)
        } catch (sendError) {
            setError(sendError instanceof Error
                ? sendError.message
                : 'The job could not be recorded as sent.')
        } finally {
            setUpdatingAssignmentId('')
        }
    }

    const sendPrimaryTechnician = async (confirmedReplacement = false) => {
        if (!hasJobNumber) {
            setError(JOB_NUMBER_REQUIRED_EMAIL_MESSAGE)
            return
        }

        if (!job.gr_Mechanic?.gr_email) {
            setError('The primary technician needs an email address before the job can be sent.')
            return
        }
        if (!confirmedReplacement && jobHasActiveSubmissionLink(job)) {
            setPendingEmail('primary')
            return
        }

        setIsUpdating(true)
        setError('')
        setPendingEmail(null)
        try {
            await onSendPrimary(job)
            setStatus(JOB_CARD_STATUSES.SENT)
            setSentOn(new Date().toISOString())
        } catch (sendError) {
            setError(sendError instanceof Error
                ? sendError.message
                : 'The job email flow did not complete.')
        } finally {
            setIsUpdating(false)
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

    return (<>
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
                    canSend={hasJobNumber && Boolean(job.gr_Mechanic?.gr_email)}
                    disabledHint={!hasJobNumber
                        ? JOB_NUMBER_REQUIRED_EMAIL_MESSAGE
                        : 'The primary technician needs an email address before the job can be sent.'}
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
                                        canSend={hasJobNumber && Boolean(assignment.gr_Mechanic?.gr_email)}
                                        disabledHint={!hasJobNumber
                                            ? JOB_NUMBER_REQUIRED_EMAIL_MESSAGE
                                            : 'This technician needs an email address before the job can be sent.'}
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
                                        canBeAssignedJobs(mechanic)
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

                <section className="technician-submission-section" aria-labelledby="technician-submission-heading">
                    <div className="job-card-heading">
                        <div>
                            <span>Original technician record</span>
                            <h3 id="technician-submission-heading">Technician submission</h3>
                        </div>
                    </div>
                    {hasTechnicianSubmission(job) ? (
                        <div className="technician-submission-content">
                            <div className="technician-submission-summary">
                                <span className={`job-card-current status-${JOB_CARD_STATUSES.SUBMITTED}`}>Submitted</span>
                                <time dateTime={job.gr_techniciansubmissionsubmittedon ?? undefined}>
                                    {formatTechnicianSubmissionTimestamp(job.gr_techniciansubmissionsubmittedon)}
                                </time>
                            </div>
                            <dl className="technician-submission-details">
                                <div>
                                    <dt>Hour meter</dt>
                                    <dd>{formatTechnicianSubmissionHourMeter(job.gr_techniciansubmissionhourmeter)}</dd>
                                </div>
                                <div>
                                    <dt>Job story</dt>
                                    <dd className="technician-submission-story">{job.gr_techniciansubmissionstory?.trim() || 'Not supplied'}</dd>
                                </div>
                                <div>
                                    <dt>Time &amp; Travel</dt>
                                    <dd>{job.technicianSubmissionTimeEntries?.length ? (
                                        <ul className="technician-submission-list">
                                            {job.technicianSubmissionTimeEntries.map((entry) => (
                                                <li key={entry.id}>
                                                    <strong>{formatEntryDate(entry.date)}</strong>
                                                    <span>{entry.hours.toLocaleString('en-NZ')} h · {entry.kilometres.toLocaleString('en-NZ')} km</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : 'None recorded'}</dd>
                                </div>
                                <div>
                                    <dt>Parts</dt>
                                    <dd>{job.technicianSubmissionParts?.length ? (
                                        <ul className="technician-submission-parts">
                                            {job.technicianSubmissionParts.map((part) => <li key={part.id}>
                                                <strong>{part.quantity.toLocaleString('en-NZ')} &times;</strong> {part.part}
                                            </li>)}
                                        </ul>
                                    ) : 'None recorded'}</dd>
                                </div>
                                <div>
                                    <dt>Further Work Required</dt>
                                    <dd className="technician-submission-story">{job.gr_techniciansubmissionfurtherworkrequired
                                        ? job.gr_techniciansubmissionfurtherworkdetails?.trim() || 'Details not supplied'
                                        : 'No'}</dd>
                                </div>
                                <div>
                                    <dt>Safety Issue</dt>
                                    <dd className="technician-submission-story">{job.gr_techniciansubmissionsafetyissueidentified
                                        ? job.gr_techniciansubmissionsafetyissuedetails?.trim() || 'Details not supplied'
                                        : 'No'}</dd>
                                </div>
                                <div>
                                    <dt>Photos</dt>
                                    <dd>{job.jobPhotos?.length ? (
                                        <div className="manager-job-photo-grid">
                                            {job.jobPhotos.map((photo) => (
                                                <button type="button" key={photo.id} onClick={() => setPreviewPhotoId(photo.id)}>
                                                    <img src={photo.previewUrl} alt={photo.fileName} />
                                                    <span>{photo.fileName}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : 'None recorded'}</dd>
                                </div>
                            </dl>
                        </div>
                    ) : (
                        <div className="technician-submission-empty">
                            <strong>Not yet submitted</strong>
                            <p>The technician has not submitted an hour meter or job story for this Job.</p>
                        </div>
                    )}
                </section>
            </section>

            {error && <p className="job-card-error" role="alert">{error}</p>}
        </div>
        {pendingEmail && <EditDrawerConfirmation
            eyebrow="Replace secure link"
            title="Generate a new technician submission link?"
            message="Generating a new link will invalidate the previous technician submission link for this Job."
            isBusy={isUpdating || Boolean(updatingAssignmentId)}
            confirmLabel={isUpdating || updatingAssignmentId ? 'Generating...' : 'Generate and email'}
            onCancel={() => setPendingEmail(null)}
            onConfirm={() => {
                if (pendingEmail === 'primary') void sendPrimaryTechnician(true)
                else void sendAssignment(pendingEmail, true)
            }}
        />}
        {previewPhotoId && (() => {
            const photo = job.jobPhotos?.find((item) => item.id === previewPhotoId)
            return photo ? <div className="job-photo-preview" role="dialog" aria-modal="true" aria-label={photo.fileName} onClick={() => setPreviewPhotoId('')}>
                <button type="button" aria-label="Close photo preview" onClick={() => setPreviewPhotoId('')}>×</button>
                <img src={photo.previewUrl} alt={photo.fileName} onClick={(event) => event.stopPropagation()} />
                <span>{photo.fileName}</span>
            </div> : null
        })()}
    </>)
}
