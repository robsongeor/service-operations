const { createHash, timingSafeEqual } = require('node:crypto')
const { fetchGreenTreeJobsModifiedSince } = require('../services/greenTreeJobs')
const { reconcileGreenTreeJobs } = require('../services/greenTreeJobReconciliation')
const { getGreenTreeSyncCheckpointStore } = require('../services/greenTreeSyncCheckpoint')
const { getGreenTreeDataverseApplicationToken } = require('../services/dataverseApplicationToken')
const { getJobCardStore } = require('../services/jobCardStorage')
const { reconcilePendingCompletionReviews } = require('../services/jobOperationalStatusAutomation')

const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000

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

function secretsMatch(received, expected) {
    if (!received || !expected) return false
    const receivedHash = createHash('sha256').update(received, 'utf8').digest()
    const expectedHash = createHash('sha256').update(expected, 'utf8').digest()
    return timingSafeEqual(receivedHash, expectedHash)
}

async function scheduledAuthorization(request) {
    const receivedSecret = requestHeader(request, 'x-greentree-sync-secret')
    const expectedSecret = (process.env.GREENTREE_SYNC_SECRET || '').trim()
    if (!secretsMatch(receivedSecret, expectedSecret)) return null
    return `Bearer ${await getGreenTreeDataverseApplicationToken()}`
}

function dataverseOrigin() {
    try {
        const url = new URL((process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim())
        return url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

function formatGreenTreeModifiedSince(timestamp) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

async function validateAuthenticatedUser(request) {
    const authorization = requestHeader(request, 'x-dataverse-authorization')
        || requestHeader(request, 'authorization')
    const origin = dataverseOrigin()
    if (!/^Bearer\s+\S+$/i.test(authorization) || !origin) return null
    try {
        const response = await fetch(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: { Authorization: authorization, Accept: 'application/json' },
        })
        if (!response.ok) return null
        const identity = await response.json()
        return typeof identity.UserId === 'string' && identity.UserId ? authorization : null
    } catch {
        return null
    }
}

function acceptDelegatedBearerForLocalDevelopment(request) {
    const authorization = requestHeader(request, 'x-dataverse-authorization')
        || requestHeader(request, 'authorization')
    return /^Bearer\s+\S+$/i.test(authorization) ? authorization : null
}

function parseModifiedSince(value, now = Date.now()) {
    if (typeof value !== 'string' || !value.trim()) return null
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp) || timestamp > now + 60_000 || timestamp < now - MAX_LOOKBACK_MS) return null
    return formatGreenTreeModifiedSince(timestamp)
}

async function greenTreeJobChanges(context, request, options = {}) {
    if (request.method !== 'GET' && request.method !== 'POST') {
        context.res = jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' })
        return
    }
    let authorization
    try {
        authorization = await (options.authenticate || validateAuthenticatedUser)(request)
        if (!authorization && request.method === 'POST') authorization = await (options.authenticateScheduler || scheduledAuthorization)(request)
    } catch {
        context.res = jsonResponse(503, { error: 'The scheduled synchronization identity is unavailable.' })
        return
    }
    if (!authorization) {
        context.res = jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
        return
    }

    const suppliedModifiedSince = request.method === 'POST' ? request.body?.modifiedSince : request.query?.modifiedSince
    let syncRun = null
    const checkpointStore = request.method === 'POST'
        ? (options.getCheckpointStore || getGreenTreeSyncCheckpointStore)()
        : null
    let jobCardStatusReconciliation = null
    if (request.method === 'POST') {
        try {
            jobCardStatusReconciliation = await (options.reconcilePendingCompletionReviews || reconcilePendingCompletionReviews)({
                store: (options.getJobCardStore || getJobCardStore)(),
                dataverseOrigin: dataverseOrigin(),
                authorization,
            })
        } catch {
            jobCardStatusReconciliation = { failed: true }
        }
    }
    if (request.method === 'POST') {
        if (checkpointStore) {
            try { syncRun = await checkpointStore.begin() }
            catch { context.res = jsonResponse(503, { error: 'The GreenTree synchronization checkpoint is unavailable.' }); return }
            if (syncRun.skipped) {
                context.res = jsonResponse(200, {
                    skipped: true,
                    reason: syncRun.reason,
                    checkedAt: new Date().toISOString(),
                    jobCardStatusReconciliation,
                })
                return
            }
        }
    }
    const modifiedSince = syncRun
        ? formatGreenTreeModifiedSince(Date.parse(syncRun.modifiedSince))
        : parseModifiedSince(suppliedModifiedSince)
    if (!modifiedSince) {
        context.res = jsonResponse(400, { error: 'modifiedSince must be a valid timestamp within the previous 24 hours.' })
        return
    }

    try {
        const jobs = await fetchGreenTreeJobsModifiedSince(modifiedSince)
        if (request.method === 'POST') {
            const reconciliation = await reconcileGreenTreeJobs({
                jobs,
                dataverseOrigin: dataverseOrigin(),
                authorization,
            })
            if (checkpointStore && syncRun) await checkpointStore.complete(syncRun)
            context.res = jsonResponse(200, { modifiedSince, checkedAt: new Date().toISOString(), jobCardStatusReconciliation, ...reconciliation })
            return
        }
        context.res = jsonResponse(200, {
            modifiedSince,
            checkedAt: new Date().toISOString(),
            count: jobs.length,
            jobs,
        })
    } catch (error) {
        if (checkpointStore && syncRun) await checkpointStore.fail(syncRun).catch(() => undefined)
        const timedOut = error instanceof Error && error.name === 'AbortError'
        context.res = jsonResponse(timedOut ? 504 : 502, {
            error: timedOut ? 'The Lift Trucks API request timed out.' : 'The Lift Trucks API could not complete the request.',
        })
    }
}

module.exports = (context, request) => greenTreeJobChanges(context, request)
module.exports.localDevelopment = (context, request) => greenTreeJobChanges(context, request, {
    authenticate: acceptDelegatedBearerForLocalDevelopment,
    getCheckpointStore: () => null,
})

module.exports._test = {
    dataverseOrigin,
    formatGreenTreeModifiedSince,
    parseModifiedSince,
    requestHeader,
    validateAuthenticatedUser,
    acceptDelegatedBearerForLocalDevelopment,
    greenTreeJobChanges,
    secretsMatch,
    scheduledAuthorization,
}
