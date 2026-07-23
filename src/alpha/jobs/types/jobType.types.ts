export const JOB_TYPES = {
    BREAKDOWN: 122830000,
    SERVICE: 122830001,
    WORKSHOP: 122830002,
    WOF: 122830003,
} as const

export type JobType =
    typeof JOB_TYPES[keyof typeof JOB_TYPES]

export type JobTypeFilter = JobType | 'all' | 'unconfirmed'

export const JOB_TYPE_OPTIONS: { label: string; value: JobType }[] = [
    { label: 'Breakdown', value: JOB_TYPES.BREAKDOWN },
    { label: 'Service', value: JOB_TYPES.SERVICE },
    { label: 'Workshop', value: JOB_TYPES.WORKSHOP },
    { label: 'WOF', value: JOB_TYPES.WOF },
]

export const STANDARD_JOB_TYPE_OPTIONS = JOB_TYPE_OPTIONS.filter(
    (option) => option.value !== JOB_TYPES.WOF,
)

export type JobCreationSource = 'standard' | 'wof'

export function assertJobTypeAllowedForCreation(jobType: JobType, source: JobCreationSource = 'standard') {
    if (jobType === JOB_TYPES.WOF && source !== 'wof') {
        throw new Error('Create WOF jobs from the WOF / REGO screen.')
    }
    if (jobType !== JOB_TYPES.WOF && source === 'wof') {
        throw new Error('The protected WOF workflow can only create WOF jobs.')
    }
}

export function getJobTypeLabel(jobType?: JobType) {
    return JOB_TYPE_OPTIONS.find((option) => option.value === jobType)?.label ?? 'Not set'
}

export function jobRequiresMaintenance(jobType?: JobType | '') {
    return jobType === JOB_TYPES.SERVICE
}
