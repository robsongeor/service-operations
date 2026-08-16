import type { Job } from '../types/job.types'

type SubmissionLinkResponse = {
    path: string
    expiresOn: string
}

export function jobHasActiveSubmissionLink(job: Job, now = Date.now()) {
    const expiresOn = Date.parse(job.gr_techniciansubmissiontokenexpireson ?? '')
    return Boolean(
        job.gr_techniciansubmissiontokenhash
        && job.gr_techniciansubmissiontokenused === false
        && Number.isFinite(expiresOn)
        && expiresOn > now,
    )
}

export function buildJobSubmissionPublicUrl(
    path: string,
    currentOrigin: string,
    configuredPublicOrigin = '',
) {
    if (!path.startsWith('/portal/job/')) {
        throw new Error('The secure Job Card link path is invalid.')
    }
    const configured = configuredPublicOrigin.trim()
    if (!configured) return new URL(path, currentOrigin).toString()

    const publicUrl = new URL(configured)
    if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password) {
        throw new Error('The public app URL must be a secure HTTPS origin.')
    }
    return new URL(path, publicUrl.origin).toString()
}

export type JobSubmissionRecipient = {
    jobId: string
    mechanicId?: string
    assignmentId?: string
    recipientName: string
    recipientEmail: string
}

export async function generateJobSubmissionLink(accessToken: string, recipient: JobSubmissionRecipient) {
    const response = await fetch('/api/jobsubmission', {
        method: 'POST',
        cache: 'no-store',
        headers: {
            'X-Dataverse-Authorization': `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generate', ...recipient }),
    })
    if (!response.ok) {
        throw new Error('The secure Job Card link could not be created. Please try again.')
    }
    const body = await response.json() as SubmissionLinkResponse
    if (!body.path?.startsWith('/portal/job/')) {
        throw new Error('The secure Job Card link could not be created. Please try again.')
    }
    return {
        url: buildJobSubmissionPublicUrl(
            body.path,
            window.location.origin,
            import.meta.env.VITE_PUBLIC_APP_URL,
        ),
        expiresOn: body.expiresOn,
    }
}
