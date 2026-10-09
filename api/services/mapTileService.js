const GEOAPIFY_TILE_ORIGIN = 'https://maps.geoapify.com'
const GEOAPIFY_TILE_STYLE = 'osm-bright'
const TILE_TIMEOUT_MS = 10_000
const MAX_ZOOM = 20
const MAX_TILE_BYTES = 1024 * 1024

function textResponse(status, message, headers = {}) {
    return {
        status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
        body: message,
    }
}

function normalizedCoordinates(params) {
    const values = ['z', 'x', 'y'].map((name) => {
        const value = params?.[name]
        return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
    })
    const [z, x, y] = values
    if (!Number.isSafeInteger(z) || z < 0 || z > MAX_ZOOM) return null
    const maximumCoordinate = (2 ** z) - 1
    if (!Number.isSafeInteger(x) || x < 0 || x > maximumCoordinate) return null
    if (!Number.isSafeInteger(y) || y < 0 || y > maximumCoordinate) return null
    return { z, x, y }
}

async function getTile(request) {
    if (request.method !== 'GET') return textResponse(405, 'Method not allowed.', { Allow: 'GET' })
    const coordinates = normalizedCoordinates(request.params)
    if (!coordinates) return textResponse(400, 'Invalid map tile coordinates.')
    const apiKey = (process.env.GEOAPIFY_API_KEY || '').trim()
    if (!apiKey) return textResponse(503, 'Map tiles are not configured.')

    const { z, x, y } = coordinates
    const url = new URL(`/v1/tile/${GEOAPIFY_TILE_STYLE}/${z}/${x}/${y}.png`, GEOAPIFY_TILE_ORIGIN)
    url.searchParams.set('apiKey', apiKey)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TILE_TIMEOUT_MS)
    try {
        const response = await fetch(url, {
            headers: { Accept: 'image/png' },
            signal: controller.signal,
        })
        if (!response.ok) return textResponse(502, 'The map tile provider could not complete the request.')
        const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
        if (contentType !== 'image/png') return textResponse(502, 'The map tile provider returned an invalid response.')
        const body = Buffer.from(await response.arrayBuffer())
        if (!body.length || body.length > MAX_TILE_BYTES) return textResponse(502, 'The map tile provider returned an invalid response.')
        return {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                'X-Content-Type-Options': 'nosniff',
            },
            body,
        }
    } catch (error) {
        return textResponse(error?.name === 'AbortError' ? 504 : 502, 'The map tile provider is temporarily unavailable.')
    } finally {
        clearTimeout(timeout)
    }
}

module.exports = { getTile, test: { normalizedCoordinates } }
