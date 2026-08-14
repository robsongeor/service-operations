import type { Job } from '../types/job.types.ts'

export function normalizeJobNumber(value: string | null | undefined) {
    return value?.trim().toLocaleUpperCase('en-NZ') ?? ''
}

export function findDuplicateJobNumber(jobs: readonly Job[], candidate: string) {
    const normalized = normalizeJobNumber(candidate)
    if (!normalized) return undefined
    return jobs.find((job) => normalizeJobNumber(job.gr_jobnumber) === normalized)
}
