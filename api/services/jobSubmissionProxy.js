const SHARED_JOB_CARD_ORIGIN = 'https://yellow-cliff-068680700.7.azurestaticapps.net'
const SHARED_BACKEND_HEADER = 'x-job-card-shared-backend'
const SHARED_BACKEND_VALUE = 'v1-production'
const MAX_RESPONSE_BYTES = 1024 * 1024

function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return typeof entry?.[1] === 'string' ? entry[1].trim() : ''
}

function usesSharedBackend(request) {
    return requestHeader(request, SHARED_BACKEND_HEADER) === SHARED_BACKEND_VALUE
}

function failure() {
    return {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
        body: JSON.stringify({ code: 'temporary', error: 'The job card service is temporarily unavailable.' }),
    }
}

async function proxyJobSubmission(request, fetchImpl = fetch) {
    const method = String(request.method || '').toUpperCase()
    if (!['GET', 'POST'].includes(method)) return null
    const token = method === 'GET' && typeof request.query?.token === 'string' ? request.query.token : ''
    const target = `${SHARED_JOB_CARD_ORIGIN}/api/jobsubmission${token ? `?token=${encodeURIComponent(token)}` : ''}`
    const dataverseAuthorization = requestHeader(request, 'x-dataverse-authorization')
    const headers = { Accept: 'application/json' }
    if (method === 'POST') headers['Content-Type'] = 'application/json'
    if (/^Bearer\s+\S+$/i.test(dataverseAuthorization)) headers['X-Dataverse-Authorization'] = dataverseAuthorization
    let response
    try {
        response = await fetchImpl(target, {
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
        return {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
                'Cache-Control': 'private, no-store',
                'X-Job-Card-Backend': 'shared-v1',
            },
            body: bytes,
        }
    } catch {
        return failure()
    }
}

module.exports = { proxyJobSubmission, usesSharedBackend, SHARED_JOB_CARD_ORIGIN }
