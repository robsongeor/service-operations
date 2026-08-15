const GEOAPIFY_ORIGIN = 'https://api.geoapify.com'
const GEOAPIFY_TIMEOUT_MS = 10_000
const MAXIMUM_LOCATIONS = 200
const MAXIMUM_ADDRESS_LENGTH = 500
const PROVIDER_REQUEST_INTERVAL_MS = 250
const MAXIMUM_CACHE_ENTRIES = 2_000
const MAXIMUM_AUTOCOMPLETE_RESULTS = 6
const MAXIMUM_DATAVERSE_WRITE_CONCURRENCY = 4
const cache = new Map()
const DATAVERSE_SITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isDataverseSiteId(value) {
    return typeof value === 'string' && DATAVERSE_SITE_ID.test(value)
}

function jsonResponse(status, body, headers = {}) {
    return {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
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
        return url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

async function validateAuthenticatedUser(request) {
    // Azure Static Web Apps reserves the standard Authorization header for its
    // platform authentication. Use a dedicated header for the delegated
    // Dataverse token, while retaining the standard header for local/tests.
    const authorization = requestHeader(request, 'x-dataverse-authorization')
        || requestHeader(request, 'authorization')
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
        return { error: jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' }) }
    }
    const origin = dataverseOrigin()
    if (!origin) return { error: jsonResponse(500, { error: 'Authentication validation is not configured.' }) }
    try {
        const response = await fetch(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: { Authorization: authorization, Accept: 'application/json' },
        })
        if (!response.ok) {
            const status = response.status === 401 || response.status === 403 ? 401 : 503
            return { error: jsonResponse(status, {
                error: status === 401
                    ? 'The authenticated session is invalid or expired.'
                    : 'Authentication could not be validated.',
            }, status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) }
        }
        const identity = await response.json()
        if (typeof identity.UserId !== 'string' || !identity.UserId) {
            return { error: jsonResponse(401, { error: 'The authenticated identity is invalid.' }) }
        }
    } catch {
        return { error: jsonResponse(503, { error: 'Authentication could not be validated.' }) }
    }
    return { authorization }
}

function normalizeLocations(body) {
    if (!body || !Array.isArray(body.locations) || body.locations.length > MAXIMUM_LOCATIONS) return null
    const seen = new Set()
    const locations = []
    for (const value of body.locations) {
        const siteId = typeof value?.siteId === 'string' ? value.siteId.trim() : ''
        const address = typeof value?.address === 'string' ? value.address.trim().replace(/\s+/g, ' ') : ''
        if (!siteId || siteId.length > 100 || !address || address.length > MAXIMUM_ADDRESS_LENGTH || seen.has(siteId)) return null
        seen.add(siteId)
        locations.push({ siteId, address })
    }
    return locations
}

function coordinateFromGeoapify(value) {
    if (!value || typeof value !== 'object') return null
    const latitude = value.lat
    const longitude = value.lon
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null
    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
    return {
        latitude,
        longitude,
        formattedAddress: typeof value.formatted === 'string' ? value.formatted.slice(0, 500) : '',
    }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function geocodeAddress(address, apiKey) {
    const cacheKey = address.toLocaleLowerCase('en-NZ')
    if (cache.has(cacheKey)) return cache.get(cacheKey)
    const url = new URL('/v1/geocode/search', GEOAPIFY_ORIGIN)
    url.searchParams.set('text', address)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('filter', 'countrycode:nz')
    url.searchParams.set('apiKey', apiKey)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS)
    try {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
        if (!response.ok) throw new Error('upstream')
        const body = await response.json()
        const coordinate = coordinateFromGeoapify(Array.isArray(body?.results) ? body.results[0] : null)
        cache.set(cacheKey, coordinate)
        if (cache.size > MAXIMUM_CACHE_ENTRIES) cache.delete(cache.keys().next().value)
        return coordinate
    } finally {
        clearTimeout(timeout)
    }
}

async function geocodeAddressWithRetry(address, apiKey) {
    let lastError
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            return await geocodeAddress(address, apiKey)
        } catch (error) {
            lastError = error
            if (attempt === 0) await wait(500)
        }
    }
    throw lastError
}

function normalizeAddressQuery(body) {
    if (!body || typeof body.query !== 'string') return ''
    const query = body.query.trim().replace(/\s+/g, ' ')
    return query.length >= 3 && query.length <= 200 ? query : ''
}

function addressSuggestionFromGeoapify(value) {
    if (!value || typeof value !== 'object' || typeof value.formatted !== 'string') return null
    const formattedAddress = value.formatted.trim().slice(0, 500)
    if (!formattedAddress) return null
    const latitude = value.lat
    const longitude = value.lon
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null
    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
    const siteName = ['suburb', 'quarter', 'neighbourhood', 'hamlet', 'village', 'town', 'city', 'municipality', 'county']
        .map((field) => typeof value[field] === 'string' ? value[field].trim() : '')
        .find(Boolean) || ''
    return {
        id: typeof value.place_id === 'string' && value.place_id ? value.place_id.slice(0, 200) : `${latitude},${longitude}:${formattedAddress}`,
        formattedAddress,
        addressLine1: typeof value.address_line1 === 'string' ? value.address_line1.trim().slice(0, 250) : '',
        addressLine2: typeof value.address_line2 === 'string' ? value.address_line2.trim().slice(0, 250) : '',
        siteName: siteName.slice(0, 200),
        latitude,
        longitude,
    }
}

async function searchAddresses(request) {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' })
    const authentication = await validateAuthenticatedUser(request)
    if (authentication.error) return authentication.error
    const query = normalizeAddressQuery(request.body)
    if (!query) return jsonResponse(400, { error: 'Enter at least three characters of an address.' })
    const apiKey = (process.env.GEOAPIFY_API_KEY || '').trim()
    if (!apiKey) return jsonResponse(503, { error: 'Address verification is not configured.' })

    const url = new URL('/v1/geocode/autocomplete', GEOAPIFY_ORIGIN)
    url.searchParams.set('text', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', String(MAXIMUM_AUTOCOMPLETE_RESULTS))
    url.searchParams.set('filter', 'countrycode:nz')
    url.searchParams.set('lang', 'en')
    url.searchParams.set('apiKey', apiKey)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS)
    try {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
        if (!response.ok) return jsonResponse(503, { error: 'The address provider is temporarily unavailable.' })
        const body = await response.json()
        const suggestions = (Array.isArray(body?.results) ? body.results : [])
            .map(addressSuggestionFromGeoapify)
            .filter(Boolean)
        return jsonResponse(200, { suggestions })
    } catch {
        return jsonResponse(503, { error: 'The address provider is temporarily unavailable.' })
    } finally {
        clearTimeout(timeout)
    }
}

async function resolveLocations(locations, resolveCoordinate) {
    return Promise.all(locations.map(async (location) => {
        try {
            const coordinate = await resolveCoordinate(location)
            return {
                siteId: location.siteId,
                address: location.address,
                coordinate,
                status: coordinate ? 'matched' : 'not_found',
            }
        } catch {
            return {
                siteId: location.siteId,
                address: location.address,
                coordinate: null,
                status: 'provider_failed',
            }
        }
    }))
}

function geocodePersistencePayload(result, resolvedOn) {
    return {
        gr_geocodelatitude: result.coordinate?.latitude ?? null,
        gr_geocodelongitude: result.coordinate?.longitude ?? null,
        gr_geocodesourceaddress: result.address,
        gr_geocodeformattedaddress: result.coordinate?.formattedAddress || null,
        gr_geocoderesolvedon: resolvedOn,
    }
}

async function persistResolvedLocations(results, authorization) {
    const persistable = results.filter((result) =>
        result.status !== 'provider_failed' && isDataverseSiteId(result.siteId),
    )
    const origin = dataverseOrigin()
    if (!origin || !persistable.length) return false

    const resolvedOn = new Date().toISOString()
    let nextIndex = 0
    let allSucceeded = true
    const worker = async () => {
        while (nextIndex < persistable.length) {
            const result = persistable[nextIndex]
            nextIndex += 1
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS)
            try {
                const response = await fetch(`${origin}/api/data/v9.2/gr_sites(${result.siteId})`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: authorization,
                        Accept: 'application/json',
                        'Content-Type': 'application/json; charset=utf-8',
                        'If-Match': '*',
                    },
                    body: JSON.stringify(geocodePersistencePayload(result, resolvedOn)),
                    signal: controller.signal,
                })
                if (!response.ok) allSucceeded = false
            } catch {
                allSucceeded = false
            } finally {
                clearTimeout(timeout)
            }
        }
    }
    await Promise.all(Array.from(
        { length: Math.min(MAXIMUM_DATAVERSE_WRITE_CONCURRENCY, persistable.length) },
        () => worker(),
    ))
    return allSucceeded
}

async function geocode(request) {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' })
    const authentication = await validateAuthenticatedUser(request)
    if (authentication.error) return authentication.error
    const locations = normalizeLocations(request.body)
    if (!locations) return jsonResponse(400, { error: 'The location request is invalid.' })
    const apiKey = (process.env.GEOAPIFY_API_KEY || '').trim()
    if (!apiKey) return jsonResponse(503, { error: 'Equipment map geocoding is not configured.' })

    let providerRequestIndex = 0
    const results = await resolveLocations(locations, async (location) => {
            const cached = cache.has(location.address.toLocaleLowerCase('en-NZ'))
            if (!cached) {
                const delay = providerRequestIndex * PROVIDER_REQUEST_INTERVAL_MS
                providerRequestIndex += 1
                if (delay) await wait(delay)
            }
            return geocodeAddressWithRetry(location.address, apiKey)
        })
    await persistResolvedLocations(results, authentication.authorization)
    return jsonResponse(200, { results })
}

module.exports = {
    geocode,
    searchAddresses,
    jsonResponse,
    test: { addressSuggestionFromGeoapify, coordinateFromGeoapify, dataverseOrigin, geocodePersistencePayload, isDataverseSiteId, normalizeAddressQuery, normalizeLocations, requestHeader, resolveLocations },
}
