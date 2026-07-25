import type { JobCardSubmissionInput, PublicJobSubmissionDetails, PublicSubmissionError } from './jobSubmission.types'

export class JobSubmissionError extends Error {
    readonly code: PublicSubmissionError['code']

    constructor(code: PublicSubmissionError['code'], message: string) {
        super(message)
        this.code = code
    }
}

async function readResponse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({})) as Partial<PublicSubmissionError> & T
    if (!response.ok) {
        throw new JobSubmissionError(body.code ?? 'temporary', body.error ?? 'The job card service is temporarily unavailable.')
    }
    return body
}

export async function fetchPublicJobSubmission(token: string): Promise<PublicJobSubmissionDetails> {
    const response = await fetch(`/api/jobsubmission?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
    })
    return readResponse<PublicJobSubmissionDetails>(response)
}

export async function submitPublicJobCard(token: string, submission: JobCardSubmissionInput): Promise<void> {
    const response = await fetch('/api/jobsubmission', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...submission }),
    })
    await readResponse<{ submitted: true }>(response)
}
