import type { Job } from '../types/job.types'

export const JOB_NUMBER_REQUIRED_EMAIL_MESSAGE = 'A Job Number must be assigned before this Job can be emailed.'

export function jobHasEmailableJobNumber(job: Job) {
    return Boolean(job.gr_jobnumber?.trim())
}

export function assertJobHasEmailableJobNumber(job: Job) {
    if (!jobHasEmailableJobNumber(job)) throw new Error(JOB_NUMBER_REQUIRED_EMAIL_MESSAGE)
}
