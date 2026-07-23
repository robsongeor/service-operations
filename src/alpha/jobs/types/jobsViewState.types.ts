import { JOB_STATUSES, type JobStatus } from './jobStatus.types'
import { JOB_TYPES, type JobTypeFilter } from './jobType.types'
import type { JobsDefaultView } from './jobsDefaultView.types'

export const LEGACY_JOBS_VIEW_STATE_KEY = 'service-operations.jobs-view-state.v1'
export const JOBS_VIEW_STATE_KEY_PREFIX = 'service-operations.jobs-view-state.v2'

export type ScheduledJobsVisibility = 'all' | 'today' | 'today-tomorrow' | 'this-week'
export type JobsSortColumn = 'created' | 'status' | 'customer' | 'mechanic'

export type JobsViewState = {
    visibleStatuses: JobStatus[]
    selectedJobType: JobTypeFilter
    officeAttentionFilter: 'all' | 'required' | 'none'
    searchText: string
    scheduledJobsVisibility: ScheduledJobsVisibility
    sort: {
        column: JobsSortColumn
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
    scheduledJobsVisibility: 'all',
    sort: { column: 'status', direction: 'ascending' },
}

export function getJobsViewStateKey(storageId: string) {
    return `${JOBS_VIEW_STATE_KEY_PREFIX}.${storageId}`
}

function parseJobsViewState(raw: string | null): JobsViewState | null {
    try {
        if (!raw) return null
        const value = JSON.parse(raw) as Partial<JobsViewState>
        if (!value || typeof value !== 'object') return null
        let visibleStatuses = Array.isArray(value.visibleStatuses)
            ? value.visibleStatuses.filter((status): status is JobStatus => typeof status === 'number' && jobStatuses.has(status))
            : DEFAULT_JOBS_VIEW_STATE.visibleStatuses
        const selectedJobType = value.selectedJobType === 'all'
            || value.selectedJobType === 'unconfirmed'
            || (typeof value.selectedJobType === 'number' && jobTypes.has(value.selectedJobType))
            ? value.selectedJobType as JobTypeFilter
            : DEFAULT_JOBS_VIEW_STATE.selectedJobType
        if (selectedJobType === 'unconfirmed' && !visibleStatuses.includes(JOB_STATUSES.UNCONFIRMED)) {
            visibleStatuses = [...visibleStatuses, JOB_STATUSES.UNCONFIRMED]
        }
        const officeAttentionFilter = value.officeAttentionFilter === 'required' || value.officeAttentionFilter === 'none'
            ? value.officeAttentionFilter
            : 'all'
        const validSortColumns = new Set<JobsSortColumn>(['created', 'status', 'customer', 'mechanic'])
        const column = validSortColumns.has(value.sort?.column as JobsSortColumn)
            ? value.sort?.column as JobsSortColumn
            : DEFAULT_JOBS_VIEW_STATE.sort.column
        const direction = value.sort?.direction === 'descending' ? 'descending' : 'ascending'
        const scheduledJobsVisibility: ScheduledJobsVisibility =
            value.scheduledJobsVisibility === 'today'
            || value.scheduledJobsVisibility === 'today-tomorrow'
            || value.scheduledJobsVisibility === 'this-week'
                ? value.scheduledJobsVisibility
                : 'all'

        return {
            visibleStatuses,
            selectedJobType,
            officeAttentionFilter,
            searchText: typeof value.searchText === 'string' ? value.searchText : '',
            scheduledJobsVisibility,
            sort: { column, direction },
        }
    } catch {
        return null
    }
}

export function applyJobsDefaultView(defaultView: JobsDefaultView): JobsViewState {
    return {
        ...DEFAULT_JOBS_VIEW_STATE,
        selectedJobType: defaultView.selectedJobType,
        visibleStatuses: [...defaultView.visibleStatuses],
    }
}

export function restoreJobsViewState(storageKey: string, migrateLegacy = false): JobsViewState | null {
    try {
        const scopedValue = sessionStorage.getItem(storageKey)
        if (scopedValue !== null) return parseJobsViewState(scopedValue)

        if (migrateLegacy) {
            const legacyValue = sessionStorage.getItem(LEGACY_JOBS_VIEW_STATE_KEY)
            if (legacyValue !== null) {
                const migratedState = parseJobsViewState(legacyValue)
                if (migratedState) sessionStorage.setItem(storageKey, JSON.stringify(migratedState))
                sessionStorage.removeItem(LEGACY_JOBS_VIEW_STATE_KEY)
                return migratedState
            }
        }
    } catch {
        return null
    }

    return null
}
