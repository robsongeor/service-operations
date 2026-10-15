import type { JobBookKey } from './jobBookConfig.ts'

type TimecloudJobConfirmation = Readonly<{
    jobId: string
    jobNumber: string
    timecloudJobItemId: string
    timecloudCode: string
    timecloudEntered: true
    created: boolean
    etag: string
}>

type TimecloudJobSkipped = Readonly<{
    jobId: string
    jobNumber: string
    timecloudEntered: false
    created: false
    skipped: true
    reason: 'disabled' | 'test-mode-manual-only'
}>

export type TimecloudJobSyncResult = TimecloudJobConfirmation | TimecloudJobSkipped

export async function syncJobBookJobToTimecloud(
    accessToken: string,
    input: { book: JobBookKey; jobId: string; ledgerId: string; trigger: 'automatic' | 'manual' },
): Promise<TimecloudJobSyncResult> {
    let response: Response
    try {
        response = await fetch('/api/timecloudjobs', {
            method: 'POST',
            headers: {
                'X-Dataverse-Authorization': `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
        })
    } catch {
        throw new Error('TimeCloud could not be reached. The Job is saved and can be retried from Job Book.')
    }
    const body = await response.json().catch(() => null) as (TimecloudJobSyncResult & { error?: string }) | null
    if (!response.ok) throw new Error(body?.error || 'TimeCloud could not confirm the Job. The Job is saved and can be retried from Job Book.')
    if (!body || body.jobId.toLowerCase() !== input.jobId.toLowerCase()) {
        throw new Error('TimeCloud returned an invalid confirmation. Reload Job Book before retrying.')
    }
    if (body.timecloudEntered === false && body.skipped === true && ['disabled', 'test-mode-manual-only'].includes(body.reason)) return body
    if (body.timecloudEntered !== true || !body.timecloudJobItemId || !body.timecloudCode || !/^W\/"[^"]+"$/.test(body.etag)) {
        throw new Error('TimeCloud returned an invalid confirmation. Reload Job Book before retrying.')
    }
    return body
}
