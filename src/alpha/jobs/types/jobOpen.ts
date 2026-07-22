import type { Job } from './job.types'
import { JOB_STATUSES } from './jobStatus.types'

export function isOpenJob(job: Pick<Job, 'gr_status'>) {
    return job.gr_status !== JOB_STATUSES.COMPLETE
}
