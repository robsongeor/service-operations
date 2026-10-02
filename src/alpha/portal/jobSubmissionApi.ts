import type { JobCardSubmissionInput, PublicJobSubmissionDetails, PublicSubmissionError } from './jobSubmission.types'

const uploadedPhotoIds = new Map<string, string>()

function photoCacheKey(token: string, photo: JobCardSubmissionInput['photos'][number]) {
    return [token, photo.fileName, photo.mimeType, photo.size, photo.data.length, photo.data.slice(0, 64), photo.data.slice(-64)].join('|')
}

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
    const photos: { uploadId: string }[] = []
    for (const photo of submission.photos) {
        const cacheKey = photoCacheKey(token, photo)
        const existingUploadId = uploadedPhotoIds.get(cacheKey)
        if (existingUploadId) {
            photos.push({ uploadId: existingUploadId })
            continue
        }
        const uploadResponse = await fetch('/api/jobsubmission', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, action: 'uploadPhoto', photo }),
        })
        const uploaded = await readResponse<{ uploadId: string }>(uploadResponse)
        uploadedPhotoIds.set(cacheKey, uploaded.uploadId)
        photos.push(uploaded)
    }
    const response = await fetch('/api/jobsubmission', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...submission, photos }),
    })
    await readResponse<{ submitted: true }>(response)
    submission.photos.forEach((photo) => uploadedPhotoIds.delete(photoCacheKey(token, photo)))
}
