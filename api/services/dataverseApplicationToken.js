function dataverseOrigin() {
    try {
        const url = new URL((process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim())
        return url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

async function getDataverseApplicationToken(options = {}) {
    const tenantId = (process.env.DATAVERSE_TENANT_ID || '').trim()
    const clientId = (process.env.DATAVERSE_CLIENT_ID || '').trim()
    const clientSecret = (process.env.DATAVERSE_CLIENT_SECRET || '').trim()
    const origin = dataverseOrigin()
    if (!tenantId || !clientId || !clientSecret || !origin) throw new Error('Server identity is unavailable.')

    const response = await (options.fetchImpl || fetch)(
        `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                scope: `${origin}/.default`,
            }),
        },
    )
    if (!response.ok) throw new Error('Server identity could not be authenticated.')
    const body = await response.json()
    if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('Server identity response was invalid.')
    return body.access_token
}

module.exports = { dataverseOrigin, getDataverseApplicationToken }
