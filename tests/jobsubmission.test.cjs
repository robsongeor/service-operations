const assert = require('node:assert/strict')
const test = require('node:test')
const submission = require('../api/jobsubmission/index')

const originalFetch = global.fetch
const originalEnvironment = { ...process.env }

function restore() {
    global.fetch = originalFetch
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key]
    Object.assign(process.env, originalEnvironment)
}

function baseJob(overrides = {}) {
    return {
        gr_jobid: '00000000-0000-4000-8000-000000000001',
        gr_jobnumber: '145999',
        gr_description: 'Service forklift',
        gr_jobtype: 122830001,
        gr_status: 122830000,
        gr_jobcardstatus: 122830001,
        gr_techniciansubmissiontokenexpireson: new Date(Date.now() + 60_000).toISOString(),
        gr_techniciansubmissiontokenused: false,
        gr_Equipment: {
            gr_equipmentid: '00000000-0000-4000-8000-000000000002',
            gr_fleet: 'FN24',
            gr_make: 'Still',
            gr_model: 'RX60',
            gr_currenthourmeter: 2500,
        },
        gr_Site: { gr_name: 'Workshop', gr_Customer: { gr_name: 'Example Customer' } },
        '@odata.etag': 'W/"10"',
        ...overrides,
    }
}

async function invoke(request) {
    const context = { log: { error() {} } }
    await submission(context, request)
    return context.res
}

function configure() {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.DATAVERSE_TENANT_ID = 'tenant'
    process.env.DATAVERSE_CLIENT_ID = 'client'
    process.env.DATAVERSE_CLIENT_SECRET = 'secret'
}

function mockPublic(job, updateStatus = 204) {
    global.fetch = async (url, options = {}) => {
        const value = String(url)
        if (value.includes('login.microsoftonline.com')) return Response.json({ access_token: 'app-token' })
        if (value.includes('/gr_jobs?')) return Response.json({ value: job ? [job] : [] })
        if (value.includes('/gr_jobs(') && options.method === 'PATCH') return new Response('', { status: updateStatus })
        throw new Error(`Unexpected request: ${value}`)
    }
}

test.afterEach(restore)

test('secure tokens contain at least 32 bytes of URL-safe randomness', () => {
    const first = submission._test.generateToken()
    const second = submission._test.generateToken()
    assert.match(first, /^[A-Za-z0-9_-]{43}$/)
    assert.notEqual(first, second)
    assert.equal(submission._test.hashToken(first).length, 64)
})

test('public response includes only the dedicated minimum fields', () => {
    const result = submission._test.publicDetails(baseJob({ secretInternalNote: 'do not expose' }))
    assert.deepEqual(Object.keys(result).sort(), [
        'currentHourMeter', 'customerName', 'equipmentDisplayName', 'fleetNumber',
        'jobNumber', 'requiresHourMeter', 'siteName', 'workRequired',
    ])
    assert.equal(JSON.stringify(result).includes('secretInternalNote'), false)
})

test('submission validation requires story and valid service hour meter', () => {
    const job = baseJob()
    assert.match(submission._test.validateSubmission(job, { story: '', hourMeter: 2500 }), /story/i)
    assert.match(submission._test.validateSubmission(job, { story: 'Done' }), /hour meter/i)
    assert.match(submission._test.validateSubmission(job, { story: 'Done', hourMeter: 2499 }), /lower/i)
    assert.equal(submission._test.validateSubmission(job, { story: 'Done', hourMeter: 2500 }), '')
})

test('invalid token does not reveal Job data', { concurrency: false }, async () => {
    configure()
    mockPublic(null)
    const response = await invoke({ method: 'GET', headers: {}, query: { token: 'a'.repeat(43) } })
    assert.equal(response.status, 404)
    assert.match(response.body, /invalid/i)
    assert.doesNotMatch(response.body, /145999/)
})

test('expired and used tokens are rejected', { concurrency: false }, async () => {
    configure()
    mockPublic(baseJob({ gr_techniciansubmissiontokenexpireson: new Date(Date.now() - 60_000).toISOString() }))
    const expired = await invoke({ method: 'GET', headers: {}, query: { token: 'b'.repeat(43) } })
    assert.equal(expired.status, 410)
    assert.match(expired.body, /expired/i)

    mockPublic(baseJob({ gr_techniciansubmissiontokenused: true }))
    const used = await invoke({ method: 'GET', headers: {}, query: { token: 'c'.repeat(43) } })
    assert.equal(used.status, 410)
    assert.match(used.body, /already been submitted/i)
})

test('successful submission changes only pending fields and Job Card status', { concurrency: false }, async () => {
    configure()
    const job = baseJob()
    let patch
    global.fetch = async (url, options = {}) => {
        const value = String(url)
        if (value.includes('login.microsoftonline.com')) return Response.json({ access_token: 'app-token' })
        if (value.includes('/gr_jobs?')) return Response.json({ value: [job] })
        if (value.includes('/gr_jobs(')) {
            patch = { headers: options.headers, body: JSON.parse(options.body) }
            return new Response(null, { status: 204 })
        }
        throw new Error(`Unexpected request: ${value}`)
    }
    const response = await invoke({
        method: 'POST',
        headers: {},
        body: { token: 'd'.repeat(43), story: 'Completed service', hourMeter: 2510 },
    })
    assert.equal(response.status, 200)
    assert.equal(patch.headers['If-Match'], 'W/"10"')
    assert.equal(patch.body.gr_jobcardstatus, 122830002)
    assert.equal(patch.body.gr_techniciansubmissionhourmeter, 2510)
    assert.equal(patch.body.gr_techniciansubmissionstory, 'Completed service')
    assert.equal(patch.body.gr_status, undefined)
    assert.equal(patch.body.gr_completeddate, undefined)
    assert.equal(patch.body.gr_hourmeter, undefined)
})

test('concurrent repeat submission is rejected by ETag', { concurrency: false }, async () => {
    configure()
    mockPublic(baseJob(), 412)
    const response = await invoke({
        method: 'POST',
        headers: {},
        body: { token: 'e'.repeat(43), story: 'Completed service', hourMeter: 2510 },
    })
    assert.equal(response.status, 410)
    assert.match(response.body, /already been submitted/i)
})
