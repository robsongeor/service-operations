import type { OperationalQueryKey } from './OperationalDataClient'

/** Main operational lists shared by every route in the signed-in app shell. */
export const JOBS_OPERATIONAL_LIST_QUERY_KEY = ['jobs', 'operational-list', 'summary-v1'] as const satisfies OperationalQueryKey
export const EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY = ['equipment', 'operational-list', 'summary-v1'] as const satisfies OperationalQueryKey

export function operationalIdFingerprint(ids: readonly string[]) {
    let hash = 2166136261
    const value = [...ids].map((id) => id.toLowerCase()).sort().join('|')
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return `${ids.length}-${(hash >>> 0).toString(36)}`
}

export function customerDashboardSitesQueryKey(customerId: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'sites-v1'] as const satisfies OperationalQueryKey
}

export function customerDashboardEquipmentQueryKey(customerId: string, siteFingerprint: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'equipment-v1', siteFingerprint] as const satisfies OperationalQueryKey
}

export function customerDashboardJobsQueryKey(customerId: string, siteFingerprint: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'jobs-v1', siteFingerprint] as const satisfies OperationalQueryKey
}

export function customerDashboardServicePlansQueryKey(customerId: string, equipmentFingerprint: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'service-plans-v1', equipmentFingerprint] as const satisfies OperationalQueryKey
}

export function schedulerOptionsQueryKey(startDate: string, endDate: string) {
    return ['scheduler', 'options-v1', startDate, endDate] as const satisfies OperationalQueryKey
}

export function schedulerJobsQueryKey(startDate: string, endDate: string, jobFingerprint: string) {
    return ['scheduler', 'jobs-v1', startDate, endDate, jobFingerprint] as const satisfies OperationalQueryKey
}

export function jobMapJobsQueryKey(statuses: readonly number[]) {
    const statusFingerprint = [...new Set(statuses)].sort((a, b) => a - b).join(',') || 'none'
    return ['job-map', 'jobs-v1', statusFingerprint] as const satisfies OperationalQueryKey
}

/** Focused Job records and their progressively loaded Job Card evidence. */
export function focusedJobCoreQueryKey(jobId: string) {
    return ['job', jobId.toLowerCase(), 'core-v1'] as const satisfies OperationalQueryKey
}

export function focusedJobCardMetadataQueryKey(jobId: string) {
    return ['job', jobId.toLowerCase(), 'job-card-metadata-v1'] as const satisfies OperationalQueryKey
}

export function jobPhotoBodyQueryKey(photoId: string) {
    return ['job-photo', photoId.toLowerCase(), 'body-v1'] as const satisfies OperationalQueryKey
}
