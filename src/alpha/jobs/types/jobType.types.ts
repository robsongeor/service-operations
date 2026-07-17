export const JOB_TYPES = {
    BREAKDOWN: 122830000,
    SERVICE: 122830001,
    WORKSHOP: 122830002,
} as const

export type JobType =
    typeof JOB_TYPES[keyof typeof JOB_TYPES]
