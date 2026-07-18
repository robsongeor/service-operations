import { useState } from 'react'
import type { Job } from '../types/job.types'
import {
    getJobCardStatus,
    JOB_CARD_STATUSES,
    JOB_CARD_STATUS_OPTIONS,
    type JobCardStatus,
} from '../types/jobCardStatus.types'

type Props = {
    job: Job
    onStatusChange: (jobId: string, status: JobCardStatus) => Promise<void>
}

const timestamp = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
})

export default function JobCardFields({ job, onStatusChange }: Props) {
    const [status, setStatus] = useState(() => getJobCardStatus(job.gr_jobcardstatus))
    const [sentOn, setSentOn] = useState(job.gr_jobcardsenton)
    const [submittedOn, setSubmittedOn] = useState(job.gr_jobcardsubmittedon)
    const [closedOn, setClosedOn] = useState(job.gr_jobcardclosedon)
    const [isUpdating, setIsUpdating] = useState(false)
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

    const formatTimestamp = (value?: string | null) => value
        ? timestamp.format(new Date(value))
        : 'Not recorded'

    return (
        <section className="job-card-section">
            <div className="job-card-heading">
                <div>
                    <span>Paperwork workflow</span>
                    <h3>Job card</h3>
                    <p>The technician submits the paperwork; the office controls final closure.</p>
                </div>
                <span className={`job-card-current status-${status}`}>
                    {JOB_CARD_STATUS_OPTIONS.find((option) => option.value === status)?.label}
                </span>
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
                <small>Manual changes are available while the email and submission automation is being built.</small>
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

            {error && <p className="job-card-error" role="alert">{error}</p>}
        </section>
    )
}
