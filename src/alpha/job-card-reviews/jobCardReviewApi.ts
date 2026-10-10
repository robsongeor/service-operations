import type { JobCardHistory, JobCardOfficeAction, JobCardRequestSummary, JobCardReview, JobCardReviewQueue, JobCardReviewApiView, JobCardMeterApprovalInput } from './jobCardReview.types'

export class JobCardReviewApiError extends Error {
    readonly status: number
    readonly code?: string

    constructor(message: string, status: number, code?: string) {
        super(message)
        this.status = status
        this.code = code
    }
}

async function readJson<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({})) as T & { error?: string; code?: string }
    if (!response.ok) throw new JobCardReviewApiError(body.error || 'The Job Card review service is unavailable.', response.status, body.code)
    return body
}

function headers(accessToken: string) {
    return {
        'X-Dataverse-Authorization': `Bearer ${accessToken}`,
        ...(import.meta.env?.VITE_JOB_CARD_SHARED_BACKEND === 'v1-production'
            ? { 'X-Job-Card-Shared-Backend': 'v1-production' }
            : {}),
        Accept: 'application/json',
    }
}

export async function fetchPendingJobCardReviews(accessToken: string) {
    return fetchJobCardReviews(accessToken, 'active')
}

export const JOB_CARD_CURSOR_QUEUE_ENABLED = import.meta.env?.VITE_JOB_CARD_CURSOR_QUEUE_ENABLED === 'true'
export async function fetchJobCardReviews(accessToken: string, view: JobCardReviewApiView, offset = 0, limit = 100, cursor?: string, jobNumber = '') {
    const query = JOB_CARD_CURSOR_QUEUE_ENABLED && view !== 'open'
        ? `?${new URLSearchParams({ view, paging: 'cursor', limit: String(limit), ...(cursor ? { cursor } : {}), ...(jobNumber ? { jobNumber } : {}) })}`
        : view === 'active' && offset === 0 && limit === 100 ? '' : `?${new URLSearchParams({ view, offset: String(offset), limit: String(limit) })}`
    const response = await fetch(`/api/jobcardreviews${query}`, { cache: 'no-store', headers: headers(accessToken) })
    return readJson<JobCardReviewQueue>(response)
}

export async function fetchJobCardHistory(accessToken: string, jobId: string) {
    const response = await fetch(`/api/jobcardreviews?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store', headers: headers(accessToken) })
    return readJson<JobCardHistory>(response)
}

export type TechnicianReturn = { assignmentId: string; technicianId: string; name: string; state: 'notSent' | 'withdrawn' | 'received' | 'expired' | 'awaiting' }
export async function fetchJobCardExpectedReturns(accessToken: string, jobId: string) {
    const response = await fetch(`/api/jobcardreviews?${new URLSearchParams({ jobId, returns: '1' })}`, { cache: 'no-store', headers: headers(accessToken) })
    return readJson<{ items: TechnicianReturn[] }>(response)
}

export async function withdrawJobCard(accessToken: string, reviewId: string, etag: string, reason: string) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}`, {
        method: 'POST', headers: { ...headers(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw', etag, reason }),
    })
    return readJson<JobCardRequestSummary>(response)
}

export async function fetchJobCardReview(accessToken: string, reviewId: string) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}`, { cache: 'no-store', headers: headers(accessToken) })
    return readJson<JobCardReview>(response)
}

export async function updateJobCardOfficeReview(accessToken: string, reviewId: string, payload: { action: JobCardOfficeAction | 'retryMeterSync'; etag: string; note?: string; greentreeReference?: string; meterApproval?: JobCardMeterApprovalInput }) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}`, {
        method: 'POST', headers: { ...headers(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    return readJson<JobCardReview>(response)
}

export async function fetchJobCardPhoto(accessToken: string, reviewId: string, photoId: string) {
    return URL.createObjectURL(await fetchJobCardPhotoBlob(accessToken, reviewId, photoId))
}

export async function fetchJobCardPhotoBlob(accessToken: string, reviewId: string, photoId: string, signal?: AbortSignal) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}/${encodeURIComponent(photoId)}`, { cache: 'no-store', headers: headers(accessToken), signal })
    if (!response.ok) throw new Error('The photo could not be loaded.')
    return response.blob()
}

export async function retryJobCardNotification(accessToken: string, reviewId: string) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}`, {
        method: 'POST', headers: { ...headers(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retryNotification' }),
    })
    return readJson<JobCardReview>(response)
}
