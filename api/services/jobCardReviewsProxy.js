const { SHARED_JOB_CARD_ORIGIN, usesSharedBackend } = require('./jobSubmissionProxy')

const GUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const ALLOWED_QUERY_KEYS = new Set(['jobId', 'view', 'offset', 'limit', 'returns', 'paging', 'cursor', 'jobNumber'])

function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return typeof entry?.[1] === 'string' ? entry[1].trim() : ''
}

function failure() {
    return {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ error: 'The Job Card review service is temporarily unavailable.' }),
    }
}

function targetUrl(request) {
    const reviewId = typeof request.params?.reviewId === 'string' ? request.params.reviewId.trim() : ''
    const photoId = typeof request.params?.photoId === 'string' ? request.params.photoId.trim() : ''
    if ((reviewId && !GUID_PATTERN.test(reviewId)) || (photoId && !GUID_PATTERN.test(photoId)) || (photoId && !reviewId)) return ''
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(request.query || {})) {
        if (!ALLOWED_QUERY_KEYS.has(key) || typeof value !== 'string') return ''
        query.set(key, value)
    }
    const path = `/api/jobcardreviews${reviewId ? `/${reviewId}` : ''}${photoId ? `/${photoId}` : ''}`
    return `${SHARED_JOB_CARD_ORIGIN}${path}${query.size ? `?${query}` : ''}`
}

async function proxyJobCardReviews(request, fetchImpl = fetch) {
    const method = String(request.method || '').toUpperCase()
    if (!['GET', 'POST'].includes(method)) return null
    const target = targetUrl(request)
    if (!target) return {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ error: 'The Job Card review request is invalid.' }),
    }
    const dataverseAuthorization = requestHeader(request, 'x-dataverse-authorization')
    const headers = { Accept: '*/*' }
    if (method === 'POST') headers['Content-Type'] = 'application/json'
    if (/^Bearer\s+\S+$/i.test(dataverseAuthorization)) headers['X-Dataverse-Authorization'] = dataverseAuthorization
    try {
        const response = await fetchImpl(target, {
            method,
            headers,
            redirect: 'error',
            signal: AbortSignal.timeout(30_000),
            ...(method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}),
        })
        const declaredLength = Number(response.headers.get('Content-Length') || 0)
        if (declaredLength > MAX_RESPONSE_BYTES) return failure()
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.length > MAX_RESPONSE_BYTES) return failure()
        const responseHeaders = {
            'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'X-Job-Card-Backend': 'shared-v1',
        }
        const disposition = response.headers.get('Content-Disposition')
        if (disposition) responseHeaders['Content-Disposition'] = disposition
        if (response.headers.get('X-Content-Type-Options') === 'nosniff') responseHeaders['X-Content-Type-Options'] = 'nosniff'
        return { status: response.status, headers: responseHeaders, body: bytes }
    } catch {
        return failure()
    }
}

module.exports = { proxyJobCardReviews, targetUrl, usesSharedBackend }
