export const JOB_STATUSES = {
    ALLOCATED: 122830000,
    UNALLOCATED: 122830001,
    WAITING_FOR_PARTS: 122830002,
    COMPLETE: 122830003,
} as const

export type JobStatus = typeof JOB_STATUSES[keyof typeof JOB_STATUSES]

export const JOB_STATUS_OPTIONS: { label: string; value: JobStatus }[] = [
    { label: 'Unallocated', value: JOB_STATUSES.UNALLOCATED },
    { label: 'Allocated', value: JOB_STATUSES.ALLOCATED },
    { label: 'Waiting for parts', value: JOB_STATUSES.WAITING_FOR_PARTS },
    { label: 'Complete', value: JOB_STATUSES.COMPLETE },
]

export const JOB_STATUS_PRIORITY: Record<JobStatus, number> = {
    [JOB_STATUSES.COMPLETE]: 0,
    [JOB_STATUSES.WAITING_FOR_PARTS]: 1,
    [JOB_STATUSES.ALLOCATED]: 2,
    [JOB_STATUSES.UNALLOCATED]: 3,
}
