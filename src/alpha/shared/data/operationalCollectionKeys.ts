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

export function customerDashboardScheduleOptionsQueryKey(customerId: string, jobFingerprint: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'job-schedule-options-v1', jobFingerprint] as const satisfies OperationalQueryKey
}

export function customerDashboardOfficeUpdatesQueryKey(customerId: string, jobFingerprint: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'job-office-updates-v1', jobFingerprint] as const satisfies OperationalQueryKey
}

export function customerDashboardServicePlansQueryKey(customerId: string, equipmentFingerprint: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'service-plans-v1', equipmentFingerprint] as const satisfies OperationalQueryKey
}

export function customerDashboardQuotesQueryKey(customerId: string) {
    return ['customer-dashboard', customerId.toLowerCase(), 'quotes-v1'] as const satisfies OperationalQueryKey
}

export function schedulerOptionsQueryKey(startDate: string, endDate: string) {
    return ['scheduler', 'options-v1', startDate, endDate] as const satisfies OperationalQueryKey
}

export function schedulerJobsQueryKey(startDate: string, endDate: string, jobFingerprint: string) {
    return ['scheduler', 'jobs-v1', startDate, endDate, jobFingerprint] as const satisfies OperationalQueryKey
}

export function schedulerOfficeUpdatesQueryKey(startDate: string, endDate: string, jobFingerprint: string) {
    return ['scheduler', 'job-office-updates-v1', startDate, endDate, jobFingerprint] as const satisfies OperationalQueryKey
}

export function jobMapJobsQueryKey(statuses: readonly number[]) {
    const statusFingerprint = [...new Set(statuses)].sort((a, b) => a - b).join(',') || 'none'
    return ['job-map', 'jobs-v1', statusFingerprint] as const satisfies OperationalQueryKey
}

/** Staff directory data is split so people render before workload and qualification details. */
export const STAFF_DIRECTORY_QUERY_KEY = ['staff', 'directory-v1'] as const satisfies OperationalQueryKey
export const STAFF_OPEN_ALLOCATIONS_QUERY_KEY = ['staff', 'open-job-allocations-v1'] as const satisfies OperationalQueryKey
export const STAFF_QUALIFICATIONS_QUERY_KEY = ['staff', 'qualifications-v1'] as const satisfies OperationalQueryKey
export const STAFF_QUALIFICATION_TYPES_QUERY_KEY = ['staff', 'qualification-types-v1'] as const satisfies OperationalQueryKey

export function focusedStaffJobsQueryKey(mechanicId: string, view: 'open' | 'complete' | 'all') {
    return ['staff', mechanicId.toLowerCase(), 'jobs-v1', view] as const satisfies OperationalQueryKey
}

/** WOF register history and its Job-scoped scheduling projection. */
export const WOF_INSPECTIONS_QUERY_KEY = ['wof', 'inspections-v1'] as const satisfies OperationalQueryKey

/** Shared Quote register plus progressively loaded editor data. */
export const QUOTES_REGISTER_QUERY_KEY = ['quotes', 'register-v1'] as const satisfies OperationalQueryKey
export const PRICING_CATALOGUE_QUERY_KEY = ['pricing', 'catalogue-v1'] as const satisfies OperationalQueryKey

export function focusedQuoteQueryKey(quoteId: string) {
    return ['quote', quoteId.toLowerCase(), 'core-v1'] as const satisfies OperationalQueryKey
}

export function wofScheduleOptionsQueryKey(jobFingerprint: string) {
    return ['wof', 'schedule-options-v1', jobFingerprint] as const satisfies OperationalQueryKey
}

/** Focused Job records and their progressively loaded Job Card evidence. */
export function focusedJobCoreQueryKey(jobId: string) {
    return ['job', jobId.toLowerCase(), 'core-v1'] as const satisfies OperationalQueryKey
}

export function focusedJobCardMetadataQueryKey(jobId: string) {
    return ['job', jobId.toLowerCase(), 'job-card-metadata-v1'] as const satisfies OperationalQueryKey
}

export function focusedJobQuotesQueryKey(jobId: string) {
    return ['job', jobId.toLowerCase(), 'quotes-v1'] as const satisfies OperationalQueryKey
}

export function focusedJobAssignmentsQueryKey(jobId: string) {
    return ['job', jobId.toLowerCase(), 'assignments-v1'] as const satisfies OperationalQueryKey
}

/** Focused Equipment children loaded only by the Equipment workspace that needs them. */
export function focusedEquipmentServicePlansQueryKey(equipmentId: string) {
    return ['equipment', equipmentId.toLowerCase(), 'service-plans-v1'] as const satisfies OperationalQueryKey
}

export function equipmentRegisterServicePlansQueryKey(equipmentFingerprint: string) {
    return ['equipment-register', 'visible-service-plans-v1', equipmentFingerprint] as const satisfies OperationalQueryKey
}

export function jobPhotoBodyQueryKey(photoId: string) {
    return ['job-photo', photoId.toLowerCase(), 'body-v1'] as const satisfies OperationalQueryKey
}
