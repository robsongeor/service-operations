const assert = require('node:assert/strict')
const test = require('node:test')
const endpoint = require('../api/greentreejobchanges/index')
const client = require('../api/services/greenTreeJobs')
const { reconcileGreenTreeJobs } = require('../api/services/greenTreeJobReconciliation')
const {
    AzureGreenTreeSyncCheckpointStore,
    resetGreenTreeSyncCheckpointStore,
    _test: checkpointConstants,
} = require('../api/services/greenTreeSyncCheckpoint')

const originalFetch = global.fetch
const originalEnvironment = {
    DATAVERSE_URL: process.env.DATAVERSE_URL,
    VITE_DATAVERSE_URL: process.env.VITE_DATAVERSE_URL,
    LIFTTRUCKS_API_USERNAME: process.env.LIFTTRUCKS_API_USERNAME,
    LIFTTRUCKS_API_PASSWORD: process.env.LIFTTRUCKS_API_PASSWORD,
    LIFTTRUCKS_API_KEY: process.env.LIFTTRUCKS_API_KEY,
    AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING,
    GREENTREE_SYNC_TABLE_NAME: process.env.GREENTREE_SYNC_TABLE_NAME,
}

function restore() {
    Object.entries(originalEnvironment).forEach(([name, value]) => {
        if (value == null) delete process.env[name]
        else process.env[name] = value
    })
    global.fetch = originalFetch
    resetGreenTreeSyncCheckpointStore()
}

test.afterEach(restore)

delete process.env.AZURE_STORAGE_CONNECTION_STRING

test('normalises the GreenTree modified-job collection', () => {
    const jobs = client.greenTreeJobsFromPayload([{ JCJobs: [
        { Code: '146123', IsClosed: true, IsFinalised: false, CompleteDate: '2026-09-23', ModifiedTimeStamp: '2026-09-23T08:36:40', Status: 'Finished & Invoiced' },
    ] }]).map(client.greenTreeJobSummary)
    assert.deepEqual(jobs, [{ code: '146123', isClosed: true, isFinalised: false, completeDate: '2026-09-23', modifiedTimeStamp: '2026-09-23T08:36:40', status: 'Finished & Invoiced' }])
})

test('requests modified jobs with server-only credentials', async () => {
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    process.env.LIFTTRUCKS_API_KEY = 'server-key'
    const jobs = await client.fetchGreenTreeJobsModifiedSince('2026-10-09T06:00:00', {
        fetchImpl: async (url, options) => {
            assert.equal(url.searchParams.get('modifiedSince'), '2026-10-09T06:00:00')
            assert.equal(url.searchParams.get('ApiKey'), 'server-key')
            assert.match(options.headers.Authorization, /^Basic /)
            return Response.json([{ JCJobs: [{ Code: '147223', IsClosed: false }] }])
        },
    })
    assert.equal(jobs[0].code, '147223')
    assert.equal(jobs[0].isClosed, false)
})

test('pages a full modified-job result and deduplicates overlapping records', async () => {
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    process.env.LIFTTRUCKS_API_KEY = 'server-key'
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
        Code: String(147000 + index), IsClosed: false, ModifiedTimeStamp: '2026-10-09T08:00:00',
    }))
    let calls = 0
    const jobs = await client.fetchGreenTreeJobsModifiedSince('2026-10-09T06:00:00', {
        fetchImpl: async (url) => {
            calls += 1
            assert.equal(url.searchParams.get('pageSize'), '100')
            assert.equal(url.searchParams.get('page'), String(calls))
            return calls === 1
                ? Response.json([{ JCJobs: firstPage }])
                : Response.json([{ JCJobs: [
                    { Code: '147099', IsClosed: true, ModifiedTimeStamp: '2026-10-09T08:05:00' },
                    { Code: '147100', IsClosed: false, ModifiedTimeStamp: '2026-10-09T08:06:00' },
                ] }])
        },
    })
    assert.equal(calls, 2)
    assert.equal(jobs.length, 101)
    assert.equal(jobs.find((job) => job.code === '147099').isClosed, true)
})

test('fails closed when every page reaches the configured safety limit', async () => {
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    process.env.LIFTTRUCKS_API_KEY = 'server-key'
    const fullPage = Array.from({ length: 100 }, (_, index) => ({ Code: String(index + 1) }))
    await assert.rejects(
        client.fetchGreenTreeJobsModifiedSince('2026-10-09T06:00:00', {
            maxPages: 1,
            fetchImpl: async () => Response.json([{ JCJobs: fullPage }]),
        }),
        /safety limit/,
    )
})

test('rejects anonymous delta requests before calling GreenTree', { concurrency: false }, async () => {
    let calls = 0
    global.fetch = async () => { calls += 1; throw new Error('unexpected request') }
    const context = {}
    await endpoint(context, { method: 'GET', headers: {}, query: { modifiedSince: new Date().toISOString() } })
    assert.equal(context.res.status, 401)
    assert.equal(calls, 0)
})

test('localhost accepts only a delegated bearer token and leaves Dataverse to enforce it', () => {
    assert.equal(endpoint._test.acceptDelegatedBearerForLocalDevelopment({ headers: {} }), null)
    assert.equal(endpoint._test.acceptDelegatedBearerForLocalDevelopment({
        headers: { 'x-dataverse-authorization': 'Bearer local-token' },
    }), 'Bearer local-token')
})

test('localhost synchronization does not open the shared production checkpoint store', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    process.env.LIFTTRUCKS_API_KEY = 'server-key'
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'not-a-connection-string'
    global.fetch = async () => Response.json([{ JCJobs: [] }])
    const context = {}
    await endpoint.localDevelopment(context, {
        method: 'POST',
        headers: { 'X-Dataverse-Authorization': 'Bearer local-token' },
        body: { modifiedSince: new Date().toISOString() },
    })
    assert.equal(context.res.status, 200)
})

test('returns a summary-only delta response to an authenticated user', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    process.env.LIFTTRUCKS_API_KEY = 'server-key'
    const now = new Date()
    global.fetch = async (url) => {
        if (String(url).endsWith('/WhoAmI')) return Response.json({ UserId: '00000000-0000-4000-8000-000000000001' })
        return Response.json([{ JCJobs: [{ Code: '147223', IsClosed: true, CompleteDate: '2026-10-09', ModifiedTimeStamp: '2026-10-09T08:00:00', Status: 'Finished' }] }])
    }
    const context = {}
    await endpoint(context, { method: 'GET', headers: { Authorization: 'Bearer valid-token' }, query: { modifiedSince: now.toISOString() } })
    assert.equal(context.res.status, 200)
    const body = JSON.parse(context.res.body)
    assert.equal(body.count, 1)
    assert.deepEqual(body.jobs[0], { code: '147223', isClosed: true, isFinalised: false, completeDate: '2026-10-09', modifiedTimeStamp: '2026-10-09T08:00:00', status: 'Finished' })
})

test('accepts the delegated Dataverse token from the application header', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    process.env.LIFTTRUCKS_API_KEY = 'server-key'
    global.fetch = async (url) => {
        if (String(url).endsWith('/WhoAmI')) return Response.json({ UserId: '00000000-0000-4000-8000-000000000001' })
        return Response.json([{ JCJobs: [] }])
    }
    const context = {}
    await endpoint(context, {
        method: 'GET',
        headers: { 'X-Dataverse-Authorization': 'Bearer valid-token' },
        query: { modifiedSince: new Date().toISOString() },
    })
    assert.equal(context.res.status, 200)
})

test('authenticated POST reconciles a GreenTree change into Dataverse', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    process.env.LIFTTRUCKS_API_KEY = 'server-key'
    const calls = []
    global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options })
        if (String(url).endsWith('/WhoAmI')) return Response.json({ UserId: '00000000-0000-4000-8000-000000000001' })
        if (String(url).startsWith('https://webview.liftrucks.co.nz/')) return Response.json([{ JCJobs: [{ Code: '147223', IsClosed: true }] }])
        if (String(url).includes('/gr_jobs?')) return Response.json({ value: [{
            '@odata.etag': 'W/"1"', gr_jobid: '00000000-0000-4000-8000-000000000002',
            gr_jobnumber: '147223', gr_gtentered: false, gr_status: 122830001,
        }] })
        if (options.method === 'PATCH') return new Response(null, { status: 204 })
        throw new Error(`Unexpected request: ${url}`)
    }
    const context = {}
    await endpoint(context, {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        query: {},
        body: { modifiedSince: new Date().toISOString() },
    })
    assert.equal(context.res.status, 200)
    const body = JSON.parse(context.res.body)
    assert.equal(body.updated, 1)
    assert.equal(body.movedToCompletionReview, 1)
    const patch = calls.find((call) => call.options.method === 'PATCH')
    assert.deepEqual(JSON.parse(patch.options.body), { gr_gtentered: true, gr_status: 122830004 })
})

test('limits diagnostic lookback to 24 hours', () => {
    const now = Date.parse('2026-10-09T10:00:00Z')
    assert.equal(endpoint._test.parseModifiedSince('2026-10-09T09:00:00Z', now), '2026-10-09T22:00:00')
    assert.equal(endpoint._test.parseModifiedSince('2026-10-08T09:59:59Z', now), null)
})

test('formats persistent UTC checkpoints as GreenTree Auckland wall time', () => {
    assert.equal(endpoint._test.formatGreenTreeModifiedSince(Date.parse('2026-01-09T08:00:00Z')), '2026-01-09T21:00:00')
    assert.equal(endpoint._test.formatGreenTreeModifiedSince(Date.parse('2026-07-09T08:00:00Z')), '2026-07-09T20:00:00')
})

test('reconciliation marks matched jobs entered and sends closed jobs to completion review', async () => {
    const patches = []
    const result = await reconcileGreenTreeJobs({
        jobs: [
            { code: '147223', isClosed: true },
            { code: '147224', isClosed: false },
            { code: 'MISSING', isClosed: true },
        ],
        dataverseOrigin: 'https://example.crm.dynamics.com',
        authorization: 'Bearer valid-token',
        fetchImpl: async (url, options) => {
            if (!options.method) return Response.json({ value: [
                { '@odata.etag': 'W/"1"', gr_jobid: '00000000-0000-4000-8000-000000000001', gr_jobnumber: '147223', gr_gtentered: false, gr_status: 122830000 },
                { '@odata.etag': 'W/"2"', gr_jobid: '00000000-0000-4000-8000-000000000002', gr_jobnumber: '147224', gr_gtentered: false, gr_status: 122830001 },
            ] })
            patches.push({ url: String(url), options })
            return new Response(null, { status: 204 })
        },
    })
    assert.equal(result.received, 3)
    assert.equal(result.matched, 2)
    assert.equal(result.updated, 2)
    assert.equal(result.markedEntered, 2)
    assert.equal(result.movedToCompletionReview, 1)
    assert.deepEqual(result.unmatched, ['MISSING'])
    assert.deepEqual(JSON.parse(patches[0].options.body), { gr_gtentered: true, gr_status: 122830004 })
    assert.deepEqual(JSON.parse(patches[1].options.body), { gr_gtentered: true })
})

test('reconciliation never reopens a complete job and refuses duplicate job numbers', async () => {
    let patchCalls = 0
    const result = await reconcileGreenTreeJobs({
        jobs: [{ code: '147223', isClosed: true }, { code: '147224', isClosed: true }],
        dataverseOrigin: 'https://example.crm.dynamics.com',
        authorization: 'Bearer valid-token',
        fetchImpl: async (_url, options) => {
            if (!options.method) return Response.json({ value: [
                { gr_jobid: '1', gr_jobnumber: '147223', gr_gtentered: true, gr_status: 122830003 },
                { gr_jobid: '2', gr_jobnumber: '147224', gr_gtentered: false, gr_status: 122830001 },
                { gr_jobid: '3', gr_jobnumber: '147224', gr_gtentered: false, gr_status: 122830001 },
            ] })
            patchCalls += 1
            return new Response(null, { status: 204 })
        },
    })
    assert.equal(result.alreadyComplete, 1)
    assert.deepEqual(result.conflicts, ['147224'])
    assert.equal(patchCalls, 0)
})

test('reconciliation marks a matching unregistered Job Book entry as entered', async () => {
    const patches = []
    const result = await reconcileGreenTreeJobs({
        jobs: [{ code: '147225', isClosed: false }],
        dataverseOrigin: 'https://example.crm.dynamics.com',
        authorization: 'Bearer valid-token',
        fetchImpl: async (url, options = {}) => {
            if (!options.method && String(url).includes('/gr_jobs?')) return Response.json({ value: [] })
            if (!options.method && String(url).includes('/gr_jobbookentries?')) return Response.json({ value: [{
                '@odata.etag': 'W/"3"', gr_jobbookentryid: 'entry-1', gr_jobnumber: '147225',
                gr_entered: false, gr_stage: 122830000,
            }] })
            if (options.method === 'PATCH') { patches.push({ url: String(url), options }); return new Response(null, { status: 204 }) }
            throw new Error(`Unexpected request: ${url}`)
        },
    })
    assert.equal(result.matched, 1)
    assert.equal(result.intakeMatched, 1)
    assert.equal(result.intakeUpdated, 1)
    assert.deepEqual(result.unmatched, [])
    assert.match(patches[0].url, /gr_jobbookentries\(entry-1\)$/)
    assert.deepEqual(JSON.parse(patches[0].options.body), { gr_entered: true })
})

test('checkpoint uses overlap, enforces cooldown, and preserves the watermark after failure', async () => {
    let entity
    const updates = []
    const table = {
        createTable: async () => undefined,
        getEntity: async () => {
            if (!entity) throw Object.assign(new Error('missing'), { statusCode: 404 })
            return { ...entity }
        },
        createEntity: async (value) => { entity = { ...value, etag: 'W/"1"' }; return { etag: entity.etag } },
        updateEntity: async (value, mode, options) => {
            updates.push({ value: { ...value }, mode, options })
            entity = { ...entity, ...value, etag: 'W/"2"' }
            return { etag: entity.etag }
        },
    }
    const store = new AzureGreenTreeSyncCheckpointStore(table)
    const firstAt = Date.parse('2026-10-09T08:00:00Z')
    const first = await store.begin(firstAt)
    assert.equal(Date.parse(first.modifiedSince), firstAt - checkpointConstants.INITIAL_LOOKBACK_MS)
    await store.complete(first)
    assert.equal(entity.lastSuccessfulAt, first.checkedThrough)
    assert.deepEqual(await store.begin(firstAt + 60_000), { skipped: true, reason: 'cooldown' })

    const secondAt = firstAt + checkpointConstants.COOLDOWN_MS + 1
    const second = await store.begin(secondAt)
    assert.equal(Date.parse(second.modifiedSince), firstAt - checkpointConstants.OVERLAP_MS)
    await store.fail(second)
    assert.equal(entity.lastSuccessfulAt, first.checkedThrough)
    assert.equal(entity.leaseUntil, '')
    assert.equal(updates.at(-1).mode, 'Merge')
})
