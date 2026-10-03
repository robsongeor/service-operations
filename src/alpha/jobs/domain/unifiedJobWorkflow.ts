import type { Job } from '../types/job.types.ts'

// Deliberately NOT the production registration release flag. The additional
// operations below have fixture implementations only, not provisioned APIs.
export const UNIFIED_JOB_WALKTHROUGH = import.meta.env?.DEV === true
    && import.meta.env?.VITE_UNIFIED_JOB_WALKTHROUGH === 'true'

export type JobWorklist = 'operational' | 'staging' | 'all'
export const UNIFIED_JOB_SELECT = ',gr_coordinatormanaged,gr_registrationvoid,gr_registrationvoidreason'

export function isCoordinatorManaged(job: Job) {
    // Missing migration metadata must never silently remove existing work.
    return job.gr_coordinatormanaged !== false
}

export function jobMatchesWorklist(job: Job, worklist: JobWorklist) {
    if (worklist === 'all') return true
    if (job.gr_registrationvoid) return false
    return worklist === 'staging' ? !job.gr_jobnumber?.trim() : isCoordinatorManaged(job)
}

export function jobWorklistLabel(job: Job) {
    if (job.gr_registrationvoid) return 'Void'
    if (!job.gr_jobnumber?.trim()) return isCoordinatorManaged(job) ? 'Staging · managed' : 'Staging'
    return isCoordinatorManaged(job) ? 'Managed' : 'Job Book'
}
