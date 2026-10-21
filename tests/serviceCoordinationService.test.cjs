const assert = require('node:assert/strict')
const test = require('node:test')
const { handleServiceCoordination, _test } = require('../api/services/serviceCoordinationService')

const originalDataverseUrl = process.env.DATAVERSE_URL
test.before(() => { process.env.DATAVERSE_URL = 'https://org0d4246d7.crm6.dynamics.com' })
test.after(() => {
    if (originalDataverseUrl === undefined) delete process.env.DATAVERSE_URL
    else process.env.DATAVERSE_URL = originalDataverseUrl
})

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const userId = id(1)
const jobId = id(2)
const watchId = id(3)
const request = (overrides = {}) => ({
    method: 'GET', headers: { 'x-dataverse-authorization': 'Bearer delegated' }, query: { view: 'context' }, body: {}, ...overrides,
})

function fetchFor(routes, calls = []) {
    return async (url, options = {}) => {
        const value = String(url)
        calls.push([value, options])
        const route = Object.entries(routes).find(([needle]) => value.includes(needle))
        if (!route) return new Response(null, { status: 404 })
        return typeof route[1] === 'function' ? route[1](value, options) : Response.json(route[1])
    }
}

test('service coordination rejects disabled and anonymous requests without Dataverse reads', async () => {
    let calls = 0
    const disabled = await handleServiceCoordination(request(), { enabled: false, fetchImpl: async () => { calls++; return Response.json({}) } })
    assert.equal(disabled.status, 503)
    const anonymous = await handleServiceCoordination(request({ headers: {} }), { enabled: true, fetchImpl: async () => { calls++; return Response.json({}) } })
    assert.equal(anonymous.status, 401)
    assert.equal(calls, 0)
})

test('context derives the caller and fails closed when the home branch is missing', async () => {
    const base = { WhoAmI: { UserId: userId }, [`systemusers(${userId})`]: { systemuserid: userId, fullname: 'Coordinator' } }
    const missing = await handleServiceCoordination(request(), { enabled: true, fetchImpl: fetchFor(base) })
    assert.equal(missing.status, 409)
    assert.equal(JSON.parse(missing.body).code, 'branch-not-configured')
    const configured = await handleServiceCoordination(request(), { enabled: true, fetchImpl: fetchFor({ ...base, [`systemusers(${userId})`]: { systemuserid: userId, gr_serviceoperationsbranch: 122830003 } }) })
    assert.deepEqual(JSON.parse(configured.body), { branch: { value: 122830003, label: 'Christchurch' } })
    assert.equal(configured.headers['Cache-Control'], 'private, no-store')
})

test('watch add derives watcher while delegated Create owns the row and is idempotent under a uniqueness conflict', async () => {
    const calls = []
    let lookup = 0
    const result = await handleServiceCoordination(request({ method: 'POST', query: {}, body: { action: 'watch', jobId } }), {
        enabled: true,
        fetchImpl: fetchFor({
            WhoAmI: { UserId: userId },
            [`gr_jobs(${jobId})`]: { gr_jobid: jobId, gr_coordinatormanaged: true },
            'gr_jobwatchs?': () => Response.json({ value: ++lookup === 1 ? [] : [{ gr_jobwatchid: watchId }] }),
            '/gr_jobwatchs': (_url, options) => options.method === 'POST' ? new Response(null, { status: 409 }) : new Response(null, { status: 404 }),
        }, calls),
    })
    assert.equal(result.status, 200)
    assert.deepEqual(JSON.parse(result.body), { watched: true, created: false })
    const post = calls.find(([, options]) => options.method === 'POST')
    const body = JSON.parse(post[1].body)
    assert.equal(body['gr_Watcher@odata.bind'], `/systemusers(${userId})`)
    assert.equal(Object.hasOwn(body, 'ownerid@odata.bind'), false)
    assert.equal(body['gr_Job@odata.bind'], `/gr_jobs(${jobId})`)
})

test('watch add rejects a Job that is not explicitly managed', async () => {
    const calls = []
    const result = await handleServiceCoordination(request({ method: 'POST', query: {}, body: { action: 'watch', jobId } }), {
        enabled: true,
        fetchImpl: fetchFor({
            WhoAmI: { UserId: userId },
            [`gr_jobs(${jobId})`]: { gr_jobid: jobId, gr_coordinatormanaged: false },
        }, calls),
    })
    assert.equal(result.status, 404)
    assert.deepEqual(JSON.parse(result.body), { code: 'job-unavailable', error: 'The Job is unavailable.' })
    assert.equal(calls.some(([url]) => url.includes('gr_jobwatchs')), false)
})

test('caller-supplied identity fields are rejected and unwatch only targets the caller-owned row', async () => {
    let reads = 0
    const injected = await handleServiceCoordination(request({ method: 'POST', query: {}, body: { action: 'watch', jobId, watcherId: id(9) } }), {
        enabled: true,
        fetchImpl: fetchFor({ WhoAmI: { UserId: userId } }),
    })
    assert.equal(injected.status, 400)
    const calls = []
    const removed = await handleServiceCoordination(request({ method: 'POST', query: {}, body: { action: 'unwatch', jobId } }), {
        enabled: true,
        fetchImpl: async (url, options = {}) => {
            calls.push([String(url), options])
            if (String(url).includes('WhoAmI')) return Response.json({ UserId: userId })
            if (String(url).includes('gr_jobwatchs?')) { reads++; return Response.json({ value: [{ gr_jobwatchid: watchId, '@odata.etag': 'W/"1"' }] }) }
            return new Response(null, { status: 204 })
        },
    })
    assert.equal(removed.status, 200)
    assert.equal(reads, 1)
    assert.match(calls.find(([, options]) => options.method === 'DELETE')[0], new RegExp(`gr_jobwatchs\\(${watchId}\\)$`))
    assert.equal(new URL(calls.find(([url]) => url.includes('gr_jobwatchs?'))[0]).searchParams.get('$filter'), `_gr_watcher_value eq ${userId} and _ownerid_value eq ${userId} and _gr_job_value eq ${jobId}`)
})

test('watch listing validates opaque continuation and excludes invalid, unmanaged, void, or GreenTree-closed expanded jobs', async () => {
    const next = `https://org0d4246d7.crm6.dynamics.com/api/data/v9.2/gr_jobwatchs?$skiptoken=safe`
    const calls = []
    const result = await handleServiceCoordination(request({ query: { view: 'watches' } }), {
        enabled: true,
        fetchImpl: fetchFor({
            WhoAmI: { UserId: userId },
            [`systemusers(${userId})`]: { systemuserid: userId },
            'gr_jobwatchs?': { value: [
                { gr_jobwatchid: watchId, _gr_job_value: jobId, createdon: '2026-10-19', gr_Job: { gr_jobid: jobId, gr_status: 122830001, gr_coordinatormanaged: true } },
                { gr_jobwatchid: id(10), _gr_job_value: id(11), gr_Job: { gr_jobid: id(11), gr_coordinatormanaged: false } },
                { gr_jobwatchid: id(4), _gr_job_value: id(5), gr_Job: { gr_jobid: id(5), gr_registrationvoid: true } },
                { gr_jobwatchid: id(6), _gr_job_value: id(7), gr_Job: { gr_jobid: id(7), gr_greentreestatus: 'closed' } },
                { gr_jobwatchid: id(8), _gr_job_value: id(9), gr_Job: { gr_jobid: id(9), gr_greentreestatus: 'finalised' } },
            ], '@odata.nextLink': next },
        }, calls),
    })
    const body = JSON.parse(result.body)
    assert.equal(body.items.length, 1)
    const filter = new URL(calls.find(([url]) => url.includes('gr_jobwatchs?'))[0]).searchParams.get('$filter')
    assert.match(filter, /gr_Job\/gr_greentreestatus eq null/)
    assert.match(filter, /gr_Job\/gr_greentreestatus ne 'closed'/)
    assert.match(filter, /gr_Job\/gr_greentreestatus ne 'finalised'/)
    assert.match(filter, /gr_Job\/gr_coordinatormanaged eq true/)
    assert.equal(Buffer.from(body.next, 'base64url').toString('utf8'), next)
    assert.throws(() => _test.decodeCursor(_test.encodeCursor('https://untrusted.invalid/api/data/v9.2/gr_jobwatchs'), 'https://org0d4246d7.crm6.dynamics.com'))
})
