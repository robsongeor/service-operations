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

export async function generateJobSubmissionLink(accessToken: string, jobId: string) {
    const response = await fetch('/api/jobsubmission', {
        method: 'POST',
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generate', jobId }),
    })
    if (!response.ok) {
        throw new Error('The secure Job Card link could not be created. Please try again.')
    }
    const body = await response.json() as SubmissionLinkResponse
    if (!body.path?.startsWith('/portal/job/')) {
        throw new Error('The secure Job Card link could not be created. Please try again.')
    }
    return {
        url: new URL(body.path, window.location.origin).toString(),
        expiresOn: body.expiresOn,
    }
}
