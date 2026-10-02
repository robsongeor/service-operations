import type { JobCardReview, JobCardReviewSummary } from './jobCardReview.types'

async function readJson<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => ({})) as T & { error?: string }
    if (!response.ok) throw new Error(body.error || 'The Job Card review service is unavailable.')
    return body
}

function headers(accessToken: string) {
    return { 'X-Dataverse-Authorization': `Bearer ${accessToken}`, Accept: 'application/json' }
}

export async function fetchPendingJobCardReviews(accessToken: string) {
    const response = await fetch('/api/jobcardreviews', { cache: 'no-store', headers: headers(accessToken) })
    return (await readJson<{ items: JobCardReviewSummary[] }>(response)).items
}

export async function fetchJobCardReview(accessToken: string, reviewId: string) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}`, { cache: 'no-store', headers: headers(accessToken) })
    return readJson<JobCardReview>(response)
}

export async function markJobCardReviewed(accessToken: string, reviewId: string, etag: string) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}`, {
        method: 'POST', headers: { ...headers(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'markReviewed', etag }),
    })
    return readJson<JobCardReview>(response)
}

export async function fetchJobCardPhoto(accessToken: string, reviewId: string, photoId: string) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}/${encodeURIComponent(photoId)}`, { cache: 'no-store', headers: headers(accessToken) })
    if (!response.ok) throw new Error('The photo could not be loaded.')
    return URL.createObjectURL(await response.blob())
}

export async function retryJobCardNotification(accessToken: string, reviewId: string) {
    const response = await fetch(`/api/jobcardreviews/${encodeURIComponent(reviewId)}`, {
        method: 'POST', headers: { ...headers(accessToken), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retryNotification' }),
    })
    return readJson<JobCardReview>(response)
}
