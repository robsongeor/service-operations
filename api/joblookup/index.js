const LIFTTRUCKS_API_ORIGIN = 'https://webview.liftrucks.co.nz'
const LIFTTRUCKS_API_KEY = '500256'
const LIFTTRUCKS_TIMEOUT_MS = 15_000

function jsonResponse(status, body, headers = {}) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Job-Lookup-Source': 'internal-proxy',
            ...headers,
        },
        body: JSON.stringify(body),
    }
}

function requestHeader(request, name) {
    if (!request.headers) return ''
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers).find(([header]) => header.toLowerCase() === target)
    return typeof entry?.[1] === 'string' ? entry[1].trim() : ''
}

function dataverseOrigin() {
    const configured = (process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim()
    if (!configured) return ''
    try {
        const url = new URL(configured)
        if (url.protocol !== 'https:') return ''
        return url.origin
    } catch {
        return ''
    }
}

async function validateAuthenticatedUser(request) {
    const authorization = requestHeader(request, 'authorization')
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
        return {
            error: jsonResponse(401, { error: 'Authentication is required.' }, {
                'WWW-Authenticate': 'Bearer',
            }),
        }
    }

    const origin = dataverseOrigin()
    if (!origin) {
        return {
            error: jsonResponse(500, { error: 'Authentication validation is not configured.' }),
        }
    }

    let identityResponse
    try {
        identityResponse = await fetch(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: {
                Authorization: authorization,
                Accept: 'application/json',
            },
        })
    } catch {
        return {
            error: jsonResponse(503, { error: 'Authentication could not be validated.' }),
        }
    }

    if (!identityResponse.ok) {
        const status = identityResponse.status === 401 || identityResponse.status === 403 ? 401 : 503
        return {
            error: jsonResponse(status, {
                error: status === 401
                    ? 'The authenticated session is invalid or expired.'
                    : 'Authentication could not be validated.',
            }, status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
        }
    }

    try {
        const identity = await identityResponse.json()
        if (typeof identity.UserId !== 'string' || !identity.UserId) {
            return { error: jsonResponse(401, { error: 'The authenticated identity is invalid.' }) }
        }
    } catch {
        return { error: jsonResponse(503, { error: 'Authentication could not be validated.' }) }
    }

    return { authorization }
}

module.exports = async function jobLookup(context, request) {
    if (request.method !== 'GET') {
        context.res = jsonResponse(405, { error: 'Method not allowed.', source: 'internal-proxy' })
        context.res.headers.Allow = 'GET'
        return
    }

    const authentication = await validateAuthenticatedUser(request)
    if (authentication.error) {
        context.res = authentication.error
        return
    }

    const jobNumber = typeof request.query.jobNumber === 'string' ? request.query.jobNumber.trim() : ''
    if (!jobNumber) {
        context.res = jsonResponse(400, { error: 'Job Number is required.', source: 'internal-proxy' })
        return
    }
    if (jobNumber.length > 100 || !/^[A-Za-z0-9._-]+$/.test(jobNumber)) {
        context.res = jsonResponse(400, { error: 'Job Number is invalid.', source: 'internal-proxy' })
        return
    }

    const username = process.env.LIFTTRUCKS_API_USERNAME
    const password = process.env.LIFTTRUCKS_API_PASSWORD
    if (!username || !password) {
        context.res = jsonResponse(500, {
            error: 'Lift Trucks API credentials are not configured on the server.',
            source: 'internal-proxy',
        })
        return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LIFTTRUCKS_TIMEOUT_MS)

    try {
        const upstreamUrl = new URL(`/api/01/JCJob/${encodeURIComponent(jobNumber)}`, LIFTTRUCKS_API_ORIGIN)
        upstreamUrl.searchParams.set('page', '1')
        upstreamUrl.searchParams.set('pageSize', '50')
        upstreamUrl.searchParams.set('ApiKey', LIFTTRUCKS_API_KEY)

        const upstreamResponse = await fetch(upstreamUrl, {
            headers: {
                Accept: 'application/json',
                Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
            },
            signal: controller.signal,
        })

        if (!upstreamResponse.ok) {
            context.res = jsonResponse(502, {
                error: 'The Lift Trucks API could not complete the request.',
                source: 'upstream-service',
            })
            return
        }

        const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer())
        context.res = {
            status: 200,
            headers: {
                'Content-Type': upstreamResponse.headers.get('content-type') || 'application/octet-stream',
                'X-Job-Lookup-Source': 'upstream-service',
            },
            isRaw: true,
            body: upstreamBody,
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            context.res = jsonResponse(504, {
                error: 'The Lift Trucks API request timed out.',
                source: 'internal-proxy',
            })
        } else {
            context.res = jsonResponse(502, {
                error: 'The Lift Trucks API could not be reached.',
                source: 'internal-proxy',
            })
        }
    } finally {
        clearTimeout(timeout)
    }
}

module.exports._test = {
    dataverseOrigin,
    requestHeader,
    validateAuthenticatedUser,
}
