import { JOB_STATUSES, type JobStatus } from './jobStatus.types'
import { JOB_TYPES, type JobType } from './jobType.types'

export const JOBS_VIEW_STATE_KEY = 'service-operations.jobs-view-state.v1'

export type JobsViewState = {
    visibleStatuses: JobStatus[]
    selectedJobType: JobType | 'all'
    officeAttentionFilter: 'all' | 'required' | 'none'
    searchText: string
    sort: {
        column: 'created' | 'status'
        direction: 'ascending' | 'descending'
    }
}

const jobStatuses = new Set<number>(Object.values(JOB_STATUSES))
const jobTypes = new Set<number>(Object.values(JOB_TYPES))

export const DEFAULT_JOBS_VIEW_STATE: JobsViewState = {
    visibleStatuses: Object.values(JOB_STATUSES),
    selectedJobType: 'all',
    officeAttentionFilter: 'all',
    searchText: '',
    sort: { column: 'status', direction: 'ascending' },
}

export function restoreJobsViewState(): JobsViewState {
    try {
        const raw = sessionStorage.getItem(JOBS_VIEW_STATE_KEY)
        if (!raw) return DEFAULT_JOBS_VIEW_STATE
        const value = JSON.parse(raw) as Partial<JobsViewState>
        const visibleStatuses = Array.isArray(value.visibleStatuses)
            ? value.visibleStatuses.filter((status): status is JobStatus => typeof status === 'number' && jobStatuses.has(status))
            : DEFAULT_JOBS_VIEW_STATE.visibleStatuses
        const selectedJobType = value.selectedJobType === 'all' || (typeof value.selectedJobType === 'number' && jobTypes.has(value.selectedJobType))
            ? value.selectedJobType as JobType | 'all'
            : DEFAULT_JOBS_VIEW_STATE.selectedJobType
        const officeAttentionFilter = value.officeAttentionFilter === 'required' || value.officeAttentionFilter === 'none'
            ? value.officeAttentionFilter
            : 'all'
        const column = value.sort?.column === 'created' ? 'created' : 'status'
        const direction = value.sort?.direction === 'descending' ? 'descending' : 'ascending'

        return {
            visibleStatuses,
            selectedJobType,
            officeAttentionFilter,
            searchText: typeof value.searchText === 'string' ? value.searchText : '',
            sort: { column, direction },
        }
    } catch {
        return DEFAULT_JOBS_VIEW_STATE
    }
}
