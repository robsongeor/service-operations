const LIFTTRUCKS_API_ORIGIN = 'https://webview.liftrucks.co.nz'
const LIFTTRUCKS_API_KEY = '500256'
const LIFTTRUCKS_TIMEOUT_MS = 15_000

function jsonResponse(status, body) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Job-Lookup-Source': 'internal-proxy',
        },
        body: JSON.stringify(body),
    }
}

module.exports = async function jobLookup(context, request) {
    if (request.method !== 'GET') {
        context.res = jsonResponse(405, { error: 'Method not allowed.', source: 'internal-proxy' })
        context.res.headers.Allow = 'GET'
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
        const upstreamBody = Buffer.from(await upstreamResponse.arrayBuffer())

        context.res = {
            status: upstreamResponse.status,
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
                detail: error instanceof Error ? error.message : String(error),
                source: 'internal-proxy',
            })
        }
    } finally {
        clearTimeout(timeout)
    }
}
