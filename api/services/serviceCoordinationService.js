const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const WATCH_ENTITY_SET = 'gr_jobwatchs'
const WATCH_PAGE_SIZE = 100
const ACTIVE_GREENTREE_JOB_FILTER = "(gr_Job/gr_greentreestatus eq null or (gr_Job/gr_greentreestatus ne 'closed' and gr_Job/gr_greentreestatus ne 'finalised'))"
const BRANCHES = new Map([
    [122830000, 'Auckland'],
    [122830001, 'Waikato'],
    [122830002, 'Hastings'],
    [122830003, 'Christchurch'],
])
const WATCH_JOB_SELECT = [
    'gr_jobid', 'createdon', 'gr_jobnumber', 'gr_status', 'gr_ordernumber', 'gr_description',
    'gr_jobtype', 'gr_registrationvoid', 'gr_operatingbranch', 'gr_greentreestatus', 'gr_currentofficeaction',
    'gr_officeactionowner', 'gr_officeattentionrequired',
].join(',')
const WATCH_JOB_EXPAND = [
    'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_serial,gr_make,gr_model)',
    'gr_Mechanic($select=gr_mechanicid,gr_name,gr_phone,gr_email)',
    'gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))',
    'gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)',
].join(',')

function jsonResponse(status, body, headers = {}) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'private, no-store',
            ...headers,
        },
        body: JSON.stringify(body),
    }
}

function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return typeof entry?.[1] === 'string' ? entry[1].trim() : ''
}

function dataverseOrigin() {
    const configured = (process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim()
    try {
        const parsed = new URL(configured)
        return parsed.protocol === 'https:' ? parsed.origin : ''
    } catch { return '' }
}

function bearer(request) {
    const value = requestHeader(request, 'x-dataverse-authorization') || requestHeader(request, 'authorization')
    return /^Bearer\s+\S+$/i.test(value) ? value : ''
}

async function readJson(response) {
    try { return await response.json() } catch { return null }
}

async function authenticate(request, fetchImpl) {
    const authorization = bearer(request)
    if (!authorization) return { error: jsonResponse(401, { code: 'authentication-required', error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' }) }
    const origin = dataverseOrigin()
    if (!origin) return { error: jsonResponse(500, { code: 'configuration', error: 'Service Coordination authentication is not configured.' }) }
    let response
    try {
        response = await fetchImpl(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: { Authorization: authorization, Accept: 'application/json' },
            redirect: 'error',
        })
    } catch { return { error: jsonResponse(503, { code: 'authentication-unavailable', error: 'Authentication could not be validated.' }) } }
    if (!response.ok) {
        const status = response.status === 401 || response.status === 403 ? 401 : 503
        return { error: jsonResponse(status, { code: status === 401 ? 'invalid-session' : 'authentication-unavailable', error: status === 401 ? 'The authenticated session is invalid or expired.' : 'Authentication could not be validated.' }) }
    }
    const identity = await readJson(response)
    const userId = typeof identity?.UserId === 'string' ? identity.UserId.toLowerCase() : ''
    return GUID.test(userId) ? { authorization, origin, userId } : { error: jsonResponse(401, { code: 'invalid-identity', error: 'The authenticated identity is invalid.' }) }
}

async function readUser(identity, fetchImpl) {
    const response = await fetchImpl(
        `${identity.origin}/api/data/v9.2/systemusers(${identity.userId})?$select=systemuserid,fullname,gr_serviceoperationsbranch`,
        { headers: { Authorization: identity.authorization, Accept: 'application/json' }, redirect: 'error' },
    )
    if (!response.ok) throw new Error('user-read')
    const user = await readJson(response)
    if (!user || String(user.systemuserid || '').toLowerCase() !== identity.userId) throw new Error('user-mismatch')
    const branchValue = Number(user.gr_serviceoperationsbranch)
    return {
        displayName: typeof user.fullname === 'string' ? user.fullname.trim().slice(0, 200) : '',
        branch: BRANCHES.has(branchValue) ? { value: branchValue, label: BRANCHES.get(branchValue) } : null,
    }
}

function encodeCursor(value) {
    return value ? Buffer.from(value, 'utf8').toString('base64url') : ''
}

function decodeCursor(value, origin) {
    if (!value) return ''
    if (typeof value !== 'string' || value.length > 8192) throw new Error('cursor')
    let decoded
    try { decoded = Buffer.from(value, 'base64url').toString('utf8') } catch { throw new Error('cursor') }
    const parsed = new URL(decoded, origin)
    if (parsed.origin !== origin || parsed.pathname.toLowerCase() !== `/api/data/v9.2/${WATCH_ENTITY_SET}` || parsed.username || parsed.password) throw new Error('cursor')
    return parsed.href
}

function ownWatchFilter(userId, jobId = '') {
    const clauses = [`_gr_watcher_value eq ${userId}`, `_ownerid_value eq ${userId}`]
    if (jobId) clauses.push(`_gr_job_value eq ${jobId}`)
    return clauses.join(' and ')
}

function watchListUrl(identity, cursor) {
    if (cursor) return decodeCursor(cursor, identity.origin)
    const url = new URL(`/api/data/v9.2/${WATCH_ENTITY_SET}`, identity.origin)
    url.searchParams.set('$select', 'gr_jobwatchid,createdon,_gr_job_value')
    url.searchParams.set('$expand', `gr_Job($select=${WATCH_JOB_SELECT};$expand=${WATCH_JOB_EXPAND})`)
    url.searchParams.set('$filter', `${ownWatchFilter(identity.userId)} and ${ACTIVE_GREENTREE_JOB_FILTER}`)
    url.searchParams.set('$orderby', 'createdon desc,gr_jobwatchid asc')
    url.searchParams.set('$top', String(WATCH_PAGE_SIZE))
    return url.href
}

function safeWatchItem(row) {
    if (!GUID.test(row?.gr_jobwatchid || '') || !GUID.test(row?._gr_job_value || '')) return null
    const job = row.gr_Job
    const greenTreeStatus = typeof job?.gr_greentreestatus === 'string' ? job.gr_greentreestatus.trim().toLowerCase() : ''
    if (!job || !GUID.test(job.gr_jobid || '') || String(job.gr_jobid).toLowerCase() !== String(row._gr_job_value).toLowerCase() || job.gr_registrationvoid === true || greenTreeStatus === 'closed' || greenTreeStatus === 'finalised') return null
    return { watchId: String(row.gr_jobwatchid).toLowerCase(), watchedOn: String(row.createdon || ''), job }
}

async function listWatches(identity, cursor, fetchImpl) {
    let target
    try { target = watchListUrl(identity, cursor) } catch { return jsonResponse(400, { code: 'invalid-cursor', error: 'The watchlist page is invalid.' }) }
    const response = await fetchImpl(target, {
        headers: { Authorization: identity.authorization, Accept: 'application/json', Prefer: `odata.maxpagesize=${WATCH_PAGE_SIZE}` },
        redirect: 'error',
    })
    if (!response.ok) return jsonResponse(response.status === 401 || response.status === 403 ? 403 : 503, { code: 'watchlist-unavailable', error: 'The personal watchlist could not be loaded.' })
    const body = await readJson(response)
    if (!Array.isArray(body?.value)) return jsonResponse(503, { code: 'watchlist-incomplete', error: 'The personal watchlist response was incomplete.' })
    let next = ''
    try {
        const rawNext = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : ''
        next = rawNext ? encodeCursor(decodeCursor(encodeCursor(rawNext), identity.origin)) : ''
    } catch { return jsonResponse(503, { code: 'watchlist-incomplete', error: 'The personal watchlist continuation could not be verified.' }) }
    return jsonResponse(200, { items: body.value.map(safeWatchItem).filter(Boolean), next })
}

async function findOwnWatch(identity, jobId, fetchImpl) {
    const url = new URL(`/api/data/v9.2/${WATCH_ENTITY_SET}`, identity.origin)
    url.searchParams.set('$select', 'gr_jobwatchid')
    url.searchParams.set('$filter', ownWatchFilter(identity.userId, jobId))
    url.searchParams.set('$top', '2')
    const response = await fetchImpl(url, { headers: { Authorization: identity.authorization, Accept: 'application/json' }, redirect: 'error' })
    if (!response.ok) throw new Error('watch-read')
    const body = await readJson(response)
    if (!Array.isArray(body?.value) || body.value.length > 1) throw new Error('watch-conflict')
    return body.value[0] || null
}

async function readableJob(identity, jobId, fetchImpl) {
    const response = await fetchImpl(`${identity.origin}/api/data/v9.2/gr_jobs(${jobId})?$select=gr_jobid,gr_registrationvoid,gr_greentreestatus`, {
        headers: { Authorization: identity.authorization, Accept: 'application/json' },
        redirect: 'error',
    })
    if (!response.ok) return null
    const job = await readJson(response)
    const greenTreeStatus = typeof job?.gr_greentreestatus === 'string' ? job.gr_greentreestatus.trim().toLowerCase() : ''
    return job && String(job.gr_jobid || '').toLowerCase() === jobId && job.gr_registrationvoid !== true && greenTreeStatus !== 'closed' && greenTreeStatus !== 'finalised' ? job : null
}

async function addWatch(identity, jobId, fetchImpl) {
    if (!await readableJob(identity, jobId, fetchImpl)) return jsonResponse(404, { code: 'job-unavailable', error: 'The Job is unavailable.' })
    const existing = await findOwnWatch(identity, jobId, fetchImpl)
    if (existing) return jsonResponse(200, { watched: true, created: false })
    const response = await fetchImpl(`${identity.origin}/api/data/v9.2/${WATCH_ENTITY_SET}`, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: identity.authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gr_name: `Watch ${jobId}`,
            'gr_Job@odata.bind': `/gr_jobs(${jobId})`,
            'gr_Watcher@odata.bind': `/systemusers(${identity.userId})`,
            // Delegated Dataverse Create makes the caller the owner without requiring Assign.
        }),
    })
    if (response.ok) return jsonResponse(201, { watched: true, created: true })
    if ([409, 412].includes(response.status) && await findOwnWatch(identity, jobId, fetchImpl)) return jsonResponse(200, { watched: true, created: false })
    return jsonResponse(response.status === 401 || response.status === 403 ? 403 : 503, { code: 'watch-add-failed', error: 'The Job could not be added to your watchlist.' })
}

async function removeWatch(identity, jobId, fetchImpl) {
    const existing = await findOwnWatch(identity, jobId, fetchImpl)
    if (!existing) return jsonResponse(200, { watched: false, removed: false })
    const watchId = String(existing.gr_jobwatchid || '').toLowerCase()
    if (!GUID.test(watchId)) return jsonResponse(503, { code: 'watch-conflict', error: 'The personal watch could not be verified.' })
    const response = await fetchImpl(`${identity.origin}/api/data/v9.2/${WATCH_ENTITY_SET}(${watchId})`, {
        method: 'DELETE', redirect: 'error',
        headers: { Authorization: identity.authorization, Accept: 'application/json', 'If-Match': existing['@odata.etag'] || '*' },
    })
    if (response.ok || response.status === 404) return jsonResponse(200, { watched: false, removed: response.status !== 404 })
    return jsonResponse(response.status === 401 || response.status === 403 ? 403 : 503, { code: 'watch-remove-failed', error: 'The Job could not be removed from your watchlist.' })
}

async function handleServiceCoordination(request, options = {}) {
    const fetchImpl = options.fetchImpl || fetch
    const enabled = options.enabled ?? process.env.SERVICE_COORDINATION_BACKEND_ENABLED === 'true'
    if (!enabled) return jsonResponse(503, { code: 'not-enabled', error: 'Service Coordination branch and watch services are not enabled.' })
    if (!['GET', 'POST'].includes(request.method)) return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' })
    const identity = await authenticate(request, fetchImpl)
    if (identity.error) return identity.error
    try {
        if (request.method === 'GET') {
            const view = request.query?.view || 'context'
            if (!['context', 'watches'].includes(view) || Object.keys(request.query || {}).some((key) => !['view', 'cursor'].includes(key))) return jsonResponse(400, { code: 'invalid-query', error: 'The Service Coordination query is invalid.' })
            const user = await readUser(identity, fetchImpl)
            if (view === 'context') {
                if (!user.branch) return jsonResponse(409, { code: 'branch-not-configured', error: 'Your Service Coordination branch has not been configured.' })
                return jsonResponse(200, { branch: user.branch })
            }
            return listWatches(identity, request.query?.cursor || '', fetchImpl)
        }
        const keys = Object.keys(request.body || {})
        if (keys.some((key) => !['action', 'jobId'].includes(key))) return jsonResponse(400, { code: 'invalid-request', error: 'Watcher and owner are derived from the authenticated user.' })
        const action = request.body?.action
        const jobId = typeof request.body?.jobId === 'string' ? request.body.jobId.trim().toLowerCase() : ''
        if (!['watch', 'unwatch'].includes(action) || !GUID.test(jobId)) return jsonResponse(400, { code: 'invalid-request', error: 'A valid watch action and Job are required.' })
        return action === 'watch' ? addWatch(identity, jobId, fetchImpl) : removeWatch(identity, jobId, fetchImpl)
    } catch {
        return jsonResponse(503, { code: 'temporarily-unavailable', error: 'The Service Coordination service is temporarily unavailable.' })
    }
}

module.exports = {
    handleServiceCoordination,
    jsonResponse,
    _test: { authenticate, decodeCursor, encodeCursor, ownWatchFilter, safeWatchItem, BRANCHES, WATCH_ENTITY_SET },
}
