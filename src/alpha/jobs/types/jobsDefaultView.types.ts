import { JOB_STATUS_OPTIONS, type JobStatus } from './jobStatus.types'
import { JOB_TYPE_OPTIONS, type JobType } from './jobType.types'

export const JOBS_DEFAULT_VIEW_KEY_PREFIX = 'service-operations.jobs-default-view.v1'

export type JobsDefaultView = {
    selectedJobType: JobType | 'all'
    visibleStatuses: JobStatus[]
}

export const APPLICATION_DEFAULT_JOBS_VIEW: JobsDefaultView = {
    selectedJobType: 'all',
    visibleStatuses: JOB_STATUS_OPTIONS.map((status) => status.value),
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
        if (!raw) return null

        const value = JSON.parse(raw) as Partial<JobsDefaultView> | null
        if (!value || typeof value !== 'object') return null

        const selectedJobType = value.selectedJobType === 'all'
            || (typeof value.selectedJobType === 'number' && validJobTypes.has(value.selectedJobType))
            ? value.selectedJobType as JobsDefaultView['selectedJobType']
            : APPLICATION_DEFAULT_JOBS_VIEW.selectedJobType
        const visibleStatuses = Array.isArray(value.visibleStatuses)
            ? canonicaliseJobStatuses(value.visibleStatuses.filter(
                (status): status is JobStatus => typeof status === 'number' && validJobStatuses.has(status),
            ))
            : APPLICATION_DEFAULT_JOBS_VIEW.visibleStatuses

        return { selectedJobType, visibleStatuses }
    } catch {
        return null
    }
}

export function saveJobsDefaultView(storageKey: string, defaultView: JobsDefaultView) {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify({
            selectedJobType: defaultView.selectedJobType,
            visibleStatuses: canonicaliseJobStatuses(defaultView.visibleStatuses),
        }))
        return true
    } catch {
        return false
    }
}
