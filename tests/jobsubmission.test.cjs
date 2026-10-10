const assert = require('node:assert/strict')
const test = require('node:test')
const submission = require('../api/jobsubmission/index')
const service = require('../api/services/jobSubmissionService')
const statusAutomation = require('../api/services/jobOperationalStatusAutomation')

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
        'meterRecordedDateAvailable', 'requiresHourMeter', 'siteName', 'technicianName', 'workRequired',
    ])
    assert.equal(body.technicianName, 'Test Technician')
    assert.equal(body.meterRecordedDateAvailable, true)
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
    const response = await invoke({ method: 'POST', headers: { 'x-dataverse-authorization': 'Bearer office-token' }, body: {
        action: 'generate', jobId: '00000000-0000-4000-8000-000000000001', recipientEmail: 'georger@liftrucks.co.nz',
    } })
    assert.equal(response.status, 201)
    assert.equal(calls.length, 2)
    assert.ok(calls.every((call) => call.method === 'GET'))
    assert.ok(calls.every((call) => call.authorization === 'Bearer office-token'))
})

test('production link generation accepts a registered Job awaiting service-operator classification', async () => {
    delete process.env.JOB_CARD_LOCAL_DEVELOPMENT
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    global.fetch = async (url) => {
        if (String(url).endsWith('/WhoAmI')) return Response.json({ UserId: 'office-user-id' })
        if (String(url).includes('/gr_jobs(')) return Response.json({
            gr_jobid: '00000000-0000-4000-8000-000000000001', gr_jobnumber: '147174',
            gr_description: 'Inspect reported fault',
            gr_Equipment: { gr_equipmentid: '00000000-0000-4000-8000-000000000002', gr_make: 'Still', gr_model: 'FM-X25', gr_fleet: 'FN2131' },
            gr_Site: { gr_name: 'Kerrs Road', gr_Customer: { gr_name: 'Godfrey Hirst' } },
            gr_Mechanic: { gr_mechanicid: '00000000-0000-4000-8000-000000000003', gr_name: 'Test Technician', gr_email: 'georger@liftrucks.co.nz' },
        })
        throw new Error(`Unexpected request ${url}`)
    }
    const generated = await invoke({ method: 'POST', headers: { 'x-dataverse-authorization': 'Bearer office-token' }, body: {
        action: 'generate', jobId: '00000000-0000-4000-8000-000000000001', recipientEmail: 'georger@liftrucks.co.nz',
    } })
    assert.equal(generated.status, 201)
    const token = JSON.parse(generated.body).token
    const publicResponse = await invoke({ method: 'GET', headers: {}, query: { token } })
    assert.equal(publicResponse.status, 200)
    assert.equal(JSON.parse(publicResponse.body).requiresHourMeter, false)
})

test('submission validation preserves strict story, meter, child, and photo-reference rules', () => {
    const record = { jobType: 122830001, equipmentId: 'equipment', currentHourMeter: 2500 }
    assert.match(service.test.validateSubmission(record, { story: '', hourMeter: 2500 }), /story/i)
    assert.match(service.test.validateSubmission(record, { story: 'Done' }), /hour meter/i)
    assert.match(service.test.validateSubmission(record, { story: 'Done', hourMeter: 2499 }), /lower/i)
    for (const date of ['2026-02-30', '2999-01-01', 'not-a-date']) {
        assert.match(service.test.validateSubmission(record, { story: 'Done', hourMeter: 2500, hourMeterRecordedDate: date }), /meter-reading date/)
    }
    assert.equal(service.test.validateSubmission(record, {
        story: 'Done', hourMeter: 2500, hourMeterRecordedDate: '2026-07-25',
        timeEntries: [{ date: '2026-07-25', hours: 1.25, kilometres: 12 }],
        parts: [{ description: 'Oil filter', quantity: 2 }], furtherWorkRequired: false, safetyIssueIdentified: false, photos: [],
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
            parts: [{ description: 'Hydraulic hose', quantity: 1 }], furtherWorkRequired: true, furtherWorkDetails: 'Inspect rollers',
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
    assert.equal(items[0].jobType, 122830001)
    assert.equal(items[0].workRequired, 'Service forklift')
    assert.equal(items[0].equipmentDisplayName, 'Still RX60')
    assert.equal(items[0].fleetNumber, 'FN24')
    assert.equal(JSON.parse(reviews.body).truncated, false)
    for (const key of ['tokenHash', 'technicianEmail', 'story', 'photos', 'equipmentId', 'technicianId']) assert.equal(items[0][key], undefined, key)
})

test('final required public submission moves an Allocated Job to Completion Review with the server identity', async () => {
    const created = await generate()
    delete process.env.JOB_CARD_LOCAL_DEVELOPMENT
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.GREENTREE_DATAVERSE_TENANT_ID = 'tenant-id'
    process.env.GREENTREE_DATAVERSE_CLIENT_ID = 'client-id'
    process.env.GREENTREE_DATAVERSE_CLIENT_SECRET = 'client-secret'
    const calls = []
    global.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options })
        if (String(url).includes('login.microsoftonline.com')) return Response.json({ access_token: 'application-token' })
        if (String(url).includes('/gr_jobassignments?')) return Response.json({ value: [] })
        if (!options.method) return Response.json({
            gr_jobid: '00000000-0000-4000-8000-000000000001',
            _gr_mechanic_value: '00000000-0000-4000-8000-000000000003',
            gr_status: statusAutomation._test.JOB_STATUS_ALLOCATED,
            '@odata.etag': 'W/"10"',
        })
        if (options.method === 'PATCH') return new Response(null, { status: 204 })
        throw new Error(`Unexpected request ${url}`)
    }

    const response = await invoke({ method: 'POST', headers: {}, body: {
        token: created.body.token, story: 'Completed service', hourMeter: 2510,
        timeEntries: [{ date: '2026-10-09', hours: 1, kilometres: 0 }], parts: [],
        furtherWorkRequired: false, safetyIssueIdentified: false, photos: [],
    } })

    assert.equal(response.status, 200)
    const patchCall = calls.find((call) => call.options.method === 'PATCH')
    assert.ok(patchCall)
    assert.equal(patchCall.options.headers.Authorization, 'Bearer application-token')
    assert.equal(patchCall.options.headers['If-Match'], 'W/"10"')
    assert.deepEqual(JSON.parse(patchCall.options.body), {
        gr_status: statusAutomation._test.JOB_STATUS_COMPLETION_REVIEW,
    })
})

test('pending queue is bounded, reports overflow and only reads its saved snapshot', async () => {
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    for (let index = 0; index < 101; index++) await store.create({
        ...snapshot({ equipmentSerial: 'SN-123' }), tokenHash: `queue-test-${index}`, reviewId: String(index),
        status: index === 100 ? 'active' : 'pendingReview', submittedOn: '2026-10-02T00:00:00Z', photos: [],
    })
    global.fetch = async () => { throw new Error('Queue must not hydrate individual Jobs from Dataverse.') }
    const request = { method: 'GET', headers: { authorization: 'Bearer office' }, query: {} }
    let body = JSON.parse((await service.handleReviewRequest(request)).body)
    assert.equal(body.items.length, 100)
    assert.equal(body.truncated, false)
    assert.ok(body.items.every((item) => item.equipmentSerial === 'SN-123'))
    await store.create({ ...snapshot(), tokenHash: 'queue-overflow', reviewId: 'overflow', status: 'pendingReview', submittedOn: '2026-10-03T00:00:00Z', photos: [] })
    body = JSON.parse((await service.handleReviewRequest(request)).body)
    assert.equal(body.items.length, 100)
    assert.equal(body.truncated, true)
    assert.ok(body.items.every((item) => item.reviewId !== '100'))
    assert.doesNotMatch(JSON.stringify(body), /queue-test-|queue-overflow|technician@example.com/)
})

test('review details and photos require office authentication and support explicit GreenTree completion', async () => {
    const pdfSnapshot = { equipmentMake: 'Still', equipmentModel: 'RX60', equipmentSerial: 'SER-TEST', orderNumber: 'PO-TEST', siteAddress: '1 Example Road' }
    const created = await generate({ snapshot: snapshot(pdfSnapshot) })
    const submitted = await invoke({ method: 'POST', headers: {}, body: {
        token: created.body.token, story: 'Completed', hourMeter: 2500,
        timeEntries: [{ date: '2026-07-25', hours: 1, kilometres: 0 }], parts: [], furtherWorkRequired: false, safetyIssueIdentified: false, photos: [],
    } })
    assert.equal(submitted.status, 200)
    const unauthorized = await service.handleReviewRequest({ method: 'GET', headers: {}, query: {} })
    assert.equal(unauthorized.status, 401)
    const list = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: {} })).body)
    const reviewId = list.items[0].reviewId
    const detail = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: { reviewId } })).body)
    for (const [key, value] of Object.entries(pdfSnapshot)) assert.equal(detail[key], value)
    assert.equal(detail.workRequired, 'Service forklift')
    assert.equal(detail.technicianEmail, undefined)
    assert.equal(detail.tokenHash, undefined)
    const reviewed = await service.handleReviewRequest({
        method: 'POST', headers: { authorization: 'Bearer office' }, query: { reviewId }, body: { action: 'completeGreenTreeProcessing', etag: detail.etag, greentreeReference: 'GT-TEST' },
    })
    assert.equal(JSON.parse(reviewed.body).status, 'reviewed')
    assert.equal(JSON.parse(reviewed.body).officeStatus, 'processedInGreenTree')
    const empty = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: {} })).body)
    assert.equal(empty.items.length, 0)
})

test('office review API enforces explicit transitions, immutable evidence and stale ETags', async () => {
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    const reviewId = '00000000-0000-4000-8000-000000000041'
    const original = await store.create({
        ...snapshot({ siteAddress: '1 Evidence Road', equipmentSerial: 'IMMUTABLE-1' }),
        tokenHash: 'office-workflow', reviewId, status: 'pendingReview', officeStatus: 'pending',
        submittedOn: '2026-10-02T00:00:00Z', story: 'Technician evidence',
        timeEntriesJson: JSON.stringify([{ date: '2026-10-02', hours: 1, kilometres: 2 }]),
        partsJson: JSON.stringify([{ description: 'Seal', quantity: 1 }]), photosJson: '[]', officeActivitiesJson: '[]',
    })
    const headers = { authorization: 'Bearer office' }
    const post = (body) => service.handleReviewRequest({ method: 'POST', headers, query: { reviewId }, body })

    assert.equal((await post({ action: 'setOnHold', etag: original.etag })).status, 400)
    assert.equal((await post({ action: 'markReviewed', etag: original.etag })).status, 400)
    assert.equal((await post({ action: 'completeNoInvoiceRequired', etag: original.etag, note: 'Warranty repair' })).status, 400)
    assert.deepEqual(await store.getByReviewId(reviewId), original, 'Rejected retired action must not mutate evidence or audit')
    assert.equal((await post({ action: 'startReview', etag: original.etag, reviewedByUserId: 'spoofed' })).status, 400)

    const startedResponse = await post({ action: 'startReview', etag: original.etag })
    assert.equal(startedResponse.status, 200)
    const started = JSON.parse(startedResponse.body)
    assert.equal(started.officeStatus, 'inReview')
    assert.equal(started.reviewStartedBy.displayName, 'Local Office User')
    assert.equal((await post({ action: 'setOnHold', etag: original.etag, note: 'Waiting for PO' })).status, 409)

    const heldResponse = await post({ action: 'setOnHold', etag: started.etag, note: 'Waiting for PO' })
    assert.equal(heldResponse.status, 200)
    const held = JSON.parse(heldResponse.body)
    assert.equal(held.officeStatus, 'onHold')
    assert.equal(held.officeActivities.length, 2)
    const finalResponse = await post({ action: 'completeGreenTreeProcessing', etag: held.etag, note: 'Data entry complete' })
    assert.equal(finalResponse.status, 200)
    const final = JSON.parse(finalResponse.body)
    assert.equal(final.officeStatus, 'processedInGreenTree')
    assert.equal(final.outcomeBy.email, 'local.office@example.invalid')
    assert.equal(final.status, 'reviewed')
    assert.equal((await post({ action: 'completeGreenTreeProcessing', etag: final.etag })).status, 409)

    const stored = await store.getByReviewId(reviewId)
    for (const field of ['story', 'timeEntriesJson', 'partsJson', 'siteAddress', 'equipmentSerial', 'submittedOn']) {
        assert.deepEqual(stored[field], original[field], field)
    }
})

test('active and history review queries are separate, bounded, paged and legacy-safe', async () => {
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    const base = { ...snapshot(), photosJson: '[]', officeActivitiesJson: '[]' }
    await store.create({ ...base, tokenHash: 'active-old', reviewId: '00000000-0000-4000-8000-000000000051', status: 'pendingReview', officeStatus: 'pending', submittedOn: '2026-10-01T00:00:00Z' })
    await store.create({ ...base, tokenHash: 'active-new', reviewId: '00000000-0000-4000-8000-000000000052', status: 'pendingReview', officeStatus: 'onHold', officeNote: 'Waiting', submittedOn: '2026-10-03T00:00:00Z' })
    await store.create({ ...base, tokenHash: 'history-explicit', reviewId: '00000000-0000-4000-8000-000000000053', status: 'reviewed', officeStatus: 'processedInGreenTree', submittedOn: '2026-10-02T00:00:00Z' })
    await store.create({ ...base, tokenHash: 'history-legacy', reviewId: '00000000-0000-4000-8000-000000000054', status: 'reviewed', submittedOn: '2026-09-01T00:00:00Z' })
    await store.create({ ...base, tokenHash: 'history-retired', reviewId: '00000000-0000-4000-8000-000000000055', status: 'reviewed', officeStatus: 'noInvoiceRequired', officeNote: 'Historical reason', submittedOn: '2026-08-01T00:00:00Z' })
    const headers = { authorization: 'Bearer office' }
    const active = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers, query: { view: 'active', offset: '0', limit: '1' } })).body)
    assert.equal(active.items.length, 1)
    assert.equal(active.items[0].officeStatus, 'onHold')
    assert.equal(active.hasMore, true)
    assert.equal(active.nextOffset, 1)
    const history = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers, query: { view: 'history', offset: '0', limit: '10' } })).body)
    assert.deepEqual(history.items.map((item) => item.officeStatus), ['processedInGreenTree', 'legacyReviewed', 'noInvoiceRequired'])
    assert.equal(history.items[1].greentreeReference, undefined)
    assert.equal(history.items[2].greentreeReference, undefined)
    assert.equal((await service.handleReviewRequest({ method: 'GET', headers, query: { view: 'active', offset: '500', limit: '1' } })).status, 400)
    assert.equal((await service.handleReviewRequest({ method: 'GET', headers, query: { view: 'active', unexpected: 'true' } })).status, 400)
})

const validBody = () => ({ story: 'Synthetic deployment verification', hourMeter: 2510,
    timeEntries: [{ date: '2026-10-02', hours: 1, kilometres: 0 }],
    parts: [{ description: 'Test washer', quantity: 2 }], furtherWorkRequired: false, safetyIssueIdentified: false, photos: [] })

test('lower meter confirmation, required positive hours, and real calendar dates are enforced', () => {
    const record = snapshot()
    assert.equal(service.test.validateSubmission(record, { ...validBody(), hourMeter: 2400, lowerHourMeterConfirmed: true }), '')
    assert.match(service.test.validateSubmission(record, { ...validBody(), hourMeter: 2400 }), /lower/)
    assert.match(service.test.validateSubmission(record, { ...validBody(), timeEntries: [] }), /Time/)
    for (const entry of [{ date: '2026-02-31', hours: 1, kilometres: 0 }, { date: '2026-10-02', hours: 0, kilometres: 0 }]) {
        assert.notEqual(service.test.validateSubmission(record, { ...validBody(), timeEntries: [entry] }), '')
    }
})

test('simultaneous generation creates one active cycle and additional technicians do not supersede it', async () => {
    const generated = await Promise.all([generate(), generate()])
    assert.deepEqual(generated.map((item) => item.response.status).sort(), [201, 409])
    const primary = generated.find((item) => item.response.status === 201)
    const additional = await generate({ assignmentId: '00000000-0000-4000-8000-000000000010' })
    assert.equal(additional.response.status, 201)
    assert.equal((await invoke({ method: 'GET', headers: {}, query: { token: primary.body.token } })).status, 200)
})

test('retrying an identical photo reuses its blob and reservation', async () => {
    const created = await generate()
    const request = { method: 'POST', headers: {}, body: { action: 'uploadPhoto', token: created.body.token,
        photo: { fileName: 'test.jpg', mimeType: 'image/jpeg', size: 3, data: '/9j/' } } }
    const first = await invoke(request)
    for (let i = 0; i < 25; i++) assert.deepEqual(await invoke(request), first)
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    assert.equal(store.blobs.size, 1)
    assert.equal(JSON.parse((await store.getByTokenHash(service.test.hashToken(created.body.token))).uploadIdsJson).length, 1)
})

test('concurrent submission accepts once without Dataverse and retains parts quantities', async () => {
    const created = await generate()
    global.fetch = async () => { throw new Error('Anonymous submission must not request Dataverse') }
    const request = { method: 'POST', headers: {}, body: { ...validBody(), token: created.body.token } }
    const responses = await Promise.all([invoke(request), invoke(request)])
    assert.deepEqual(responses.map((item) => item.status).sort(), [200, 410])
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    const record = await store.getByTokenHash(service.test.hashToken(created.body.token))
    assert.deepEqual(JSON.parse(record.partsJson), validBody().parts)
    assert.equal(JSON.stringify(record).includes(created.body.token), false)
    const next = await generate()
    assert.equal(next.response.status, 201)
    assert.equal((await store.getByTokenHash(record.tokenHash)).status, 'pendingReview')
})

test('private photos reject anonymous reads and another token cannot claim uploaded evidence', async () => {
    const first = await generate()
    const second = await generate({ assignmentId: '00000000-0000-4000-8000-000000000010' })
    const uploaded = JSON.parse((await invoke({ method: 'POST', headers: {}, body: { action: 'uploadPhoto', token: first.body.token,
        photo: { fileName: 'test.jpg', mimeType: 'image/jpeg', size: 3, data: '/9j/' } } })).body)
    assert.equal((await invoke({ method: 'POST', headers: {}, body: { ...validBody(), token: second.body.token, photos: [uploaded] } })).status, 400)
    assert.equal((await invoke({ method: 'POST', headers: {}, body: { ...validBody(), token: first.body.token, photos: [uploaded] } })).status, 200)
    const record = await require('../api/services/jobCardStorage').getJobCardStore().getByTokenHash(service.test.hashToken(first.body.token))
    const query = { reviewId: record.reviewId, photoId: uploaded.uploadId }
    assert.equal((await service.handleReviewRequest({ method: 'GET', headers: {}, query })).status, 401)
    const downloaded = await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer local-office' }, query })
    assert.equal(downloaded.status, 200)
    assert.deepEqual(downloaded.body, Buffer.from('/9j/', 'base64'))
})

test('hosted processes cannot enable memory storage or bypass office authentication', async () => {
    process.env.WEBSITE_HOSTNAME = 'example.azurewebsites.net'
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    let called = false
    global.fetch = async () => { called = true; return new Response('', { status: 401 }) }
    assert.equal((await generate()).response.status, 401)
    assert.equal(called, true)
    assert.throws(() => require('../api/services/jobCardStorage').getJobCardStore(), /forbidden/)
})

test('review authorisation rejects a valid office identity outside the reviewer allowlist', async () => {
    delete process.env.JOB_CARD_LOCAL_DEVELOPMENT
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.JOB_CARD_REVIEWER_EMAILS = 'georger@liftrucks.co.nz'
    global.fetch = async (url) => String(url).endsWith('/WhoAmI')
        ? Response.json({ UserId: '00000000-0000-4000-8000-000000000020' })
        : Response.json({ internalemailaddress: 'unapproved@example.com' })
    assert.equal((await service.handleReviewRequest({ method: 'GET', headers: { 'x-dataverse-authorization': 'Bearer office' }, query: {} })).status, 403)
    assert.equal((await service.handleReviewRequest({ method: 'GET', headers: { 'x-dataverse-authorization': 'Bearer office' }, query: { jobId: '00000000-0000-4000-8000-000000000001' } })).status, 403)
})

test('Table serialization splits maximum-size parts and removes null metadata', () => {
    const { serializeEntity, deserializeEntity } = require('../api/services/jobCardStorage')
    const partsJson = JSON.stringify(Array.from({ length: 100 }, () => ({ description: '😀'.repeat(250), quantity: 1 })))
    const entity = serializeEntity({ tokenHash: 'hash', partsJson, hourMeter: null })
    assert.ok(Object.values(entity).every((value) => typeof value !== 'string' || Buffer.byteLength(value, 'utf16le') <= 64000))
    assert.equal('hourMeter' in entity, false)
    assert.equal(deserializeEntity(entity).partsJson, partsJson)
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

test('withdrawing an active technician link requires a reason, revokes access and keeps its audit history', async () => {
    const created = await generate()
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    const record = await store.getByTokenHash(service.test.hashToken(created.body.token))
    const request = (body) => service.handleReviewRequest({ method: 'POST', headers: { authorization: 'Bearer office' }, query: { reviewId: record.reviewId }, body })
    assert.equal((await request({ action: 'withdraw', etag: record.etag, reason: ' ' })).status, 400)
    const response = await request({ action: 'withdraw', etag: record.etag, reason: 'Technician is no longer available' })
    assert.equal(response.status, 200)
    const withdrawn = JSON.parse(response.body)
    assert.equal(withdrawn.status, 'withdrawn')
    assert.equal(withdrawn.withdrawnReason, 'Technician is no longer available')
    assert.equal(withdrawn.withdrawnByDisplayName, 'Local Office User')
    assert.equal((await invoke({ method: 'GET', headers: {}, query: { token: created.body.token } })).status, 410)
    assert.equal((await request({ action: 'withdraw', etag: withdrawn.etag, reason: 'Again' })).status, 409)
    const history = JSON.parse((await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: { jobId: record.sourceJobId } })).body)
    assert.equal(history.items[0].status, 'withdrawn')
    assert.equal(history.items[0].withdrawnReason, 'Technician is no longer available')
})

test('final technician withdrawal returns only an Allocated Job to Unallocated', async () => {
    const calls = []
    const updated = await statusAutomation.returnJobToUnallocatedAfterFinalWithdrawal({
        jobId: '00000000-0000-4000-8000-000000000001',
        records: [{ status: 'withdrawn' }, { status: 'superseded' }],
        dataverseOrigin: 'https://example.crm.dynamics.com',
        authorization: 'Bearer office-token',
        fetchImpl: async (url, options = {}) => {
            calls.push({ url: String(url), options })
            if (!options.method) return Response.json({
                gr_jobid: '00000000-0000-4000-8000-000000000001',
                gr_status: statusAutomation._test.JOB_STATUS_ALLOCATED,
                '@odata.etag': 'W/"4"',
            })
            return new Response(null, { status: 204 })
        },
    })
    assert.equal(updated, true)
    assert.deepEqual(JSON.parse(calls[1].options.body), { gr_status: statusAutomation._test.JOB_STATUS_UNALLOCATED })
    assert.equal(calls[1].options.headers['If-Match'], 'W/"4"')
})

test('withdrawal preserves allocation while another technician still owns the Job', async () => {
    let calls = 0
    const updated = await statusAutomation.returnJobToUnallocatedAfterFinalWithdrawal({
        jobId: '00000000-0000-4000-8000-000000000001',
        records: [{ status: 'withdrawn' }, { status: 'active', expiresOn: '2999-01-01T00:00:00Z' }],
        dataverseOrigin: 'https://example.crm.dynamics.com',
        authorization: 'Bearer office-token',
        fetchImpl: async () => { calls += 1; throw new Error('must not read Dataverse') },
    })
    assert.equal(updated, false)
    assert.equal(calls, 0)
})

test('Completion Review waits for every current technician lifecycle', () => {
    const submittedPrimary = { tokenHash: 'primary-submitted', assignmentId: '', status: 'pendingReview', createdOn: '2026-10-09T01:00:00Z' }
    const activeAdditional = { tokenHash: 'additional-active', assignmentId: 'assignment-1', status: 'active', createdOn: '2026-10-09T01:01:00Z', expiresOn: '2026-10-16T01:01:00Z' }
    assert.equal(statusAutomation.allRequiredTechnicianSubmissionsReceived([submittedPrimary, activeAdditional]), false)

    const submittedAdditional = { ...activeAdditional, status: 'pendingReview' }
    assert.equal(statusAutomation.allRequiredTechnicianSubmissionsReceived([submittedPrimary, submittedAdditional]), true)
    assert.equal(statusAutomation.allRequiredTechnicianSubmissionsReceived([
        submittedPrimary,
        { ...submittedAdditional, status: 'withdrawn' },
    ]), true)

    const replacement = { ...submittedPrimary, tokenHash: 'primary-replacement', status: 'active', createdOn: '2026-10-09T02:00:00Z', expiresOn: '2026-10-16T02:00:00Z' }
    assert.equal(statusAutomation.allRequiredTechnicianSubmissionsReceived([submittedPrimary, replacement]), false)
    assert.equal(statusAutomation.allRequiredTechnicianSubmissionsReceived(Array.from({ length: 501 }, (_, index) => ({
        tokenHash: String(index), assignmentId: String(index), status: 'pendingReview', createdOn: '2026-10-09T01:00:00Z',
    }))), false)
})

test('all required submissions move only an Allocated Job to Completion Review', async () => {
    const calls = []
    const updated = await statusAutomation.moveJobToCompletionReviewAfterAllRequiredSubmissions({
        jobId: '00000000-0000-4000-8000-000000000001',
        records: [
            { tokenHash: 'primary', technicianId: 'tech-1', assignmentId: '', status: 'pendingReview', createdOn: '2026-10-09T01:00:00Z' },
            { tokenHash: 'additional', assignmentId: 'assignment-1', status: 'reviewed', createdOn: '2026-10-09T01:01:00Z' },
        ],
        dataverseOrigin: 'https://example.crm.dynamics.com',
        authorization: 'Bearer application-token',
        fetchImpl: async (url, options = {}) => {
            calls.push({ url: String(url), options })
            if (String(url).includes('/gr_jobassignments?')) return Response.json({ value: [] })
            if (!options.method) return Response.json({
                gr_jobid: '00000000-0000-4000-8000-000000000001',
                _gr_mechanic_value: 'tech-1',
                gr_status: statusAutomation._test.JOB_STATUS_ALLOCATED,
                '@odata.etag': 'W/"8"',
            })
            return new Response(null, { status: 204 })
        },
    })
    assert.equal(updated, true)
    const patch = calls.find((call) => call.options.method === 'PATCH')
    assert.deepEqual(JSON.parse(patch.options.body), { gr_status: statusAutomation._test.JOB_STATUS_COMPLETION_REVIEW })
    assert.equal(patch.options.headers['If-Match'], 'W/"8"')
})

test('scheduled reconciliation retries submitted Job Cards and reports blocked Jobs without exposing identifiers', async () => {
    const histories = new Map([
        ['00000000-0000-4000-8000-000000000001', [
            { tokenHash: 'submitted', technicianId: 'tech-1', assignmentId: '', status: 'pendingReview', createdOn: '2026-10-09T01:00:00Z' },
        ]],
        ['00000000-0000-4000-8000-000000000002', [
            { tokenHash: 'submitted', assignmentId: '', status: 'pendingReview', createdOn: '2026-10-09T01:00:00Z' },
            { tokenHash: 'outstanding', assignmentId: 'assignment-1', status: 'active', createdOn: '2026-10-09T01:01:00Z' },
        ]],
    ])
    const patches = []
    const result = await statusAutomation.reconcilePendingCompletionReviews({
        store: {
            listPending: async () => [...histories].map(([sourceJobId, records]) => ({ sourceJobId, ...records[0] })),
            listByJobId: async (jobId) => histories.get(jobId),
        },
        dataverseOrigin: 'https://example.crm.dynamics.com',
        authorization: 'Bearer application-token',
        fetchImpl: async (url, options = {}) => {
            if (String(url).includes('/gr_jobassignments?')) return Response.json({ value: [] })
            if (!options.method) return Response.json({
                gr_jobid: '00000000-0000-4000-8000-000000000001',
                _gr_mechanic_value: 'tech-1',
                gr_status: statusAutomation._test.JOB_STATUS_ALLOCATED,
                '@odata.etag': 'W/"12"',
            })
            patches.push({ url: String(url), options })
            return new Response(null, { status: 204 })
        },
    })
    assert.deepEqual(result, {
        pendingRecords: 2,
        jobsChecked: 2,
        eligible: 1,
        meterApplied: 0,
        meterFailed: 0,
        movedToCompletionReview: 1,
        unchanged: 1,
        failed: 0,
        truncated: false,
    })
    assert.equal(patches.length, 1)
    assert.doesNotMatch(JSON.stringify(result), /00000000|submitted|outstanding/)
})

test('authenticated per-Job history includes Azure lifecycle states without exposing tokens or evidence', async () => {
    const jobId = '00000000-0000-4000-8000-000000000001'
    const headers = { authorization: 'Bearer office' }
    const first = await generate()
    const second = await generate({ replaceActive: true })
    await invoke({ method: 'POST', body: { ...validBody(), token: second.body.token } })
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    const submitted = await store.getByTokenHash(service.test.hashToken(second.body.token))
    await service.handleReviewRequest({ method: 'POST', headers, query: { reviewId: submitted.reviewId }, body: { action: 'completeGreenTreeProcessing', etag: submitted.etag } })
    const expired = await generate()
    const record = await store.getByTokenHash(service.test.hashToken(expired.body.token))
    await store.replace({ ...record, expiresOn: '2000-01-01T00:00:00Z' }, record.etag)
    await generate({ assignmentId: '00000000-0000-4000-8000-000000000010' })
    const pending = await generate({ assignmentId: '00000000-0000-4000-8000-000000000011' })
    await invoke({ method: 'POST', body: { ...validBody(), token: pending.body.token } })
    await generate({ jobId: '00000000-0000-4000-8000-000000000099' })
    global.fetch = async () => { throw new Error('Local history must only read Azure storage.') }
    const response = await service.handleReviewRequest({ method: 'GET', headers, query: { jobId } })
    assert.equal(response.status, 200)
    const body = JSON.parse(response.body)
    assert.equal(body.truncated, false)
    assert.deepEqual(body.items.map((item) => item.status).sort(), ['active', 'expired', 'pendingReview', 'reviewed', 'superseded'])
    assert.ok(body.items.every((item, index) => !index || body.items[index - 1].createdOn >= item.createdOn))
    assert.doesNotMatch(response.body, /tokenHash|technicianEmail|sourceJobId|blobName|story|partsJson/)
    assert.equal(response.body.includes(first.body.token), false)
    assert.equal((await service.handleReviewRequest({ method: 'GET', headers: {}, query: { jobId } })).status, 401)
    for (const query of [{ jobId: '' }, { jobId: "' or true" }, { jobId, reviewId: submitted.reviewId }]) {
        assert.equal((await service.handleReviewRequest({ method: 'GET', headers, query })).status, 400)
    }
    assert.equal((await service.handleReviewRequest({ method: 'POST', headers, query: { jobId } })).status, 400)
})

test('Job history is bounded and explicitly reports truncation', async () => {
    const store = require('../api/services/jobCardStorage').getJobCardStore()
    const sourceJobId = '00000000-0000-4000-8000-000000000001'
    for (let index = 0; index < 501; index++) await store.create({
        tokenHash: `test-only-${index}`, sourceJobId, reviewId: String(index), status: 'active',
        createdOn: '2026-10-02T00:00:00Z', expiresOn: '2099-01-01T00:00:00Z', technicianName: 'Test',
    })
    const response = await service.handleReviewRequest({ method: 'GET', headers: { authorization: 'Bearer office' }, query: { jobId: sourceJobId } })
    const body = JSON.parse(response.body)
    assert.equal(body.items.length, 500)
    assert.equal(body.truncated, true)
})
