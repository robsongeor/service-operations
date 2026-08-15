function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1]
}

function bearerToken(request) {
    const authorization = String(requestHeader(request, 'authorization') || '')
    return authorization.match(/^Bearer\s+(.+)$/i)?.[1] || ''
}

function corsHeaders(request) {
    const configuredOrigin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '')
    const requestOrigin = String(requestHeader(request, 'origin') || '').replace(/\/$/, '')
    if (!configuredOrigin || requestOrigin !== configuredOrigin) return {}
    return {
        'Access-Control-Allow-Origin': configuredOrigin,
        'Access-Control-Allow-Headers': 'authorization,content-type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        Vary: 'Origin',
    }
}

module.exports = { bearerToken, corsHeaders, requestHeader }
