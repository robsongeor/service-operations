import { JOB_STATUSES, JOB_STATUS_OPTIONS, type JobStatus } from './jobStatus.types.ts'
import { JOB_TYPE_OPTIONS, type JobTypeFilter } from './jobType.types.ts'
import { isJobsStickyThroughColumnId, type JobsStickyThroughColumnId } from './jobsTableColumns.ts'

export const LEGACY_JOBS_DEFAULT_VIEW_KEY_PREFIX = 'service-operations.jobs-default-view.v1'
export const JOBS_DEFAULT_VIEW_KEY_PREFIX = 'service-operations.jobs-default-view.v2'

export type JobsDefaultView = {
    selectedJobType: JobTypeFilter
    visibleStatuses: JobStatus[]
    stickyThroughColumnId: JobsStickyThroughColumnId | null
}

export const APPLICATION_DEFAULT_JOBS_VIEW: JobsDefaultView = {
    selectedJobType: 'operational',
    visibleStatuses: JOB_STATUS_OPTIONS.map((status) => status.value),
    stickyThroughColumnId: null,
}

const validJobTypes = new Set<number>(JOB_TYPE_OPTIONS.map((jobType) => jobType.value))
const validJobStatuses = new Set<number>(JOB_STATUS_OPTIONS.map((status) => status.value))

export function getJobsDefaultViewKey(storageId: string) {
    return `${JOBS_DEFAULT_VIEW_KEY_PREFIX}.${storageId}`
}

export function canonicaliseJobStatuses(statuses: JobStatus[]) {
    return [...new Set(statuses)].sort((left, right) => left - right)
}

export function restoreJobsDefaultView(storageKey: string): JobsDefaultView | null {
    try {
        const raw = sessionStorage.getItem(storageKey)
        const storageId = storageKey.slice(`${JOBS_DEFAULT_VIEW_KEY_PREFIX}.`.length)
        const legacyKey = `${LEGACY_JOBS_DEFAULT_VIEW_KEY_PREFIX}.${storageId}`
        const legacyRaw = !raw ? sessionStorage.getItem(legacyKey) : null
        if (!raw && !legacyRaw) return null

        const value = JSON.parse(raw ?? legacyRaw!) as Partial<JobsDefaultView> | null
        if (!value || typeof value !== 'object') return null

        const selectedJobType = value.selectedJobType === 'all'
            || value.selectedJobType === 'operational'
            || value.selectedJobType === 'unconfirmed'
            || (typeof value.selectedJobType === 'number' && validJobTypes.has(value.selectedJobType))
            ? value.selectedJobType as JobsDefaultView['selectedJobType']
            : APPLICATION_DEFAULT_JOBS_VIEW.selectedJobType
        let visibleStatuses = Array.isArray(value.visibleStatuses)
            ? canonicaliseJobStatuses(value.visibleStatuses.filter(
                (status): status is JobStatus => typeof status === 'number' && validJobStatuses.has(status),
            ))
            : APPLICATION_DEFAULT_JOBS_VIEW.visibleStatuses
        if (selectedJobType === 'unconfirmed' && !visibleStatuses.includes(JOB_STATUSES.UNCONFIRMED)) {
            visibleStatuses = canonicaliseJobStatuses([...visibleStatuses, JOB_STATUSES.UNCONFIRMED])
        }

        const stickyThroughColumnId = value.stickyThroughColumnId === null
            ? null
            : isJobsStickyThroughColumnId(value.stickyThroughColumnId)
                ? value.stickyThroughColumnId
                : APPLICATION_DEFAULT_JOBS_VIEW.stickyThroughColumnId
        const migratedSelectedJobType = legacyRaw && selectedJobType === 'all'
            ? 'operational'
            : selectedJobType
        const restored = { selectedJobType: migratedSelectedJobType, visibleStatuses, stickyThroughColumnId }
        if (legacyRaw) {
            sessionStorage.setItem(storageKey, JSON.stringify(restored))
            sessionStorage.removeItem(legacyKey)
        }
        return restored
    } catch {
        return null
    }
}

export function saveJobsDefaultView(storageKey: string, defaultView: JobsDefaultView) {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify({
            selectedJobType: defaultView.selectedJobType,
            visibleStatuses: canonicaliseJobStatuses(defaultView.visibleStatuses),
            stickyThroughColumnId: defaultView.stickyThroughColumnId,
        }))
        return true
    } catch {
        return false
    }
}
