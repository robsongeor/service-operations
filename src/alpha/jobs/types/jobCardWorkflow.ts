import type { Job } from './job.types.ts'
import { JOB_TYPES } from './jobType.types.ts'
import type { JobCardHistory } from '../../job-card-reviews/jobCardReview.types.ts'

/** Site Check occurrence submissions still use the separate Dataverse workflow. */
export function usesAzureJobCards(job: Pick<Job, 'gr_jobtype' | '_gr_sitecheck_value'>) {
    return job.gr_jobtype !== JOB_TYPES.SITE_CHECK && !job._gr_sitecheck_value
}

export function canRemoveAzureAssignment(
    assignmentId: string,
    history: JobCardHistory | undefined,
    historicalSubmissions: readonly { _gr_jobassignment_value?: string | null }[],
) {
    return Boolean(history && !history.truncated
        && !history.items.some((item) => item.assignmentId === assignmentId)
        && !historicalSubmissions.some((item) => item._gr_jobassignment_value === assignmentId))
}
