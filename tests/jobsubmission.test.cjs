const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const submission = require('../api/jobsubmission/index')

const originalFetch = global.fetch
const originalEnvironment = { ...process.env }

test('Job Card link client uses the Static Web Apps-safe delegated token header', () => {
    const client = readFileSync('src/alpha/jobs/services/jobSubmissionLinkApi.ts', 'utf8')
    assert.match(client, /'X-Dataverse-Authorization': `Bearer \$\{accessToken\}`/)
})

test('local Job Card middleware reloads its server service to stay aligned with the hot client', () => {
    const config = readFileSync('vite.config.ts', 'utf8')
    assert.match(config, /require\.resolve\('\.\/api\/services\/jobSubmissionService'\)/)
    assert.match(config, /delete require\.cache\[servicePath\]/)
})

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

test('submission validation accepts multiple time entries, decimal hours, and parts', () => {
    const result = submission._test.validateSubmission(baseJob(), {
        story: 'Completed service',
        hourMeter: 2500,
        timeEntries: [
            { date: '2026-07-25', hours: 1.25, kilometres: 12 },
            { date: '2026-07-26', hours: 2.5, kilometres: 0 },
        ],
        parts: [{ description: 'Oil Filter', quantity: 1 }, { description: 'Grease', quantity: 2 }],
        furtherWorkRequired: false,
        safetyIssueIdentified: false,
    })
    assert.equal(result, '')
})

test('further work and safety details are required only when selected', () => {
    const common = { story: 'Completed', hourMeter: 2500, timeEntries: [], parts: [] }
    assert.match(submission._test.validateSubmission(baseJob(), {
        ...common, furtherWorkRequired: true, furtherWorkDetails: '', safetyIssueIdentified: false,
    }), /further work/i)
    assert.match(submission._test.validateSubmission(baseJob(), {
        ...common, furtherWorkRequired: false, safetyIssueIdentified: true, safetyIssueDetails: '',
    }), /safety issue/i)
    assert.equal(submission._test.validateSubmission(baseJob(), {
        ...common,
        furtherWorkRequired: true,
        furtherWorkDetails: 'Return with replacement hose',
        safetyIssueIdentified: true,
        safetyIssueDetails: 'Isolate until repaired',
    }), '')
})

test('expanded submission uses one change set and does not change operational Job fields', () => {
    configure()
    const request = submission._test.batchRequest(baseJob(), 'W/"10"', {
        story: 'Completed',
        hourMeter: 2510,
        timeEntries: [{ date: '2026-07-25', hours: 1.5, kilometres: 16 }],
        parts: [{ description: 'Hydraulic Hose', quantity: 2 }],
        furtherWorkRequired: true,
        furtherWorkDetails: 'Inspect mast rollers',
        safetyIssueIdentified: false,
    }, '2026-07-25T04:00:00.000Z')
    assert.match(request.payload, /POST https:\/\/example\.crm\.dynamics\.com\/api\/data\/v9\.2\/gr_jobcardsubmissiontimeentries/)
    assert.match(request.payload, /Content-ID: 1/)
    assert.match(request.payload, /Content-ID: 2/)
    assert.match(request.payload, /Content-ID: 3/)
    assert.match(request.payload, /"gr_totalhours":1\.5/)
    assert.match(request.payload, /POST https:\/\/example\.crm\.dynamics\.com\/api\/data\/v9\.2\/gr_jobmaterials/)
    assert.match(request.payload, /"gr_material":"Hydraulic Hose"/)
    assert.match(request.payload, /"gr_quantity":2/)
    assert.match(request.payload, /PATCH https:\/\/example\.crm\.dynamics\.com\/api\/data\/v9\.2\/gr_jobs\(/)
    assert.match(request.payload, /If-Match: W\/"10"/)
    assert.doesNotMatch(request.payload, /"gr_status"/)
    assert.doesNotMatch(request.payload, /"gr_completeddate"/)
    assert.doesNotMatch(request.payload, /"gr_hourmeter"/)
})

test('photo validation enforces type, size, count, and encoded byte length', () => {
    const common = {
        story: 'Completed', hourMeter: 2500, timeEntries: [], parts: [],
        furtherWorkRequired: false, safetyIssueIdentified: false,
    }
    assert.equal(submission._test.validateSubmission(baseJob(), {
        ...common,
        photos: [{ fileName: 'mast.jpg', mimeType: 'image/jpeg', size: 3, data: 'YWJj' }],
    }), '')
    assert.match(submission._test.validateSubmission(baseJob(), {
        ...common,
        photos: [{ fileName: 'mast.gif', mimeType: 'image/gif', size: 3, data: 'YWJj' }],
    }), /invalid/i)
    assert.match(submission._test.validateSubmission(baseJob(), {
        ...common,
        photos: [{ fileName: 'mast.jpg', mimeType: 'image/jpeg', size: 4, data: 'YWJj' }],
    }), /invalid/i)
})

test('photo persistence creates generic rows, uploads binary, and reuses upload identity', { concurrency: false }, async () => {
    configure()
    const calls = []
    global.fetch = async (url, options = {}) => {
        const value = String(url)
        calls.push({ value, options })
        if (value.includes('/gr_jobphotos?')) return Response.json({ value: [] })
        if (value.endsWith('/gr_jobphotos')) return Response.json({ gr_jobphotoid: 'photo-id' }, { status: 201 })
        if (value.includes('/gr_jobphotos(photo-id)/gr_photo')) return new Response(null, { status: 204 })
        throw new Error(`Unexpected request: ${value}`)
    }
    await submission._test.persistPhotos('t'.repeat(43), baseJob(), [{
        fileName: 'mast.jpg', mimeType: 'image/jpeg', size: 3, data: 'YWJj',
    }], 'Bearer app-token', '2026-07-25T04:00:00.000Z')
    assert.equal(calls.length, 3)
    const metadata = JSON.parse(calls[1].options.body)
    assert.equal(metadata.gr_filename, 'mast.jpg')
    assert.equal(metadata.gr_displayorder, 0)
    assert.equal(calls[2].options.method, 'PATCH')
    assert.equal(Buffer.from(calls[2].options.body).toString(), 'abc')
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

test('failed Dataverse submission returns a bounded diagnostic without exposing its response body', { concurrency: false }, async () => {
    configure()
    const job = baseJob()
    global.fetch = async (url) => {
        const value = String(url)
        if (value.includes('login.microsoftonline.com')) return Response.json({ access_token: 'app-token' })
        if (value.includes('/gr_jobs?')) return Response.json({ value: [job] })
        if (value.includes('/gr_jobs(')) return Response.json({
            error: { code: '0x80040265', message: 'Sensitive internal Dataverse detail' },
        }, { status: 400 })
        throw new Error(`Unexpected request: ${value}`)
    }
    const response = await invoke({
        method: 'POST', headers: {},
        body: { token: 'z'.repeat(43), story: 'Completed service', hourMeter: 2510 },
    })
    assert.equal(response.status, 503)
    assert.match(response.body, /Job submission update failed \(400, 0x80040265\)/)
    assert.doesNotMatch(response.body, /Sensitive internal Dataverse detail/)
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

test('link generation requires an authenticated office user', { concurrency: false }, async () => {
    configure()
    global.fetch = async () => new Response(null, { status: 401 })
    const response = await invoke({
        method: 'POST',
        headers: {},
        body: { action: 'generate', jobId: '00000000-0000-4000-8000-000000000001' },
    })
    assert.equal(response.status, 401)
    assert.match(response.body, /authentication/i)
})

test('link generation replaces the stored hash without changing Job workflows', { concurrency: false }, async () => {
    configure()
    let patch
    global.fetch = async (url, options = {}) => {
        const value = String(url)
        if (value.endsWith('/WhoAmI')) return Response.json({ UserId: 'office-user' })
        if (value.includes('/gr_jobs(') && options.method === 'PATCH') {
            patch = JSON.parse(options.body)
            return new Response(null, { status: 204 })
        }
        throw new Error(`Unexpected request: ${value}`)
    }
    const response = await invoke({
        method: 'POST',
        headers: { 'X-Dataverse-Authorization': 'Bearer office-token' },
        body: { action: 'generate', jobId: '00000000-0000-4000-8000-000000000001' },
    })
    assert.equal(response.status, 201)
    const result = JSON.parse(response.body)
    assert.match(result.path, /^\/portal\/job\/[A-Za-z0-9_-]{43}$/)
    assert.match(patch.gr_techniciansubmissiontokenhash, /^[a-f0-9]{64}$/)
    assert.equal(patch.gr_techniciansubmissiontokenused, false)
    assert.equal(patch.gr_status, undefined)
    assert.equal(patch.gr_jobcardstatus, undefined)
    assert.equal(JSON.stringify(patch).includes(result.path.slice('/portal/job/'.length)), false)
})

test('link generation accepts opaque Dataverse GUIDs without RFC version bits', { concurrency: false }, async () => {
    configure()
    let requestedUrl = ''
    global.fetch = async (url, options = {}) => {
        const value = String(url)
        if (value.endsWith('/WhoAmI')) return Response.json({ UserId: 'office-user' })
        if (value.includes('/gr_jobs(') && options.method === 'PATCH') {
            requestedUrl = value
            return new Response(null, { status: 204 })
        }
        throw new Error(`Unexpected request: ${value}`)
    }
    const response = await invoke({
        method: 'POST',
        headers: { Authorization: 'Bearer office-token' },
        body: { action: 'generate', jobId: 'df9a3779-4e83-f111-ab0f-0022489917ff' },
    })
    assert.equal(response.status, 201)
    assert.match(requestedUrl, /gr_jobs\(df9a3779-4e83-f111-ab0f-0022489917ff\)$/)
})
