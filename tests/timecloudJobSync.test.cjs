const assert = require('node:assert/strict')
const test = require('node:test')
const service = require('../api/services/timecloudJobService')

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const originalEnvironment = { ...process.env }

function request(body = {}) {
    return { method: 'POST', headers: { authorization: 'Bearer delegated-token' }, body: { trigger: 'manual', ...body } }
}

function responseBody(result) {
    return JSON.parse(result.body)
}

test.beforeEach(() => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    service._test.resetTokenCache()
})

test.after(() => {
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnvironment, key)) delete process.env[key]
    Object.assign(process.env, originalEnvironment)
})

test('TimeCloud test Job names are disposable, single-line and bounded without changing the Job Number prefix', () => {
    assert.equal(service._test.buildTimecloudJobName('146781', ' Deliver\n to   site by PTS '), '146781 [TEST ONLY - SAFE TO DELETE] Deliver to site by PTS')
    const result = service._test.buildTimecloudJobName('146781', 'x'.repeat(1000))
    assert.equal(result.length, 250)
    assert.match(result, /^146781 \[TEST ONLY - SAFE TO DELETE\] /)
    assert.equal(service._test.buildTimecloudJobName('146781', 'Deliver', 'production'), '146781 Deliver')
})

test('TimeCloud creation stays disabled until explicitly enabled and defaults to test mode', () => {
    const keys = [
        'TIMECLOUD_JOB_CREATION_ENABLED', 'TIMECLOUD_JOB_MODE', 'TIMECLOUD_CLIENT_ID',
        'TIMECLOUD_API_USERNAME', 'TIMECLOUD_API_PASSWORD', 'TIMECLOUD_INTEGRATOR_KEY',
    ]
    const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    try {
        Object.assign(process.env, {
            TIMECLOUD_CLIENT_ID: 'client', TIMECLOUD_API_USERNAME: 'user', TIMECLOUD_API_PASSWORD: 'password',
            TIMECLOUD_INTEGRATOR_KEY: 'key', TIMECLOUD_JOB_CREATION_ENABLED: 'false',
        })
        delete process.env.TIMECLOUD_JOB_MODE
        assert.equal(service._test.timecloudCreationEnabled(), false)
        assert.equal(service._test.timecloudSettings().mode, 'test')
        process.env.TIMECLOUD_JOB_CREATION_ENABLED = 'true'
        assert.equal(service._test.timecloudCreationEnabled(), true)
        assert.equal(service._test.timecloudSettings().mode, 'test')
        process.env.TIMECLOUD_JOB_MODE = 'invalid'
        assert.equal(service._test.timecloudSettings(), null)
        process.env.TIMECLOUD_JOB_MODE = 'production'
        assert.equal(service._test.timecloudSettings().mode, 'production')
    } finally {
        for (const key of keys) before[key] === undefined ? delete process.env[key] : process.env[key] = before[key]
    }
})

test('disabled creation and automatic test-mode registration stop before application credentials or TimeCloud', async () => {
    const jobId = id(1)
    const ledgerId = id(2)
    let applicationTokenCalls = 0
    const fetchImpl = async (url) => String(url).endsWith('/WhoAmI')
        ? Response.json({ UserId: id(9) })
        : Response.json({ gr_jobbookentryid: ledgerId, gr_jobnumber: '146781', gr_stage: 122830004, _gr_registeredjob_value: jobId })
    const base = { fetchImpl, getApplicationToken: async () => { applicationTokenCalls += 1; return 'application-token' } }

    const disabled = await service.sync(request({ book: 'auckland', jobId, ledgerId, trigger: 'automatic' }), { ...base, enabled: false })
    assert.deepEqual(responseBody(disabled), {
        jobId, jobNumber: '146781', timecloudEntered: false, created: false, skipped: true, reason: 'disabled',
    })
    const testAutomatic = await service.sync(request({ book: 'auckland', jobId, ledgerId, trigger: 'automatic' }), {
        ...base, enabled: true, settings: () => ({ mode: 'test' }),
    })
    assert.deepEqual(responseBody(testAutomatic), {
        jobId, jobNumber: '146781', timecloudEntered: false, created: false, skipped: true, reason: 'test-mode-manual-only',
    })
    assert.equal(applicationTokenCalls, 0)
})

test('exact matching uses the Job Number as the first complete name token', () => {
    assert.equal(service._test.exactJobNumberMatch({ name: '146781 Deliver to site' }, '146781'), true)
    assert.equal(service._test.exactJobNumberMatch({ name: '146781A Other work' }, '146781'), false)
    assert.equal(service._test.exactJobNumberMatch({ name: 'WJ1234 Repair' }, 'wj1234'), true)
})

test('token acquisition uses the dedicated API user and caches the temporary token', async () => {
    const calls = []
    const settings = {
        authUrl: 'https://auth.jointimecloud.com/oauth/token', clientId: 'public-client', username: 'api@example.invalid',
        password: 'secret', audience: 'https://prod.editmytime.com/',
    }
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) })
        return Response.json({ access_token: 'temporary-token', token_type: 'Bearer', expires_in: 86400 })
    }
    assert.equal(await service._test.accessToken(settings, fetchImpl, 1000), 'temporary-token')
    assert.equal(await service._test.accessToken(settings, fetchImpl, 2000), 'temporary-token')
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].body, {
        grant_type: 'password', client_id: 'public-client', username: 'api@example.invalid', password: 'secret', audience: 'https://prod.editmytime.com/',
    })
})

test('Job search sends both TimeCloud authentication headers and rejects ambiguous exact matches', async () => {
    const headers = []
    const settings = { apiUrl: 'https://api.jointimecloud.com', integratorKey: 'integrator-key' }
    await assert.rejects(service._test.findTimecloudJob(settings, 'temporary-token', '146781', '146781 Deliver', async (_url, init) => {
        headers.push(init.headers)
        return Response.json({ data: [
            { _id: 'one', code: '1', name: '146781 Deliver' },
            { _id: 'two', code: '2', name: '146781 Deliver' },
        ] })
    }), /multiple active Job Items/)
    assert.equal(headers[0].Authorization, 'Bearer temporary-token')
    assert.equal(headers[0]['X-Timecloud-Integrator-Key'], 'integrator-key')
})

test('test mode marks the TimeCloud payload with a removable custom code', async () => {
    let payload
    const settings = {
        apiUrl: 'https://api.jointimecloud.com', integratorKey: 'integrator-key', layerId: 'job-number-layer', mode: 'test',
    }
    const item = await service._test.createTimecloudJob(settings, 'temporary-token', '146781 [TEST ONLY - SAFE TO DELETE] Deliver', async (_url, init) => {
        payload = JSON.parse(init.body)
        return Response.json({ data: { _id: 'item-id', code: '26958', name: payload.name } })
    })
    assert.equal(item._id, 'item-id')
    assert.equal(payload.customCode, 'JOBBOOK-TEST-ONLY')
    assert.equal(payload.layerId, 'job-number-layer')
    assert.equal(Object.hasOwn(payload, 'geofenceId'), false)
})

test('registered Job sync creates one TimeCloud item and conditionally records its identity in Dataverse', async () => {
    const jobId = id(1)
    const ledgerId = id(2)
    const requests = []
    let createCalls = 0
    const fetchImpl = async (url, init = {}) => {
        const target = String(url)
        requests.push({ target, init })
        if (target.endsWith('/WhoAmI')) return Response.json({ UserId: id(9) })
        if (target.includes('gr_jobbookentries(')) return Response.json({
            gr_jobbookentryid: ledgerId, gr_jobnumber: '146781', gr_stage: 122830004, _gr_registeredjob_value: jobId,
        })
        if (target.includes('gr_jobs(') && init.method === 'PATCH') {
            assert.equal(init.headers['If-Match'], 'W/"7"')
            assert.deepEqual(JSON.parse(init.body), {
                gr_timecloudentered: true, gr_timecloudjobitemid: '6aab1673160d0477d2e3e07d', gr_timecloudcode: '26958',
            })
            return Response.json({
                gr_timecloudentered: true, gr_timecloudjobitemid: '6aab1673160d0477d2e3e07d', gr_timecloudcode: '26958', '@odata.etag': 'W/"8"',
            })
        }
        if (target.includes('gr_jobs(')) return Response.json({
            gr_jobid: jobId, gr_jobnumber: '146781', gr_description: 'Deliver to site by PTS', gr_timecloudentered: false,
            gr_timecloudjobitemid: null, gr_timecloudcode: null, gr_registrationvoid: false, '@odata.etag': 'W/"7"',
        })
        throw new Error(`Unexpected request: ${target}`)
    }
    const result = await service.sync(request({ book: 'auckland', jobId, ledgerId }), {
        fetchImpl,
        enabled: true,
        getApplicationToken: async () => 'application-token',
        settings: () => ({ configured: true, mode: 'test' }),
        accessToken: async () => 'temporary-token',
        findTimecloudJob: async () => null,
        createTimecloudJob: async (_settings, _token, name) => {
            createCalls += 1
            assert.equal(name, '146781 [TEST ONLY - SAFE TO DELETE] Deliver to site by PTS')
            return { _id: '6aab1673160d0477d2e3e07d', code: '26958', name }
        },
    })
    assert.equal(result.status, 201)
    assert.equal(createCalls, 1)
    assert.deepEqual(responseBody(result), {
        jobId, jobNumber: '146781', timecloudJobItemId: '6aab1673160d0477d2e3e07d', timecloudCode: '26958',
        timecloudEntered: true, created: true, etag: 'W/"8"',
    })
    assert.equal(requests.filter(({ init }) => init.method === 'PATCH').length, 1)
})

test('retry reconciles an existing exact TimeCloud item without creating a duplicate', async () => {
    const jobId = id(1)
    const ledgerId = id(2)
    let createCalls = 0
    const item = { _id: 'existing-item', code: '26958', name: '146781 [TEST ONLY - SAFE TO DELETE] Deliver to site by PTS' }
    const fetchImpl = async (url, init = {}) => {
        const target = String(url)
        if (target.endsWith('/WhoAmI')) return Response.json({ UserId: id(9) })
        if (target.includes('gr_jobbookentries(')) return Response.json({ gr_jobbookentryid: ledgerId, gr_jobnumber: '146781', gr_stage: 122830004, _gr_registeredjob_value: jobId })
        if (target.includes('gr_jobs(') && init.method === 'PATCH') return Response.json({ gr_timecloudentered: true, gr_timecloudjobitemid: item._id, gr_timecloudcode: item.code, '@odata.etag': 'W/"8"' })
        if (target.includes('gr_jobs(')) return Response.json({ gr_jobid: jobId, gr_jobnumber: '146781', gr_description: 'Deliver to site by PTS', gr_timecloudentered: false, gr_registrationvoid: false, '@odata.etag': 'W/"7"' })
        throw new Error(`Unexpected request: ${target}`)
    }
    const result = await service.sync(request({ book: 'auckland', jobId, ledgerId }), {
        fetchImpl,
        enabled: true,
        getApplicationToken: async () => 'application-token',
        settings: () => ({ configured: true, mode: 'test' }),
        accessToken: async () => 'temporary-token',
        findTimecloudJob: async () => item,
        createTimecloudJob: async () => { createCalls += 1 },
    })
    assert.equal(result.status, 200)
    assert.equal(responseBody(result).created, false)
    assert.equal(createCalls, 0)
})

test('Dataverse confirmation failures expose a redacted reason with the HTTP status and safe error code', async () => {
    const jobId = id(1)
    const ledgerId = id(2)
    const item = { _id: 'existing-item', code: '26958', name: '146781 [TEST ONLY - SAFE TO DELETE] Deliver to site by PTS' }
    const fetchImpl = async (url, init = {}) => {
        const target = String(url)
        if (target.endsWith('/WhoAmI')) return Response.json({ UserId: id(9) })
        if (target.includes('gr_jobbookentries(')) return Response.json({ gr_jobbookentryid: ledgerId, gr_jobnumber: '146781', gr_stage: 122830004, _gr_registeredjob_value: jobId })
        if (target.includes('gr_jobs(') && init.method === 'PATCH') return Response.json({ error: { code: '0x80040265', message: `Principal ${id(99)} <person@example.invalid> is missing prvWritegr_Job` } }, { status: 400 })
        if (target.includes('gr_jobs(')) return Response.json({ gr_jobid: jobId, gr_jobnumber: '146781', gr_description: 'Deliver to site by PTS', gr_timecloudentered: false, gr_registrationvoid: false, '@odata.etag': 'W/"7"' })
        throw new Error(`Unexpected request: ${target}`)
    }
    const result = await service.sync(request({ book: 'auckland', jobId, ledgerId }), {
        fetchImpl,
        enabled: true,
        getApplicationToken: async () => 'application-token',
        settings: () => ({ configured: true, mode: 'test' }),
        accessToken: async () => 'temporary-token',
        findTimecloudJob: async () => item,
    })
    assert.equal(result.status, 503)
    assert.match(responseBody(result).error, /Dataverse HTTP 400, code 0x80040265/)
    assert.match(responseBody(result).error, /Principal <id> <email> is missing prvWritegr_Job/)
    assert.doesNotMatch(responseBody(result).error, new RegExp(id(99)))
    assert.doesNotMatch(responseBody(result).error, /person@example/)
})

test('invalid ledger linkage is rejected before TimeCloud or application credentials are used', async () => {
    const jobId = id(1)
    const ledgerId = id(2)
    let applicationTokenCalls = 0
    const result = await service.sync(request({ book: 'auckland', jobId, ledgerId }), {
        fetchImpl: async (url) => String(url).endsWith('/WhoAmI')
            ? Response.json({ UserId: id(9) })
            : Response.json({ gr_jobbookentryid: ledgerId, gr_jobnumber: '146781', gr_stage: 122830004, _gr_registeredjob_value: id(3) }),
        getApplicationToken: async () => { applicationTokenCalls += 1; return 'application-token' },
    })
    assert.equal(result.status, 409)
    assert.equal(applicationTokenCalls, 0)
})
