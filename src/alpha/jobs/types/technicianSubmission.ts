import type { Job } from './job.types'
import { getJobCardStatus, JOB_CARD_STATUSES } from './jobCardStatus.types.ts'

const submissionTimestampFormatter = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
})

export function hasTechnicianSubmission(job: Job) {
    return Boolean(job.gr_techniciansubmissionsubmittedon)
        && getJobCardStatus(job.gr_jobcardstatus) === JOB_CARD_STATUSES.SUBMITTED
}

export function formatTechnicianSubmissionTimestamp(value?: string | null) {
    return value ? submissionTimestampFormatter.format(new Date(value)) : 'Not recorded'
}

export function formatTechnicianSubmissionHourMeter(value?: number | null) {
    return value == null ? 'Not supplied' : new Intl.NumberFormat('en-NZ').format(value)
}
