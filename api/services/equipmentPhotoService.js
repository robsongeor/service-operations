const MAXIMUM_PHOTO_BYTES = 8 * 1024 * 1024
const MAXIMUM_QUERY_LENGTH = 100
const DATAVERSE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLIENT_UPLOAD_ID = /^[0-9a-z-]{8,80}$/i
const GRAPH_ORIGIN = 'https://graph.microsoft.com'
const GRAPH_TIMEOUT_MS = 30_000
const acceptedTypes = new Map([
    ['image/jpeg', { extension: 'jpg', signature: (value) => value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff }],
    ['image/png', { extension: 'png', signature: (value) => value.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }],
    ['image/webp', { extension: 'webp', signature: (value) => value.subarray(0, 4).toString() === 'RIFF' && value.subarray(8, 12).toString() === 'WEBP' }],
    ['image/heic', { extension: 'heic', signature: isHeifImage }],
    ['image/heif', { extension: 'heif', signature: isHeifImage }],
])

let graphTokenCache = null
let driveCache = null

function jsonResponse(status, body, headers = {}) {
    return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(body) }
}

function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([header]) => header.toLowerCase() === target)
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

async function authenticate(request) {
    const authorization = requestHeader(request, 'x-dataverse-authorization') || requestHeader(request, 'authorization')
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
        return { error: jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' }) }
    }
    const origin = dataverseOrigin()
    if (!origin) return { error: jsonResponse(500, { error: 'Authentication validation is not configured.' }) }
    try {
        const response = await fetch(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: { Authorization: authorization, Accept: 'application/json' },
            signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) {
            const status = response.status === 401 || response.status === 403 ? 401 : 503
            return { error: jsonResponse(status, { error: status === 401 ? 'The authenticated session is invalid or expired.' : 'Authentication could not be validated.' }) }
        }
        const identity = await response.json()
        if (typeof identity.UserId !== 'string' || !DATAVERSE_ID.test(identity.UserId)) {
            return { error: jsonResponse(401, { error: 'The authenticated identity is invalid.' }) }
        }
        return { authorization, origin, userId: identity.UserId }
    } catch {
        return { error: jsonResponse(503, { error: 'Authentication could not be validated.' }) }
    }
}

function jobProjection() {
    return '$select=gr_jobid,gr_jobnumber,gr_description,createdon,_gr_site_value,_gr_equipment_value&$expand=gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Equipment($select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model)'
}

function jobView(job) {
    const equipment = job.gr_Equipment || {}
    const equipmentName = [equipment.gr_fleet || equipment.gr_serial, equipment.gr_make, equipment.gr_model].filter(Boolean).join(' - ')
    return {
        id: job.gr_jobid,
        jobNumber: job.gr_jobnumber || 'Unnumbered Job',
        description: job.gr_description || '',
        createdOn: job.createdon || '',
        customerName: job.gr_Site?.gr_Customer?.gr_name || 'Customer not recorded',
        siteName: job.gr_Site?.gr_name || 'Site not recorded',
        equipmentName: equipmentName || 'Equipment not recorded',
    }
}

async function dataverseJson(url, authorization) {
    const response = await fetch(url, {
        cache: 'no-store',
        headers: { Authorization: authorization, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(response.status === 403 ? 'forbidden' : 'dataverse')
    return response.json()
}

async function searchJobs(request) {
    if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' })
    const authentication = await authenticate(request)
    if (authentication.error) return authentication.error
    const query = typeof request.query?.query === 'string' ? request.query.query.trim().replace(/\s+/g, ' ') : ''
    if (query.length > MAXIMUM_QUERY_LENGTH) return jsonResponse(400, { error: 'The Job search is too long.' })
    const url = new URL(`${authentication.origin}/api/data/v9.2/gr_jobs`)
    const [select, expand] = jobProjection().split('&')
    url.searchParams.set('$select', select.slice('$select='.length))
    url.searchParams.set('$expand', expand.slice('$expand='.length))
    url.searchParams.set('$orderby', 'createdon desc')
    url.searchParams.set('$top', query ? '12' : '8')
    const requiredRelationships = '_gr_site_value ne null and _gr_equipment_value ne null'
    if (query) {
        const escaped = query.replace(/'/g, "''")
        url.searchParams.set('$filter', `${requiredRelationships} and (contains(gr_jobnumber,'${escaped}') or contains(gr_description,'${escaped}'))`)
    } else {
        url.searchParams.set('$filter', requiredRelationships)
    }
    try {
        const body = await dataverseJson(url, authentication.authorization)
        return jsonResponse(200, {
            jobs: Array.isArray(body.value) ? body.value.map(jobView) : [],
            uploadsEnabled: process.env.EQUIPMENT_PHOTO_UPLOAD_ENABLED === 'true',
        })
    } catch (error) {
        return jsonResponse(error instanceof Error && error.message === 'forbidden' ? 403 : 503, {
            error: error instanceof Error && error.message === 'forbidden'
                ? 'You do not have permission to access Jobs for photo upload.'
                : 'Jobs could not be loaded for photo upload.',
        })
    }
}

async function authoritativeJob(authentication, jobId) {
    const url = `${authentication.origin}/api/data/v9.2/gr_jobs(${jobId})?${jobProjection()}`
    const job = await dataverseJson(url, authentication.authorization)
    if (!job.gr_jobnumber || !job.gr_Site?.gr_Customer?.gr_name || !job.gr_Site?.gr_name || !job.gr_Equipment?.gr_equipmentid) {
        throw new Error('incomplete-job')
    }
    return job
}

function isHeifImage(value) {
    if (value.length < 12 || value.subarray(4, 8).toString() !== 'ftyp') return false
    return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(value.subarray(8, 12).toString())
}

function parsePhoto(body) {
    if (!body || body.action !== 'upload' || !DATAVERSE_ID.test(body.jobId || '') || !CLIENT_UPLOAD_ID.test(body.clientUploadId || '')) return null
    if (typeof body.base64 !== 'string' || typeof body.contentType !== 'string' || typeof body.byteLength !== 'number') return null
    if (!Number.isInteger(body.byteLength) || body.byteLength < 1 || body.byteLength > MAXIMUM_PHOTO_BYTES) return null
    const type = body.contentType.toLowerCase()
    const accepted = acceptedTypes.get(type)
    if (!accepted || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)) return null
    const content = Buffer.from(body.base64, 'base64')
    if (content.length !== body.byteLength || content.length > MAXIMUM_PHOTO_BYTES || !accepted.signature(content)) return null
    const capturedAt = new Date(body.capturedAtUtc)
    if (!Number.isFinite(capturedAt.getTime()) || Math.abs(Date.now() - capturedAt.getTime()) > 31 * 24 * 60 * 60 * 1000) return null
    return { jobId: body.jobId, clientUploadId: body.clientUploadId, capturedAt, type, extension: accepted.extension, content }
}

function graphSettings() {
    const settings = {
        tenantId: (process.env.SHAREPOINT_TENANT_ID || process.env.DATAVERSE_TENANT_ID || '').trim(),
        clientId: (process.env.SHAREPOINT_CLIENT_ID || '').trim(),
        clientSecret: (process.env.SHAREPOINT_CLIENT_SECRET || '').trim(),
        hostname: (process.env.SHAREPOINT_HOSTNAME || 'liftrucksnz.sharepoint.com').trim(),
        sitePath: (process.env.SHAREPOINT_SITE_PATH || '/').trim(),
        libraryName: (process.env.SHAREPOINT_LIBRARY_NAME || 'Working Folder').trim(),
        rootFolder: (process.env.SHAREPOINT_ROOT_FOLDER || 'Workshop/Equipment Photo Storage').trim(),
    }
    if (!settings.tenantId || !settings.clientId || !settings.clientSecret || !settings.hostname || !settings.libraryName || !settings.rootFolder) return null
    return settings
}

async function graphToken(settings) {
    if (graphTokenCache?.expiresAt > Date.now() + 60_000) return graphTokenCache.token
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, scope: `${GRAPH_ORIGIN}/.default`, grant_type: 'client_credentials' }),
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error('graph-auth')
    const body = await response.json()
    if (typeof body.access_token !== 'string') throw new Error('graph-auth')
    graphTokenCache = { token: body.access_token, expiresAt: Date.now() + Math.max(300, Number(body.expires_in) || 3600) * 1000 }
    return graphTokenCache.token
}

async function graphRequest(token, path, options = {}) {
    const response = await fetch(`${GRAPH_ORIGIN}/v1.0${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.headers || {}) },
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    })
    if (options.allowNotFound && response.status === 404) return null
    if (!response.ok) throw new Error(response.status === 403 ? 'sharepoint-forbidden' : 'sharepoint')
    if (response.status === 204) return null
    return response.json()
}

function encodedPath(value) {
    return value.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

async function targetDrive(settings, token) {
    const cacheKey = `${settings.hostname}:${settings.sitePath}:${settings.libraryName}`
    if (driveCache?.key === cacheKey) return driveCache
    const siteEndpoint = settings.sitePath === '/' ? `/sites/${settings.hostname}` : `/sites/${settings.hostname}:${encodedPath(settings.sitePath)}`
    const site = await graphRequest(token, siteEndpoint)
    const drives = await graphRequest(token, `/sites/${encodeURIComponent(site.id)}/drives?$select=id,name,webUrl`)
    const drive = drives.value?.find((item) => item.name === settings.libraryName)
    if (!drive?.id) throw new Error('library')
    driveCache = { key: cacheKey, id: drive.id }
    return driveCache
}

function safeSegment(label, id) {
    const normalized = String(label || '').normalize('NFKC').replace(/[~"#%&*:<>?/\\{|}]+/g, '-').replace(/[. ]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!normalized) throw new Error('incomplete-job')
    return `${normalized} (${String(id).replace(/-/g, '').slice(0, 8)})`
}

async function ensureFolder(token, driveId, parent, name) {
    const existing = await graphRequest(token, `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parent.id)}:/${encodeURIComponent(name)}`, { allowNotFound: true })
    if (existing) return existing
    try {
        return await graphRequest(token, `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parent.id)}/children`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        })
    } catch {
        const concurrent = await graphRequest(token, `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parent.id)}:/${encodeURIComponent(name)}`, { allowNotFound: true })
        if (concurrent) return concurrent
        throw new Error('sharepoint')
    }
}

async function upload(request) {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' })
    if (process.env.EQUIPMENT_PHOTO_UPLOAD_ENABLED !== 'true') return jsonResponse(503, { error: 'Equipment photo uploads are not enabled.' })
    const authentication = await authenticate(request)
    if (authentication.error) return authentication.error
    const photo = parsePhoto(request.body)
    if (!photo) return jsonResponse(400, { error: 'The photo upload request is invalid or exceeds the 8 MB limit.' })
    const settings = graphSettings()
    if (!settings) return jsonResponse(500, { error: 'SharePoint photo storage is not configured.' })
    try {
        const job = await authoritativeJob(authentication, photo.jobId)
        const token = await graphToken(settings)
        const drive = await targetDrive(settings, token)
        let folder = await graphRequest(token, `/drives/${encodeURIComponent(drive.id)}/root:/${encodedPath(settings.rootFolder)}`)
        const equipmentLabel = [job.gr_Equipment.gr_fleet || job.gr_Equipment.gr_serial, job.gr_Equipment.gr_make, job.gr_Equipment.gr_model].filter(Boolean).join(' - ')
        const segments = [
            safeSegment(job.gr_Site.gr_Customer.gr_name, job.gr_Site.gr_Customer.gr_customerid),
            safeSegment(job.gr_Site.gr_name, job.gr_Site.gr_siteid),
            safeSegment(equipmentLabel || 'Equipment', job.gr_Equipment.gr_equipmentid),
            safeSegment(job.gr_jobnumber, job.gr_jobid),
        ]
        for (const segment of segments) folder = await ensureFolder(token, drive.id, folder, segment)
        const timestamp = photo.capturedAt.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
        const safeJobNumber = String(job.gr_jobnumber).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 50)
        const fileName = `${timestamp}_${safeJobNumber}_${photo.clientUploadId.replace(/-/g, '').slice(0, 12)}.${photo.extension}`
        const item = await graphRequest(token, `/drives/${encodeURIComponent(drive.id)}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(fileName)}:/content`, {
            method: 'PUT',
            headers: { 'Content-Type': photo.type },
            body: photo.content,
        })
        return jsonResponse(201, { itemId: item.id, fileName: item.name, webUrl: item.webUrl, uploadedAtUtc: new Date().toISOString() })
    } catch (error) {
        const code = error instanceof Error ? error.message : ''
        if (code === 'incomplete-job') return jsonResponse(409, { error: 'The Job must have a Customer, Site, Equipment, and Job Number before photos can be uploaded.' })
        if (code === 'sharepoint-forbidden') return jsonResponse(403, { error: 'The photo service does not have access to the configured SharePoint site.' })
        if (code === 'library') return jsonResponse(500, { error: 'The configured SharePoint document library could not be found.' })
        if (code === 'graph-auth') return jsonResponse(503, { error: 'SharePoint authentication is temporarily unavailable.' })
        return jsonResponse(503, { error: 'The photo could not be stored in SharePoint. It remains available to retry.' })
    }
}

module.exports = { jsonResponse, searchJobs, upload, _test: { isHeifImage, parsePhoto, safeSegment } }
