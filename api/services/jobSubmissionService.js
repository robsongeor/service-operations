const { createHash, randomBytes } = require('node:crypto')

const JOB_CARD_SUBMITTED = 122830002
const SERVICE_JOB = 122830001
const DEFAULT_EXPIRY_HOURS = 168

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
        const url = new URL((process.env.DATAVERSE_URL || '').trim())
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
    const authorization = requestHeader(request, 'authorization')
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

function validateSubmission(job, body) {
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
    return ''
}

async function generate(request) {
    const authorization = await validateAuthenticatedUser(request)
    if (!authorization) return jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
    const jobId = typeof request.body?.jobId === 'string' ? request.body.jobId.trim() : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
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
    const validation = validateSubmission(found.job, request.body || {})
    if (validation) return jsonResponse(400, { code: 'invalid', error: validation })
    const now = new Date().toISOString()
    const fields = {
        gr_techniciansubmissionstory: request.body.story.trim(),
        gr_techniciansubmissionsubmittedon: now,
        gr_techniciansubmissiontokenused: true,
        gr_jobcardstatus: JOB_CARD_SUBMITTED,
        gr_jobcardsubmittedon: now,
    }
    if (request.body.hourMeter != null) fields.gr_techniciansubmissionhourmeter = request.body.hourMeter
    const response = await fetch(`${dataverseOrigin()}/api/data/v9.2/gr_jobs(${found.job.gr_jobid})`, {
        method: 'PATCH',
        headers: {
            Authorization: bearer,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'If-Match': found.etag,
        },
        body: JSON.stringify(fields),
    })
    if (response.status === 412) return tokenFailure('used')
    if (!response.ok) throw new Error('Job submission update failed.')
    return jsonResponse(200, { submitted: true })
}

module.exports = {
    generate,
    handlePublicGet,
    handlePublicPost,
    jsonResponse,
    test: {
    generateToken,
    hashToken,
    publicDetails,
    validateSubmission,
    },
}
