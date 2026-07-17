export const JOB_TYPES = {
    BREAKDOWN: 122830000,
    SERVICE: 122830001,
    WORKSHOP: 122830002,
} as const

export type JobType =
    typeof JOB_TYPES[keyof typeof JOB_TYPES]

export const JOB_TYPE_OPTIONS: { label: string; value: JobType }[] = [
    { label: 'Breakdown', value: JOB_TYPES.BREAKDOWN },
    { label: 'Service', value: JOB_TYPES.SERVICE },
    { label: 'Workshop', value: JOB_TYPES.WORKSHOP },
]

export function getJobTypeLabel(jobType?: JobType) {
    return JOB_TYPE_OPTIONS.find((option) => option.value === jobType)?.label ?? 'Not set'
}
