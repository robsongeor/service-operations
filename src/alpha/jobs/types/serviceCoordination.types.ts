import type { Job } from './job.types.ts'
import type { OperatingBranch } from './operatingBranch.types.ts'
export { OPERATING_BRANCHES, OPERATING_BRANCH_LABELS } from './operatingBranch.types.ts'
export type { OperatingBranch } from './operatingBranch.types.ts'
export type CoordinationView = 'branch' | 'all' | 'watchlist'

export type ServiceCoordinationContext = {
    branch: { value: OperatingBranch; label: string }
}

export type PersonalJobWatch = {
    watchId: string
    watchedOn: string
    job: Job
}

export type JobCardProgressState = 'not-sent' | 'awaiting' | 'partial' | 'ready' | 'expired' | 'conflict' | 'unavailable'

export type JobCardProgressSummary = {
    jobId: string
    jobStatus?: number
    expectedTechnicianCount: number
    currentRequiredTechnicianCount: number
    returnedCount: number
    state: JobCardProgressState
    officeAttentionRecommended: boolean
    lastChangedOn?: string
    actionRequiredPreserved?: boolean
}
