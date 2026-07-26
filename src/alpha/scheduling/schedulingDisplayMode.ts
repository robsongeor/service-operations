import { JOB_TYPES, type JobType } from '../jobs/types/jobType.types'

export const SCHEDULING_DISPLAY_MODE_KEY = 'service-operations.scheduling-display-mode.v1'
export const SCHEDULING_JOB_TYPE_FILTER_KEY = 'service-operations.scheduling-job-type-filter.v1'

export type SchedulingDisplayMode = 'expanded' | 'compact' | 'today-expanded'

export const DEFAULT_SCHEDULING_DISPLAY_MODE: SchedulingDisplayMode = 'expanded'

export function restoreSchedulingDisplayMode(): SchedulingDisplayMode {
    try {
        const storedMode = sessionStorage.getItem(SCHEDULING_DISPLAY_MODE_KEY)
        return storedMode === 'expanded' || storedMode === 'compact' || storedMode === 'today-expanded'
            ? storedMode
            : DEFAULT_SCHEDULING_DISPLAY_MODE
    } catch {
        return DEFAULT_SCHEDULING_DISPLAY_MODE
    }
}

export type SchedulingJobTypeFilter = JobType | 'all'

export function restoreSchedulingJobTypeFilter(): SchedulingJobTypeFilter {
    try {
        const storedJobType = sessionStorage.getItem(SCHEDULING_JOB_TYPE_FILTER_KEY)
        if (storedJobType === 'all') return storedJobType
        const numericJobType = Number(storedJobType)
        if (numericJobType === JOB_TYPES.SITE_CHECK) return 'all'
        if (Object.values(JOB_TYPES).includes(numericJobType as JobType)) return numericJobType as JobType
    } catch {
        // Use the default when storage is unavailable.
    }
    return 'all'
}
