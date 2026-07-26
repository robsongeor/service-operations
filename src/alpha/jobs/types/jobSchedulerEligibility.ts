import type { Job } from './job.types.ts'
import { JOB_TYPES } from './jobType.types.ts'
import { jobIsOperational } from './jobStatus.types.ts'

export const SITE_CHECK_SCHEDULER_MESSAGE =
    'Site Check Jobs are managed from the Customer Dashboard and cannot be scheduled.'

export function jobIsSchedulerEligible(
    job: Pick<Job, 'gr_status' | 'gr_jobtype'>,
) {
    return jobIsOperational(job.gr_status) && job.gr_jobtype !== JOB_TYPES.SITE_CHECK
}
