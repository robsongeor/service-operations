const { createHash, randomBytes } = require('node:crypto')

const JOB_CARD_SUBMITTED = 122830002
const SERVICE_JOB = 122830001
const DEFAULT_EXPIRY_HOURS = 168
const MAX_PHOTOS = 20
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif'])

function jsonResponse(status, body, headers = {}) {
    return {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
        body: JSON.stringify(body),
    }
}

function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return typeof entry?.[1] === 'string' ? entry[1].trim() : ''
}

function dataverseOrigin() {
    try {
        const url = new URL((process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim())
        return url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

function hashToken(token) {
    return createHash('sha256').update(token, 'utf8').digest('hex')
}

function generateToken() {
    return randomBytes(32).toString('base64url')
}

async function applicationToken() {
    const tenantId = process.env.DATAVERSE_TENANT_ID
    const clientId = process.env.DATAVERSE_CLIENT_ID
    const clientSecret = process.env.DATAVERSE_CLIENT_SECRET
    const origin = dataverseOrigin()
    if (!tenantId || !clientId || !clientSecret || !origin) throw new Error('Server identity is unavailable.')
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: `${origin}/.default`,
        }),
    })
    if (!response.ok) throw new Error('Server identity could not be authenticated.')
    const body = await response.json()
    if (typeof body.access_token !== 'string') throw new Error('Server identity response was invalid.')
    return body.access_token
}

async function validateAuthenticatedUser(request) {
    // Azure Static Web Apps reserves the standard Authorization header for its
    // platform authentication. Use a dedicated header for the delegated
    // Dataverse token, while retaining the standard header for local/tests.
    const authorization = requestHeader(request, 'x-dataverse-authorization')
        || requestHeader(request, 'authorization')
    if (!/^Bearer\s+\S+$/i.test(authorization)) return null
    const origin = dataverseOrigin()
    if (!origin) return null
    const response = await fetch(`${origin}/api/data/v9.2/WhoAmI`, {
        headers: { Authorization: authorization, Accept: 'application/json' },
    })
    if (!response.ok) return null
    const identity = await response.json()
    return typeof identity.UserId === 'string' && identity.UserId ? authorization : null
}

function tokenFailure(code) {
    const messages = {
        invalid: 'This job card link is invalid.',
        expired: 'This job card link has expired.',
        used: 'This job card has already been submitted.',
        unavailable: 'This job is unavailable.',
    }
    return jsonResponse(code === 'invalid' ? 404 : 410, { code, error: messages[code] })
}

function escapeOData(value) {
    return value.replaceAll("'", "''")
}

async function findJob(token, bearer) {
    if (typeof token !== 'string' || token.length < 40 || token.length > 100) return { error: tokenFailure('invalid') }
    const hash = hashToken(token)
    const select = [
        'gr_jobid', 'gr_jobnumber', 'gr_description', 'gr_jobtype', 'gr_status', 'gr_jobcardstatus',
        'gr_techniciansubmissiontokenexpireson', 'gr_techniciansubmissiontokenused',
    ].join(',')
    const expand = [
        'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_currenthourmeter)',
        'gr_Site($select=gr_name;$expand=gr_Customer($select=gr_name))',
    ].join(',')
    const url = `${dataverseOrigin()}/api/data/v9.2/gr_jobs?$select=${select}&$expand=${expand}&$filter=gr_techniciansubmissiontokenhash eq '${escapeOData(hash)}'&$top=2`
    const response = await fetch(url, {
        headers: { Authorization: bearer, Accept: 'application/json', Prefer: 'odata.include-annotations="*"' },
    })
    if (!response.ok) throw new Error('Job lookup failed.')
    const body = await response.json()
    if (!Array.isArray(body.value) || body.value.length !== 1) return { error: tokenFailure('invalid') }
    const job = body.value[0]
    if (job.gr_techniciansubmissiontokenused) return { error: tokenFailure('used') }
    const expires = Date.parse(job.gr_techniciansubmissiontokenexpireson)
    if (!Number.isFinite(expires) || expires <= Date.now()) return { error: tokenFailure('expired') }
    return { job, etag: job['@odata.etag'] }
}

function publicDetails(job) {
    return {
        jobNumber: job.gr_jobnumber || 'Not recorded',
        equipmentDisplayName: [job.gr_Equipment?.gr_make, job.gr_Equipment?.gr_model].filter(Boolean).join(' ') || undefined,
        fleetNumber: job.gr_Equipment?.gr_fleet || undefined,
        customerName: job.gr_Site?.gr_Customer?.gr_name || undefined,
        siteName: job.gr_Site?.gr_name || undefined,
        workRequired: job.gr_description || undefined,
        requiresHourMeter: job.gr_jobtype === SERVICE_JOB && Boolean(job.gr_Equipment?.gr_equipmentid),
        currentHourMeter: job.gr_Equipment?.gr_currenthourmeter ?? undefined,
    }
}

function normalizeSubmission(body) {
    const parts = Array.isArray(body.parts)
        ? body.parts.map((part) => typeof part === 'string'
            ? { description: part, quantity: 1 }
            : part)
        : []
    return {
        ...body,
        timeEntries: body.timeEntries ?? [],
        parts,
        furtherWorkRequired: body.furtherWorkRequired ?? false,
        safetyIssueIdentified: body.safetyIssueIdentified ?? false,
        photos: body.photos ?? [],
    }
}

function validateSubmission(job, body) {
    body = normalizeSubmission(body)
    const story = typeof body.story === 'string' ? body.story.trim() : ''
    if (!story) return 'Enter the work completed or job story.'
    if (story.length > 10000) return 'The job story is too long.'
    const required = job.gr_jobtype === SERVICE_JOB && Boolean(job.gr_Equipment?.gr_equipmentid)
    if (required && body.hourMeter == null) return 'Enter the current hour meter.'
    if (body.hourMeter != null && (!Number.isSafeInteger(body.hourMeter) || body.hourMeter < 0)) {
        return 'Hour meter must be a non-negative whole number.'
    }
    if (body.hourMeter != null && job.gr_Equipment?.gr_currenthourmeter != null
        && body.hourMeter < job.gr_Equipment.gr_currenthourmeter) {
        return 'Hour meter cannot be lower than the current equipment hour meter.'
    }
    if (!Array.isArray(body.timeEntries) || body.timeEntries.length > 50) return 'Time entries are invalid.'
    for (const entry of body.timeEntries) {
        if (!entry || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
            || !Number.isFinite(Date.parse(`${entry.date}T00:00:00Z`))
            || typeof entry.hours !== 'number' || !Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 24
            || !Number.isSafeInteger(entry.kilometres) || entry.kilometres < 0) {
            return 'Check each time entry. Hours must be between 0 and 24 and kilometres must be a whole number.'
        }
    }
    if (!Array.isArray(body.parts) || body.parts.length > 100
        || body.parts.some((part) => !part || typeof part.description !== 'string'
            || !part.description.trim() || part.description.trim().length > 500
            || !Number.isSafeInteger(part.quantity) || part.quantity < 1)) {
        return 'Parts are invalid.'
    }
    if (typeof body.furtherWorkRequired !== 'boolean') return 'Further work selection is invalid.'
    if (body.furtherWorkRequired && (typeof body.furtherWorkDetails !== 'string' || !body.furtherWorkDetails.trim())) {
        return 'Enter the further work details.'
    }
    if (typeof body.furtherWorkDetails === 'string' && body.furtherWorkDetails.trim().length > 10000) {
        return 'Further work details are too long.'
    }
    if (typeof body.safetyIssueIdentified !== 'boolean') return 'Safety issue selection is invalid.'
    if (body.safetyIssueIdentified && (typeof body.safetyIssueDetails !== 'string' || !body.safetyIssueDetails.trim())) {
        return 'Enter the safety issue details.'
    }
    if (typeof body.safetyIssueDetails === 'string' && body.safetyIssueDetails.trim().length > 10000) {
        return 'Safety issue details are too long.'
    }
    if (!Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS) return 'A maximum of 20 photos may be attached.'
    for (const photo of body.photos) {
        if (!photo || typeof photo.fileName !== 'string' || !photo.fileName.trim() || photo.fileName.length > 255
            || typeof photo.mimeType !== 'string' || !PHOTO_TYPES.has(photo.mimeType.toLowerCase())
            || !Number.isSafeInteger(photo.size) || photo.size < 1 || photo.size > MAX_PHOTO_BYTES
            || typeof photo.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) {
            return 'One or more photos are invalid.'
        }
        const bytes = Buffer.from(photo.data, 'base64')
        if (bytes.length !== photo.size || bytes.length > MAX_PHOTO_BYTES) return 'One or more photos are invalid.'
    }
    return ''
}

async function persistPhotos(token, job, photos, bearer, now) {
    for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index]
        const uploadKey = hashToken(`${hashToken(token)}:${index}`)
        const lookupUrl = `${dataverseOrigin()}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,_gr_job_value&$filter=gr_uploadkey eq '${uploadKey}'&$top=2`
        const lookup = await fetch(lookupUrl, { headers: { Authorization: bearer, Accept: 'application/json' } })
        if (!lookup.ok) throw new Error('Job photo lookup failed.')
        const existing = (await lookup.json()).value ?? []
        if (existing.length > 1 || (existing[0] && String(existing[0]._gr_job_value).toLowerCase() !== job.gr_jobid.toLowerCase())) {
            throw new Error('Job photo upload identity conflict.')
        }
        let photoId = existing[0]?.gr_jobphotoid
        if (!photoId) {
            const create = await fetch(`${dataverseOrigin()}/api/data/v9.2/gr_jobphotos`, {
                method: 'POST',
                headers: {
                    Authorization: bearer,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation',
                },
                body: JSON.stringify({
                    gr_name: photo.fileName.trim(),
                    'gr_Job@odata.bind': `/gr_jobs(${job.gr_jobid})`,
                    gr_filename: photo.fileName.trim(),
                    gr_uploadedon: now,
                    gr_displayorder: index,
                    gr_uploadkey: uploadKey,
                }),
            })
            if (!create.ok) throw new Error('Job photo record creation failed.')
            photoId = (await create.json()).gr_jobphotoid
            if (!photoId) throw new Error('Job photo record response was invalid.')
        }
        const upload = await fetch(
            `${dataverseOrigin()}/api/data/v9.2/gr_jobphotos(${photoId})/gr_photo?x-ms-file-name=${encodeURIComponent(photo.fileName.trim())}`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: bearer,
                    Accept: 'application/json',
                    'Content-Type': 'application/octet-stream',
                },
                body: Buffer.from(photo.data, 'base64'),
            },
        )
        if (!upload.ok) throw new Error('Job photo upload failed.')
    }
}

function submissionFields(body, now) {
    const fields = {
        gr_techniciansubmissionstory: body.story.trim(),
        gr_techniciansubmissionsubmittedon: now,
        gr_techniciansubmissiontokenused: true,
        gr_jobcardstatus: JOB_CARD_SUBMITTED,
        gr_jobcardsubmittedon: now,
    }
    if (body.furtherWorkRequired) {
        fields.gr_techniciansubmissionfurtherworkrequired = true
        fields.gr_techniciansubmissionfurtherworkdetails = body.furtherWorkDetails.trim()
    }
    if (body.safetyIssueIdentified) {
        fields.gr_techniciansubmissionsafetyissueidentified = true
        fields.gr_techniciansubmissionsafetyissuedetails = body.safetyIssueDetails.trim()
    }
    if (body.hourMeter != null) fields.gr_techniciansubmissionhourmeter = body.hourMeter
    return fields
}

function batchRequest(job, etag, body, now) {
    const boundary = `batch_${randomBytes(12).toString('hex')}`
    const changeset = `changeset_${randomBytes(12).toString('hex')}`
    const requests = []
    const addCreate = (entitySet, fields) => {
        const contentId = requests.length + 1
        requests.push([
            `--${changeset}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${contentId}`,
            '',
            `POST ${dataverseOrigin()}/api/data/v9.2/${entitySet} HTTP/1.1`,
            'Content-Type: application/json',
            '',
            JSON.stringify(fields),
        ].join('\r\n'))
    }
    body.timeEntries.forEach((entry, index) => addCreate('gr_jobcardsubmissiontimeentries', {
        gr_name: `${job.gr_jobnumber || 'Job'} - ${entry.date}`,
        'gr_Job@odata.bind': `/gr_jobs(${job.gr_jobid})`,
        gr_entrydate: entry.date,
        gr_totalhours: entry.hours,
        gr_kilometres: entry.kilometres,
        gr_displayorder: index,
    }))
    body.parts.forEach((part, index) => addCreate('gr_jobmaterials', {
        gr_name: part.description.trim(),
        'gr_Job@odata.bind': `/gr_jobs(${job.gr_jobid})`,
        gr_material: part.description.trim(),
        gr_quantity: part.quantity,
        gr_displayorder: index,
    }))
    requests.push([
        `--${changeset}`,
        'Content-Type: application/http',
        'Content-Transfer-Encoding: binary',
        `Content-ID: ${requests.length + 1}`,
        '',
        `PATCH ${dataverseOrigin()}/api/data/v9.2/gr_jobs(${job.gr_jobid}) HTTP/1.1`,
        'Content-Type: application/json',
        `If-Match: ${etag}`,
        '',
        JSON.stringify(submissionFields(body, now)),
    ].join('\r\n'))
    const payload = [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, '', ...requests, `--${changeset}--`, `--${boundary}--`, ''].join('\r\n')
    return { boundary, payload }
}

async function generate(request) {
    const authorization = await validateAuthenticatedUser(request)
    if (!authorization) return jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
    const jobId = typeof request.body?.jobId === 'string' ? request.body.jobId.trim() : ''
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId)) {
        return jsonResponse(400, { error: 'A valid Job is required.' })
    }
    const hours = Number.isInteger(request.body?.expiresInHours)
        ? Math.min(Math.max(request.body.expiresInHours, 1), 720)
        : DEFAULT_EXPIRY_HOURS
    const token = generateToken()
    const now = new Date()
    const expires = new Date(now.getTime() + hours * 60 * 60 * 1000)
    const response = await fetch(`${dataverseOrigin()}/api/data/v9.2/gr_jobs(${jobId})`, {
        method: 'PATCH',
        headers: { Authorization: authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            gr_techniciansubmissiontokenhash: hashToken(token),
            gr_techniciansubmissiontokencreatedon: now.toISOString(),
            gr_techniciansubmissiontokenexpireson: expires.toISOString(),
            gr_techniciansubmissiontokenused: false,
        }),
    })
    if (!response.ok) return jsonResponse(response.status === 404 ? 404 : 502, { error: 'A submission link could not be created.' })
    return jsonResponse(201, { token, path: `/portal/job/${token}`, expiresOn: expires.toISOString() })
}

async function handlePublicGet(request) {
    const bearer = `Bearer ${await applicationToken()}`
    const found = await findJob(request.query?.token, bearer)
    return found.error || jsonResponse(200, publicDetails(found.job))
}

async function handlePublicPost(request) {
    const bearer = `Bearer ${await applicationToken()}`
    const found = await findJob(request.body?.token, bearer)
    if (found.error) return found.error
    const body = normalizeSubmission(request.body || {})
    const validation = validateSubmission(found.job, body)
    if (validation) return jsonResponse(400, { code: 'invalid', error: validation })
    const now = new Date().toISOString()
    if (body.photos.length > 0) await persistPhotos(request.body.token, found.job, body.photos, bearer, now)
    const hasChildren = body.timeEntries.length > 0 || body.parts.length > 0
    const batch = hasChildren ? batchRequest(found.job, found.etag, body, now) : null
    const response = await fetch(
        hasChildren
            ? `${dataverseOrigin()}/api/data/v9.2/$batch`
            : `${dataverseOrigin()}/api/data/v9.2/gr_jobs(${found.job.gr_jobid})`,
        hasChildren ? {
            method: 'POST',
            headers: {
                Authorization: bearer,
                'Content-Type': `multipart/mixed;boundary=${batch.boundary}`,
                Accept: 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
            },
            body: batch.payload,
        } : {
            method: 'PATCH',
            headers: {
                Authorization: bearer,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'If-Match': found.etag,
            },
            body: JSON.stringify(submissionFields(body, now)),
        },
    )
    const responseText = await response.text()
    if (response.status === 412 || /HTTP\/1\.1 412/.test(responseText)) return tokenFailure('used')
    if (!response.ok || /HTTP\/1\.1 [45]\d\d/.test(responseText)) {
        const innerStatus = responseText.match(/HTTP\/1\.1 ([45]\d\d)/)?.[1]
        const innerCode = responseText.match(/"code"\s*:\s*"([^"]+)"/)?.[1]
        throw new Error(`Job submission update failed (${innerStatus || response.status}${innerCode ? `, ${innerCode}` : ''}).`)
    }
    return jsonResponse(200, { submitted: true })
}

module.exports = {
    generate,
    handlePublicGet,
    handlePublicPost,
    persistPhotos,
    jsonResponse,
    test: {
    generateToken,
    hashToken,
    publicDetails,
    validateSubmission,
    submissionFields,
    batchRequest,
    persistPhotos,
    },
}
