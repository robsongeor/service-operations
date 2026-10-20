import { canonicalJobStatus, JOB_STATUSES, type JobStatus } from '../types/jobStatus.types.ts'

export type JobLifecycleSignal =
    | 'mechanicSelected'
    | 'dispatchConfirmed'
    | 'allRequiredCardsReturned'
    | 'finalTechnicianWithdrawal'

/**
 * Pure description of the automatic lifecycle contract. Persistence owners must still use
 * concurrency checks and authoritative delivery/return evidence before applying the result.
 */
export function statusAfterLifecycleSignal(currentStatus: JobStatus, signal: JobLifecycleSignal): JobStatus {
    const status = canonicalJobStatus(currentStatus)
    if (signal === 'dispatchConfirmed' && status === JOB_STATUSES.UNALLOCATED) {
        return JOB_STATUSES.ALLOCATED
    }
    if (signal === 'allRequiredCardsReturned' && status === JOB_STATUSES.ALLOCATED) {
        return JOB_STATUSES.COMPLETION_REVIEW
    }
    if (signal === 'finalTechnicianWithdrawal' && status === JOB_STATUSES.ALLOCATED) {
        return JOB_STATUSES.UNALLOCATED
    }
    return status
}

export type TechnicianReturnState = 'received' | 'awaiting' | 'expired' | 'withdrawn' | 'notSent'

export type JobCardProgress =
    | 'notSent'
    | 'awaiting'
    | 'partiallyReturned'
    | 'readyForReview'
    | 'attentionRequired'
    | 'unknown'

export interface JobCardProgressEvidence {
    expectedReturns?: readonly TechnicianReturnState[]
    evidenceComplete: boolean
    historyTruncated?: boolean
    replacementConflict?: boolean
    contradictory?: boolean
}

/**
 * Summarises technician returns without manufacturing certainty from incomplete evidence.
 */
export function resolveJobCardProgress(evidence: JobCardProgressEvidence): JobCardProgress {
    if (!evidence.evidenceComplete
        || evidence.historyTruncated
        || evidence.replacementConflict
        || evidence.contradictory
        || !evidence.expectedReturns) return 'unknown'

    const requiredReturns = evidence.expectedReturns.filter((state) => state !== 'withdrawn')
    if (!requiredReturns.length || requiredReturns.every((state) => state === 'notSent')) return 'notSent'
    if (requiredReturns.every((state) => state === 'received')) return 'readyForReview'
    if (requiredReturns.some((state) => state === 'expired')) return 'attentionRequired'
    if (requiredReturns.some((state) => state === 'received')) return 'partiallyReturned'
    return 'awaiting'
}

export interface PersonalJobViewState {
    status: JobStatus
    watched: boolean
}

/** Personal watch state is an overlay and never changes the shared operational status. */
export function withPersonalWatch(state: PersonalJobViewState, watched: boolean): PersonalJobViewState {
    return { ...state, watched }
}
