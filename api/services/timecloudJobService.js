const { getDataverseApplicationToken } = require('./dataverseApplicationToken')

const GUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const REGISTERED_STAGE = 122830004
const MAX_TIMECLOUD_NAME_LENGTH = 250
const TEST_JOB_LABEL = '[TEST ONLY - SAFE TO DELETE]'
const TEST_JOB_CUSTOM_CODE = 'JOBBOOK-TEST-ONLY'
const BOOKS = Object.freeze({
    auckland: { tableSet: 'gr_jobbookentries', idField: 'gr_jobbookentryid' },
    waikato: { tableSet: 'gr_waikatojobbookentries', idField: 'gr_waikatojobbookentryid' },
    hastings: { tableSet: 'gr_hastingsjobbookentries', idField: 'gr_hastingsjobbookentryid' },
    christchurch: { tableSet: 'gr_christchurchjobbookentries', idField: 'gr_christchurchjobbookentryid' },
})

let tokenCache = null

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

function timecloudSettings() {
    const settings = {
        apiUrl: (process.env.TIMECLOUD_API_URL || 'https://api.jointimecloud.com').trim().replace(/\/$/, ''),
        authUrl: (process.env.TIMECLOUD_AUTH_URL || 'https://auth.jointimecloud.com/oauth/token').trim(),
        audience: (process.env.TIMECLOUD_AUDIENCE || 'https://prod.editmytime.com/').trim(),
        clientId: (process.env.TIMECLOUD_CLIENT_ID || '').trim(),
        username: (process.env.TIMECLOUD_API_USERNAME || '').trim(),
        password: process.env.TIMECLOUD_API_PASSWORD || '',
        integratorKey: (process.env.TIMECLOUD_INTEGRATOR_KEY || '').trim(),
        layerId: (process.env.TIMECLOUD_JOB_LAYER_ID || '671835fe0d6412dbb8cafb30').trim(),
        mode: (process.env.TIMECLOUD_JOB_MODE || 'test').trim().toLowerCase(),
    }
    try {
        if (new URL(settings.apiUrl).protocol !== 'https:' || new URL(settings.authUrl).protocol !== 'https:') return null
    } catch { return null }
    return Object.values(settings).every((value) => value) && ['test', 'production'].includes(settings.mode) ? settings : null
}

function timecloudCreationEnabled() {
    return /^true$/i.test((process.env.TIMECLOUD_JOB_CREATION_ENABLED || '').trim())
}

async function validateAuthenticatedUser(request, fetchImpl = fetch) {
    const authorization = requestHeader(request, 'x-dataverse-authorization') || requestHeader(request, 'authorization')
    const origin = dataverseOrigin()
    if (!/^Bearer\s+\S+$/i.test(authorization) || !origin) return null
    try {
        const response = await fetchImpl(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: { Authorization: authorization, Accept: 'application/json' },
        })
        if (!response.ok) return null
        const identity = await response.json()
        return typeof identity.UserId === 'string' && GUID.test(identity.UserId)
            ? { authorization, userId: identity.UserId.toLowerCase() }
            : null
    } catch { return null }
}

function compactText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function buildTimecloudJobName(jobNumber, description, mode = 'test') {
    const prefix = compactText(jobNumber)
    const suffix = compactText(description)
    if (!prefix || !suffix) throw new Error('A numbered Job with a description is required.')
    const label = mode === 'test' ? `${TEST_JOB_LABEL} ` : ''
    return `${prefix} ${label}${suffix}`.slice(0, MAX_TIMECLOUD_NAME_LENGTH).trim()
}

function exactJobNumberMatch(item, jobNumber) {
    if (!item || typeof item !== 'object') return false
    const name = compactText(item.name)
    if (!name) return false
    const first = name.split(' ')[0]
    return first.toUpperCase() === jobNumber.toUpperCase()
}

async function accessToken(settings, fetchImpl = fetch, now = Date.now()) {
    const cacheKey = `${settings.authUrl}\n${settings.clientId}\n${settings.username}`
    if (tokenCache?.key === cacheKey && tokenCache.expiresAt > now + 60_000) return tokenCache.token
    const response = await fetchImpl(settings.authUrl, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'password',
            client_id: settings.clientId,
            username: settings.username,
            password: settings.password,
            audience: settings.audience,
        }),
    })
    if (!response.ok) throw new Error('TimeCloud authentication failed.')
    const body = await response.json().catch(() => null)
    const expiresIn = Number(body?.expires_in)
    if (typeof body?.access_token !== 'string' || !body.access_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error('TimeCloud authentication returned an invalid response.')
    }
    tokenCache = { key: cacheKey, token: body.access_token, expiresAt: now + expiresIn * 1000 }
    return tokenCache.token
}

function timecloudHeaders(token, settings) {
    return {
        Authorization: `Bearer ${token}`,
        'X-Timecloud-Integrator-Key': settings.integratorKey,
        Accept: 'application/json',
    }
}

function verifiedTimecloudItem(value, expectedName) {
    const item = value && typeof value === 'object' ? value : null
    if (!item || typeof item._id !== 'string' || !item._id || typeof item.code !== 'string' || !item.code || compactText(item.name) !== expectedName) {
        throw new Error('TimeCloud returned an invalid Job Item response.')
    }
    return item
}

async function findTimecloudJob(settings, token, jobNumber, expectedName, fetchImpl = fetch) {
    const url = new URL(`${settings.apiUrl}/api/v1/job-items/search`)
    url.searchParams.set('active', 'true')
    url.searchParams.set('search', jobNumber)
    url.searchParams.set('page', '1')
    url.searchParams.set('limit', '100')
    const response = await fetchImpl(url, { cache: 'no-store', headers: timecloudHeaders(token, settings) })
    if (!response.ok) throw new Error('TimeCloud Job search failed.')
    const body = await response.json().catch(() => null)
    if (!Array.isArray(body?.data)) throw new Error('TimeCloud Job search returned an invalid response.')
    const matches = body.data.filter((item) => exactJobNumberMatch(item, jobNumber))
    if (matches.length > 1) throw new Error(`TimeCloud contains multiple active Job Items for ${jobNumber}. Resolve them before retrying.`)
    if (!matches.length) return null
    const item = matches[0]
    if (compactText(item.name) !== expectedName) {
        throw new Error(`TimeCloud already contains Job ${jobNumber} with different details. Review it before retrying.`)
    }
    return verifiedTimecloudItem(item, expectedName)
}

async function createTimecloudJob(settings, token, name, fetchImpl = fetch) {
    const response = await fetchImpl(`${settings.apiUrl}/api/v1/job-items`, {
        method: 'POST',
        headers: { ...timecloudHeaders(token, settings), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            userGroups: [],
            isActive: true,
            customCode: settings.mode === 'test' ? TEST_JOB_CUSTOM_CODE : '',
            ccExportCode2: '',
            ccExportCode3: '',
            childrenIds: [],
            layerId: settings.layerId,
        }),
    })
    if (!response.ok) throw new Error('TimeCloud could not create the Job Item.')
    const body = await response.json().catch(() => null)
    return verifiedTimecloudItem(body?.data, name)
}

async function readJson(response, message) {
    if (!response.ok) throw new Error(message)
    const body = await response.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new Error(message)
    return body
}

async function readDataverseConfirmation(response, message) {
    if (response.ok) return readJson(response, message)
    const body = await response.json().catch(() => null)
    const code = typeof body?.error?.code === 'string' && /^[\w.-]{1,80}$/.test(body.error.code)
        ? `, code ${body.error.code}`
        : ''
    const rawReason = typeof body?.error?.message === 'string' ? body.error.message.replace(/\s+/g, ' ').trim() : ''
    const reason = rawReason
        ? `: ${rawReason
            .replace(/\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/gi, '<id>')
            .replace(/<?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>?/gi, '<email>')
            .slice(0, 300)}`
        : ''
    throw new Error(`${message} (Dataverse HTTP ${response.status}${code})${reason}.`)
}

async function sync(request, options = {}) {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' })
    const allowed = new Set(['book', 'jobId', 'ledgerId', 'trigger'])
    if (!request.body || Object.keys(request.body).some((key) => !allowed.has(key))) return jsonResponse(400, { error: 'The TimeCloud Job request is invalid.' })
    const { book, jobId, ledgerId, trigger } = request.body
    if (!Object.hasOwn(BOOKS, book) || !GUID.test(jobId || '') || !GUID.test(ledgerId || '') || !['automatic', 'manual'].includes(trigger)) {
        return jsonResponse(400, { error: 'A valid registered Job Book entry is required.' })
    }

    const fetchImpl = options.fetchImpl || fetch
    const authentication = await (options.authenticate || validateAuthenticatedUser)(request, fetchImpl)
    if (!authentication) return jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
    const origin = dataverseOrigin()
    const definition = BOOKS[book]

    try {
        const ledgerUrl = `${origin}/api/data/v9.2/${definition.tableSet}(${ledgerId})?$select=${definition.idField},gr_jobnumber,gr_stage,_gr_registeredjob_value`
        const ledger = await readJson(await fetchImpl(ledgerUrl, {
            cache: 'no-store', headers: { Authorization: authentication.authorization, Accept: 'application/json' },
        }), 'The registered Job Book entry could not be verified.')
        if (String(ledger[definition.idField]).toLowerCase() !== ledgerId.toLowerCase() ||
            Number(ledger.gr_stage) !== REGISTERED_STAGE || String(ledger._gr_registeredjob_value).toLowerCase() !== jobId.toLowerCase()) {
            return jsonResponse(409, { error: 'The Job Book entry is not linked to this registered Job.' })
        }

        const enabled = options.enabled === undefined ? timecloudCreationEnabled() : Boolean(options.enabled)
        if (!enabled) return jsonResponse(200, {
            jobId,
            jobNumber: ledger.gr_jobnumber,
            timecloudEntered: false,
            created: false,
            skipped: true,
            reason: 'disabled',
        })
        const settings = (options.settings || timecloudSettings)()
        if (!settings) return jsonResponse(503, { error: 'TimeCloud integration is not configured.' })
        const applicationToken = await (options.getApplicationToken || getDataverseApplicationToken)({ fetchImpl })
        const applicationAuthorization = `Bearer ${applicationToken}`
        const select = 'gr_jobid,gr_jobnumber,gr_description,gr_timecloudentered,gr_timecloudjobitemid,gr_timecloudcode,gr_registrationvoid'
        const jobUrl = `${origin}/api/data/v9.2/gr_jobs(${jobId})?$select=${select}`
        const jobResponse = await fetchImpl(jobUrl, { cache: 'no-store', headers: { Authorization: applicationAuthorization, Accept: 'application/json' } })
        const job = await readJson(jobResponse, 'The registered Job could not be loaded.')
        const etag = job['@odata.etag'] || jobResponse.headers.get('ETag') || ''
        if (String(job.gr_jobid).toLowerCase() !== jobId.toLowerCase() || compactText(job.gr_jobnumber) !== compactText(ledger.gr_jobnumber) || job.gr_registrationvoid) {
            return jsonResponse(409, { error: 'The registered Job is no longer eligible for TimeCloud.' })
        }
        if (!etag) throw new Error('The registered Job version could not be verified.')
        if (job.gr_timecloudentered && compactText(job.gr_timecloudjobitemid) && compactText(job.gr_timecloudcode)) {
            return jsonResponse(200, {
                jobId: job.gr_jobid,
                jobNumber: job.gr_jobnumber,
                timecloudJobItemId: job.gr_timecloudjobitemid,
                timecloudCode: job.gr_timecloudcode,
                timecloudEntered: true,
                created: false,
                etag,
            })
        }

        const name = buildTimecloudJobName(job.gr_jobnumber, job.gr_description, settings.mode)
        const token = await (options.accessToken || accessToken)(settings, fetchImpl)
        let item = await (options.findTimecloudJob || findTimecloudJob)(settings, token, job.gr_jobnumber, name, fetchImpl)
        let created = false
        if (!item) {
            item = await (options.createTimecloudJob || createTimecloudJob)(settings, token, name, fetchImpl)
            created = true
        }

        const patchResponse = await fetchImpl(jobUrl, {
            method: 'PATCH',
            headers: {
                Authorization: applicationAuthorization,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'If-Match': etag,
                Prefer: 'return=representation',
            },
            body: JSON.stringify({
                gr_timecloudentered: true,
                gr_timecloudjobitemid: item._id,
                gr_timecloudcode: item.code,
            }),
        })
        if (patchResponse.status === 412) return jsonResponse(409, { error: `Job ${job.gr_jobnumber} changed while TimeCloud was updated. Reload and retry to reconcile it.` })
        const saved = await readDataverseConfirmation(patchResponse, `TimeCloud Job ${job.gr_jobnumber} exists, but Dataverse could not record it. Retry to reconcile it`)
        const savedEtag = saved['@odata.etag'] || patchResponse.headers.get('ETag') || ''
        if (!saved.gr_timecloudentered || saved.gr_timecloudjobitemid !== item._id || saved.gr_timecloudcode !== item.code || !savedEtag) {
            throw new Error(`TimeCloud Job ${job.gr_jobnumber} exists, but Dataverse could not confirm it. Retry to reconcile it.`)
        }
        return jsonResponse(created ? 201 : 200, {
            jobId: job.gr_jobid,
            jobNumber: job.gr_jobnumber,
            timecloudJobItemId: item._id,
            timecloudCode: item.code,
            timecloudEntered: true,
            created,
            etag: savedEtag,
        })
    } catch (error) {
        return jsonResponse(503, { error: error instanceof Error ? error.message : 'The TimeCloud Job could not be confirmed.' })
    }
}

function resetTokenCache() { tokenCache = null }

module.exports = {
    jsonResponse,
    sync,
    _test: {
        accessToken,
        buildTimecloudJobName,
        createTimecloudJob,
        exactJobNumberMatch,
        findTimecloudJob,
        resetTokenCache,
        timecloudSettings,
        timecloudCreationEnabled,
        validateAuthenticatedUser,
    },
}
