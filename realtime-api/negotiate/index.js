const { bearerToken, corsHeaders } = require('../services/realtimeSecurity')

module.exports = async function negotiate(context, request, connectionInfo) {
    const headers = corsHeaders(request)
    if (request.method?.toUpperCase() === 'OPTIONS') {
        context.res = { status: 204, headers }
        return
    }

    const token = bearerToken(request)
    const origin = String(process.env.DATAVERSE_URL || '').replace(/\/$/, '')
    if (!token || !origin) {
        context.res = { status: 401, headers, body: { error: 'Realtime authentication failed.' } }
        return
    }

    try {
        const identity = await fetch(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
        if (!identity.ok) {
            context.res = { status: 401, headers, body: { error: 'Realtime authentication failed.' } }
            return
        }
        context.res = { status: 200, headers, body: connectionInfo }
    } catch {
        context.res = { status: 503, headers, body: { error: 'Realtime connection is unavailable.' } }
    }
}
