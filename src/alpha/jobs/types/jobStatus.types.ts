export const JOB_STATUSES = {
    ALLOCATED: 122830000,
    UNALLOCATED: 122830001,
    WAITING_FOR_PARTS: 122830002,
    COMPLETE: 122830003,
    COMPLETION_REVIEW: 122830004,
    /** Legacy Dataverse value. Hidden from active choices and treated as Staging until migrated. */
    UNCONFIRMED: 122830005,
} as const

export type JobStatus = typeof JOB_STATUSES[keyof typeof JOB_STATUSES]
export type ActiveJobStatus = Exclude<JobStatus, typeof JOB_STATUSES.UNCONFIRMED>

export const JOB_STATUS_LABELS: Readonly<Record<JobStatus, string>> = {
    [JOB_STATUSES.UNALLOCATED]: 'Staging',
    [JOB_STATUSES.ALLOCATED]: 'With Technician',
    [JOB_STATUSES.WAITING_FOR_PARTS]: 'Action Required',
    [JOB_STATUSES.COMPLETE]: 'Complete',
    [JOB_STATUSES.COMPLETION_REVIEW]: 'Completion Review',
    [JOB_STATUSES.UNCONFIRMED]: 'Staging',
}

export const JOB_STATUS_OPTIONS: ReadonlyArray<{ label: string; value: ActiveJobStatus }> = [
    { label: JOB_STATUS_LABELS[JOB_STATUSES.UNALLOCATED], value: JOB_STATUSES.UNALLOCATED },
    { label: JOB_STATUS_LABELS[JOB_STATUSES.ALLOCATED], value: JOB_STATUSES.ALLOCATED },
    { label: JOB_STATUS_LABELS[JOB_STATUSES.WAITING_FOR_PARTS], value: JOB_STATUSES.WAITING_FOR_PARTS },
    { label: JOB_STATUS_LABELS[JOB_STATUSES.COMPLETE], value: JOB_STATUSES.COMPLETE },
    { label: JOB_STATUS_LABELS[JOB_STATUSES.COMPLETION_REVIEW], value: JOB_STATUSES.COMPLETION_REVIEW },
]

export function getJobStatusLabel(status: JobStatus) {
    return JOB_STATUS_LABELS[status]
}

export function canonicalJobStatus(status: JobStatus): ActiveJobStatus {
    return status === JOB_STATUSES.UNCONFIRMED ? JOB_STATUSES.UNALLOCATED : status
}

export function jobStatusIsVisible(status: JobStatus, visibleStatuses: readonly JobStatus[]) {
    return visibleStatuses.includes(canonicalJobStatus(status))
}

export const JOB_STATUS_PRIORITY: Record<JobStatus, number> = {
    [JOB_STATUSES.COMPLETE]: 0,
    [JOB_STATUSES.COMPLETION_REVIEW]: 1,
    [JOB_STATUSES.WAITING_FOR_PARTS]: 2,
    [JOB_STATUSES.ALLOCATED]: 3,
    [JOB_STATUSES.UNALLOCATED]: 4,
    [JOB_STATUSES.UNCONFIRMED]: 4,
}
