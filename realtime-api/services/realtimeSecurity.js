function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1]
}

function bearerToken(request) {
    const authorization = String(requestHeader(request, 'authorization') || '')
    return authorization.match(/^Bearer\s+(.+)$/i)?.[1] || ''
}

function allowedOrigins() {
    return [process.env.APP_ORIGIN, process.env.APP_ORIGINS]
        .filter(Boolean)
        .flatMap((value) => String(value).split(','))
        .map((value) => value.trim().replace(/\/$/, ''))
        .filter(Boolean)
}

function corsHeaders(request) {
    const requestOrigin = String(requestHeader(request, 'origin') || '').replace(/\/$/, '')
    if (!requestOrigin || !allowedOrigins().includes(requestOrigin)) return {}
    return {
        'Access-Control-Allow-Origin': requestOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'authorization,content-type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        Vary: 'Origin',
    }
}

module.exports = { allowedOrigins, bearerToken, corsHeaders, requestHeader }
