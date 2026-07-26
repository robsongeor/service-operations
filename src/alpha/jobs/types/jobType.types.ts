export const JOB_TYPES = {
    BREAKDOWN: 122830000,
    SERVICE: 122830001,
    WORKSHOP: 122830002,
    WOF: 122830003,
    SITE_CHECK: 122830004,
} as const

export type JobType =
    typeof JOB_TYPES[keyof typeof JOB_TYPES]

export type JobTypeFilter = JobType | 'operational' | 'all' | 'unconfirmed'

export const JOB_TYPE_OPTIONS: { label: string; value: JobType }[] = [
    { label: 'Breakdown', value: JOB_TYPES.BREAKDOWN },
    { label: 'Service', value: JOB_TYPES.SERVICE },
    { label: 'Workshop', value: JOB_TYPES.WORKSHOP },
    { label: 'WOF', value: JOB_TYPES.WOF },
    { label: 'Site Check', value: JOB_TYPES.SITE_CHECK },
]

export const STANDARD_JOB_TYPE_OPTIONS = JOB_TYPE_OPTIONS.filter(
    (option) => option.value !== JOB_TYPES.WOF && option.value !== JOB_TYPES.SITE_CHECK,
)

export const SCHEDULER_JOB_TYPE_OPTIONS = JOB_TYPE_OPTIONS.filter(
    (option) => option.value !== JOB_TYPES.SITE_CHECK,
)

export type JobCreationSource = 'standard' | 'wof' | 'site-check'

export function assertJobTypeAllowedForCreation(jobType: JobType, source: JobCreationSource = 'standard') {
    if (jobType === JOB_TYPES.WOF && source !== 'wof') {
        throw new Error('Create WOF jobs from the WOF / REGO screen.')
    }
    if (jobType === JOB_TYPES.SITE_CHECK && source !== 'site-check') {
        throw new Error('Create Site Check jobs from the Site Check workflow.')
    }
    if (jobType !== JOB_TYPES.WOF && source === 'wof') {
        throw new Error('The protected WOF workflow can only create WOF jobs.')
    }
    if (jobType !== JOB_TYPES.SITE_CHECK && source === 'site-check') {
        throw new Error('The protected Site Check workflow can only create Site Check jobs.')
    }
}

export function getJobTypeLabel(jobType?: JobType) {
    return JOB_TYPE_OPTIONS.find((option) => option.value === jobType)?.label ?? 'Not set'
}

export function jobRequiresMaintenance(jobType?: JobType | '') {
    return jobType === JOB_TYPES.SERVICE
}
