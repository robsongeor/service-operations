import { UNIFIED_JOB_WALKTHROUGH } from '../domain/unifiedJobWorkflow.ts'
import type { Job } from '../types/job.types.ts'

/** Conditional sample edit; never used by the normal Dataverse runtime. */
export async function updateWalkthroughJob(token: string, original: Job, fields: Record<string, unknown>): Promise<Job> {
    if (!UNIFIED_JOB_WALKTHROUGH || !['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Sample edits are unavailable.')
    if (original.gr_registrationvoid || !original['@odata.etag']) throw new Error('Reload this Job before editing; Void entries cannot be edited.')
    const response = await fetch(`/api/data/v9.2/gr_jobs(${original.gr_jobid})`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': original['@odata.etag'] }, body: JSON.stringify(fields),
    })
    if (response.status === 412) throw new Error('Someone else changed this Job. Refresh Jobs and reopen it before saving.')
    if (!response.ok) throw new Error('The sample Job edit was rejected. Check its fields and your sample role.')
    return response.json()
}

/** Fixture-only operations. These are not provisioned Dataverse APIs. */
export async function walkthroughJobAction(token: string, action: 'void' | 'manage', body: Record<string, unknown>): Promise<void> {
    if (!UNIFIED_JOB_WALKTHROUGH || !['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('This workflow is available only in the isolated sample walkthrough.')
    const response = await fetch(`/__walkthrough/jobs/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (response.status === 412) throw new Error('Someone else changed this Job. Reload the latest entry before continuing.')
    if (!response.ok) throw new Error('This sample Job cannot be changed. Reload it and check its entry markers and management state.')
}

export async function fetchWalkthroughJobsPage(token: string, cursor = '', signal?: AbortSignal): Promise<{ records: Job[]; next: string }> {
    if (!UNIFIED_JOB_WALKTHROUGH) throw new Error('The sample worklist is unavailable.')
    const response = await fetch(`/__walkthrough/jobs?cursor=${encodeURIComponent(cursor)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal })
    if (!response.ok) throw new Error('The sample Jobs could not be loaded.')
    return response.json()
}
