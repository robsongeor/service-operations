export const JOB_STATUSES = {
    ALLOCATED: 122830000,
    UNALLOCATED: 122830001,
    WAITING_FOR_PARTS: 122830002,
    COMPLETE: 122830003,
    COMPLETION_REVIEW: 122830004,
    UNCONFIRMED: 122830005,
} as const

export type JobStatus = typeof JOB_STATUSES[keyof typeof JOB_STATUSES]

export const JOB_STATUS_OPTIONS: { label: string; value: JobStatus }[] = [
    { label: 'Unallocated', value: JOB_STATUSES.UNALLOCATED },
    { label: 'Allocated', value: JOB_STATUSES.ALLOCATED },
    { label: 'Waiting for parts', value: JOB_STATUSES.WAITING_FOR_PARTS },
    { label: 'Complete', value: JOB_STATUSES.COMPLETE },
    { label: 'Completion Review', value: JOB_STATUSES.COMPLETION_REVIEW },
    { label: 'Unconfirmed', value: JOB_STATUSES.UNCONFIRMED },
]

export const JOB_STATUS_PRIORITY: Record<JobStatus, number> = {
    [JOB_STATUSES.COMPLETE]: 0,
    [JOB_STATUSES.COMPLETION_REVIEW]: 1,
    [JOB_STATUSES.WAITING_FOR_PARTS]: 2,
    [JOB_STATUSES.ALLOCATED]: 3,
    [JOB_STATUSES.UNALLOCATED]: 4,
    [JOB_STATUSES.UNCONFIRMED]: 5,
}

export const UNCONFIRMED_OPERATION_MESSAGE =
    'This job is unconfirmed and must be moved to Unallocated before it can be scheduled.'

export function jobIsOperational(status: JobStatus) {
    return status !== JOB_STATUSES.UNCONFIRMED
}
