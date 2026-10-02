const assert = require('node:assert/strict')
const test = require('node:test')
const submission = require('../api/jobsubmission/index')
const service = require('../api/services/jobSubmissionService')

const originalEnvironment = { ...process.env }
const originalFetch = global.fetch

function configure() {
    process.env.NODE_ENV = 'test'
    process.env.JOB_CARD_STORAGE_MODE = 'memory'
    process.env.JOB_CARD_LOCAL_DEVELOPMENT = 'true'
    process.env.JOB_CARD_NOTIFICATION_MODE = 'console'
    service.test.reset()
}

function restore() {
    global.fetch = originalFetch
    service.test.reset()
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key]
    Object.assign(process.env, originalEnvironment)
}

function snapshot(overrides = {}) {
    return {
        jobNumber: '145999',
        jobType: 122830001,
        workRequired: 'Service forklift',
        equipmentId: '00000000-0000-4000-8000-000000000002',
        equipmentDisplayName: 'Still RX60',
        fleetNumber: 'FN24',
        currentHourMeter: 2500,
        customerName: 'Example Customer',
        siteName: 'Workshop',
        technicianId: '00000000-0000-4000-8000-000000000003',
        technicianName: 'Test Technician',
        technicianEmail: 'technician@example.com',
        ...overrides,
    }
}

async function invoke(request) {
    const context = { log: { error() {} } }
    await submission(context, request)
    return context.res
}

async function generate(overrides = {}) {
    const response = await invoke({
        method: 'POST',
        headers: { authorization: 'Bearer local-office' },
        body: {
            action: 'generate',
            jobId: '00000000-0000-4000-8000-000000000001',
            snapshot: snapshot(),
            ...overrides,
        },
    })
    return { response, body: JSON.parse(response.body) }
}

test.beforeEach(configure)
test.afterEach(restore)

test('secure tokens are URL-safe, random, and stored only as hashes', async () => {
    const first = service.test.generateToken()
    const second = service.test.generateToken()
    assert.match(first, /^[A-Za-z0-9_-]{43}$/)
    assert.notEqual(first, second)
    assert.equal(service.test.hashToken(first).length, 64)
    const created = await generate()
    assert.equal(created.response.status, 201)
    assert.equal(JSON.stringify(created.response).includes(service.test.hashToken(created.body.token)), false)
})

test('public lookup returns only the snapshotted minimum and performs no Dataverse request', async () => {
    global.fetch = async () => { throw new Error('Public requests must not call Dataverse.') }
    const created = await generate()
    const response = await invoke({ method: 'GET', headers: {}, query: { token: created.body.token } })
    assert.equal(response.status, 200)
    const body = JSON.parse(response.body)
    assert.deepEqual(Object.keys(body).sort(), [
        'currentHourMeter', 'customerName', 'equipmentDisplayName', 'fleetNumber', 'jobNumber',
        'requiresHourMeter', 'siteName', 'technicianName', 'workRequired',
    ])
    assert.equal(body.technicianName, 'Test Technician')
})

test('production link generation reads a snapshot with the office token and makes no Dataverse write', async () => {
    delete process.env.JOB_CARD_LOCAL_DEVELOPMENT
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    const calls = []
    global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), method: options.method || 'GET', authorization: options.headers?.Authorization })
        if (String(url).endsWith('/WhoAmI')) return Response.json({ UserId: 'office-user-id' })
        if (String(url).includes('/gr_jobs(')) return Response.json({
            gr_jobid: '00000000-0000-4000-8000-000000000001', gr_jobnumber: '145999',
            gr_description: 'Service forklift', gr_jobtype: 122830001,
            gr_Equipment: { gr_equipmentid: '00000000-0000-4000-8000-000000000002', gr_make: 'Still', gr_model: 'RX60', gr_fleet: 'FN24', gr_currenthourmeter: 2500 },
            gr_Site: { gr_name: 'Workshop', gr_Customer: { gr_name: 'Example Customer' } },
            gr_Mechanic: { gr_mechanicid: '00000000-0000-4000-8000-000000000003', gr_name: 'Test Technician', gr_email: 'technician@example.com' },
        })
        throw new Error(`Unexpected request ${url}`)
    }
    const response = await invoke({ method: 'POST', headers: { authorization: 'Bearer office-token' }, body: {
        action: 'generate', jobId: '00000000-0000-4000-8000-000000000001',
    } })
    assert.equal(response.status, 201)
    assert.equal(calls.length, 2)
    assert.ok(calls.every((call) => call.method === 'GET'))
    assert.ok(calls.every((call) => call.authorization === 'Bearer office-token'))
})

test('submission validation preserves strict story, meter, child, and photo-reference rules', () => {
    const record = { jobType: 122830001, equipmentId: 'equipment', currentHourMeter: 2500 }
    assert.match(service.test.validateSubmission(record, { story: '', hourMeter: 2500 }), /story/i)
    assert.match(service.test.validateSubmission(record, { story: 'Done' }), /hour meter/i)
    assert.match(service.test.validateSubmission(record, { story: 'Done', hourMeter: 2499 }), /lower/i)
    assert.equal(service.test.validateSubmission(record, {
        story: 'Done', hourMeter: 2500,
        timeEntries: [{ date: '2026-07-25', hours: 1.25, kilometres: 12 }],
        parts: ['Oil filter'], furtherWorkRequired: false, safetyIssueIdentified: false, photos: [],
    }), '')
})

test('photo upload validates bytes and stores them privately before final submission', async () => {
    const created = await generate()
    const upload = await invoke({
        method: 'POST', headers: {}, body: {
            action: 'uploadPhoto', token: created.body.token,
            photo: { fileName: 'mast.jpg', mimeType: 'image/jpeg', size: 3, data: '/9j/' },
        },
    })
    assert.equal(upload.status, 201)
    assert.match(JSON.parse(upload.body).uploadId, /^[0-9a-f-]{36}$/)
    const invalid = await invoke({ method: 'POST', headers: {}, body: {
        action: 'uploadPhoto', token: created.body.token,
        photo: { fileName: 'mast.gif', mimeType: 'image/gif', size: 3, data: 'YWJj' },
    } })
    assert.equal(invalid.status, 400)
})

test('successful submission creates a pending review and replay is rejected', async () => {
    const created = await generate()
    const upload = await invoke({ method: 'POST', headers: {}, body: {
        action: 'uploadPhoto', token: created.body.token,
        photo: { fileName: 'mast.jpg', mimeType: 'image/jpeg', size: 3, data: '/9j/' },
    } })
    const uploadId = JSON.parse(upload.body).uploadId
    const request = {
        method: 'POST', headers: {}, body: {
            token: created.body.token, story: 'Completed service', hourMeter: 2510,
            timeEntries: [{ date: '2026-07-25', hours: 1.5, kilometres: 16 }],
            parts: ['Hydraulic hose'], furtherWorkRequired: true, furtherWorkDetails: 'Inspect rollers',
            safetyIssueIdentified: false, photos: [{ uploadId }],
        },
    }
    const response = await invoke(request)
    assert.equal(response.status, 200)
    const replay = await invoke(request)
    assert.equal(replay.status, 410)
    assert.match(replay.body, /already been submitted/i)

    const reviews = await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: {} })
    assert.equal(reviews.status, 200)
    const items = JSON.parse(reviews.body).items
    assert.equal(items.length, 1)
    assert.equal(items[0].jobNumber, '145999')
    assert.equal(items[0].photoCount, 1)
})

test('review details and photos require office authentication and can be marked reviewed', async () => {
    const created = await generate()
    const submitted = await invoke({ method: 'POST', headers: {}, body: {
        token: created.body.token, story: 'Completed', hourMeter: 2500,
        timeEntries: [], parts: [], furtherWorkRequired: false, safetyIssueIdentified: false, photos: [],
    } })
    assert.equal(submitted.status, 200)
    const unauthorized = await service.handleReviewRequest({ method: 'GET', headers: {}, query: {} })
    assert.equal(unauthorized.status, 401)
    const list = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: {} })).body)
    const reviewId = list.items[0].reviewId
    const reviewed = await service.handleReviewRequest({
        method: 'POST', headers: { authorization: 'Bearer office' }, query: { reviewId }, body: { action: 'markReviewed' },
    })
    assert.equal(JSON.parse(reviewed.body).status, 'reviewed')
    const empty = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: {} })).body)
    assert.equal(empty.items.length, 0)
})

test('creating a replacement link invalidates the previous active token', async () => {
    const first = await generate()
    const conflict = await generate()
    assert.equal(conflict.response.status, 409)
    const replacement = await generate({ replaceActive: true })
    assert.equal(replacement.response.status, 201)
    const oldLookup = await invoke({ method: 'GET', headers: {}, query: { token: first.body.token } })
    assert.equal(oldLookup.status, 404)
    const newLookup = await invoke({ method: 'GET', headers: {}, query: { token: replacement.body.token } })
    assert.equal(newLookup.status, 200)
})
