const assert = require('node:assert/strict')
const test = require('node:test')
const service = require('../api/services/jobSubmissionService')
const { getJobCardStore, AzureJobCardStore } = require('../api/services/jobCardStorage')
const { listOpenJobs } = require('../api/services/jobCardOpenJobs')
const originalEnvironment = { ...process.env }
const originalFetch = global.fetch
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const headers = { authorization: 'Bearer sample' }
const origin = 'https://dispatch-fixture.invalid'
const dispatch = (n, overrides = {}) => ({
    gr_emaildispatchid: id(n), _gr_job_value: id(n + 100), gr_emailsent: true,
    gr_recipientemail: 'tech@example.invalid', gr_recipientname: 'Sample technician',
    gr_requestedon: '2026-10-02T01:00:00Z', gr_completedon: '2026-10-02T01:01:00Z',
    gr_Job: { gr_jobid: id(n + 100), gr_jobnumber: `WJ12345${n}`, gr_jobtype: 122830000, gr_description: 'Sample repair' }, ...overrides,
})
const record = (n, overrides = {}) => ({
    tokenHash: `secret-${n}`, reviewId: id(n), sourceJobId: id(101), technicianEmail: 'tech@example.invalid',
    jobNumber: '146001', submittedOn: '2026-10-02T02:00:00Z', status: 'pendingReview',
    officeStatus: 'pending', officeActivitiesJson: '[]', story: 'Original evidence', ...overrides,
})
const get = (view, extra = {}) => service.handleReviewRequest({ method: 'GET', headers, query: { view, ...extra } })

test.beforeEach(() => {
    Object.assign(process.env, { NODE_ENV: 'test', JOB_CARD_LOCAL_DEVELOPMENT: 'true', JOB_CARD_STORAGE_MODE: 'memory', DATAVERSE_URL: origin })
    service.test.reset()
    global.fetch = async () => { throw new Error('Unexpected external request.') }
})
test.afterEach(() => {
    global.fetch = originalFetch
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key]
    Object.assign(process.env, originalEnvironment)
    service.test.reset()
})

test('submitted, review and completed partition office states without altering evidence', async () => {
    const store = getJobCardStore()
    for (const [n, state] of ['pending', 'inReview', 'needsClarification', 'onHold', 'processedInGreenTree', 'noInvoiceRequired', undefined].entries()) {
        const value = record(n + 1, { officeStatus: state, status: n >= 4 ? 'reviewed' : 'pendingReview' })
        if (!state) delete value.officeStatus
        await store.create(value)
    }
    await store.create(record(8, { officeStatus: undefined }))
    const before = structuredClone([...store.entities.values()])
    for (const [view, expected] of [
        ['submitted', ['pending', 'pending']], ['review', ['inReview', 'needsClarification', 'onHold']],
        ['completed', ['processedInGreenTree', 'noInvoiceRequired', 'legacyReviewed']],
    ]) {
        const response = await get(view)
        assert.equal(response.status, 200)
        assert.deepEqual(JSON.parse(response.body).items.map((item) => item.officeStatus), expected)
    }
    assert.deepEqual([...store.entities.values()], before)
})

test('stage pagination advances over filtered rows and reports the finite scan boundary', async () => {
    const store = getJobCardStore()
    for (let n = 0; n < 501; n++) await store.create(record(n, { officeStatus: n === 1 ? 'inReview' : 'pending' }))
    const first = JSON.parse((await get('review', { limit: '1' })).body)
    assert.equal(first.items.length, 0)
    assert.equal(first.nextOffset, 1)
    assert.equal(first.hasMore, true)
    const second = JSON.parse((await get('review', { offset: '1', limit: '1' })).body)
    assert.equal(second.items[0].officeStatus, 'inReview')
    const last = JSON.parse((await get('submitted', { offset: '400' })).body)
    assert.equal(last.hasMore, false)
    assert.equal(last.truncated, true)
    assert.equal(last.scanLimitReached, true)
    assert.equal(last.nextOffset, undefined)
    const smallerPage = JSON.parse((await get('submitted', { offset: '400', limit: '1' })).body)
    assert.equal(smallerPage.nextOffset, 401)
    assert.equal((await get('submitted', { offset: '401', limit: '1' })).status, 200)
    assert.equal(JSON.parse((await get('submitted', { offset: '499' })).body).items.length, 1)
    assert.equal((await get('submitted', { offset: '500' })).status, 400)
})

test('Azure stages sort a consistent bounded population before paging, not different prefixes', async () => {
    const azure = Object.create(AzureJobCardStore.prototype)
    const population = [record(3, { submittedOn: '2026-10-01T00:00:00Z' }), record(2), record(1)]
    azure.collect = async (_, limit) => { assert.equal(limit, 501); return structuredClone(population) }
    assert.deepEqual((await azure.listActive(1)).map((row) => row.reviewId), [id(1)])
    assert.deepEqual((await azure.listActive(3)).map((row) => row.reviewId), [id(1), id(2), id(3)])
})

test('Open jobs requires a confirmed send and real number; links, failures and staging are excluded', async () => {
    const rows = [dispatch(1), dispatch(2, { gr_emailsent: false }), dispatch(3, { gr_completedon: null }),
        ...['', '   ', 'Not recorded', 'Draft', '0000'].map((number, n) => dispatch(10 + n, { gr_Job: { gr_jobid: id(110 + n), gr_jobnumber: number } })),
        dispatch(20, { gr_Job: { gr_jobid: id(120), gr_jobnumber: 'HJ123456789', gr_jobtype: 122830000 } }),
        dispatch(21, { gr_Job: { gr_jobid: id(121), gr_jobnumber: '1234567890', gr_jobtype: 122830004 } }),
    ]
    global.fetch = async (input, options) => {
        const url = new URL(input)
        assert.equal(url.origin, origin)
        assert.match(url.searchParams.get('$filter'), /gr_emailsent eq true/)
        assert.doesNotMatch(url.searchParams.get('$select'), /gr_body|gr_subject/)
        assert.equal(options.headers.Authorization, 'Bearer sample')
        assert.equal(options.redirect, 'error')
        return Response.json({ value: rows })
    }
    await getJobCardStore().create(record(9, { status: 'active', sourceJobId: id(999), submittedOn: undefined }))
    const response = await get('open')
    assert.equal(response.status, 200)
    const result = JSON.parse(response.body)
    assert.deepEqual(result.items.map((row) => row.dispatchId), [id(1), id(20)])
    assert.doesNotMatch(response.body, /secret-|tokenHash|technicianEmail|gr_recipientemail|story|submittedOn/)
    assert.equal(result.items[0].sentOn, rows[0].gr_completedon)
    assert.equal(result.items[0].officeStatus, undefined, 'An unsent submission must not get a fabricated office status')
})

test('received cards leave Open even on hold; old evidence, different recipients and assignments do not hide newer sends', async () => {
    const rows = [dispatch(1), dispatch(2), dispatch(3), dispatch(4, { _gr_jobassignment_value: id(800) }), dispatch(5)]
    global.fetch = async () => Response.json({ value: rows })
    const store = getJobCardStore()
    await store.create(record(1, { officeStatus: 'onHold' }))
    await store.create(record(2, { sourceJobId: id(102), status: 'reviewed', officeStatus: 'processedInGreenTree', submittedOn: '2026-09-01T00:00:00Z' }))
    await store.create(record(3, { sourceJobId: id(103), technicianEmail: 'other@example.invalid' }))
    await store.create(record(4, { sourceJobId: id(104) }))
    await store.create(record(5, { sourceJobId: id(105), status: 'reviewed', officeStatus: 'legacyReviewed' }))
    const result = JSON.parse((await get('open')).body)
    assert.deepEqual(result.items.map((row) => row.dispatchId), [id(2), id(3), id(4)])
})

test('recorded legacy primary and assignment submissions are not presented as still awaiting submission', async () => {
    const rows = [dispatch(1), dispatch(2), dispatch(3), dispatch(4)]
    rows[0].gr_Job.gr_techniciansubmissionsubmittedon = '2026-10-02T02:00:00Z'
    rows[1].gr_Job.gr_jobcardsubmittedon = '2026-09-01T00:00:00Z' // New send cycle remains open.
    for (const [n, row] of rows.slice(2).entries()) {
        row._gr_jobassignment_value = id(800 + n)
        row.gr_JobAssignment = { gr_jobassignmentid: id(800 + n), _gr_job_value: row._gr_job_value, gr_submittedon: n === 0 ? '2026-10-02T02:00:00Z' : null }
        row.gr_Job.gr_techniciansubmissionsubmittedon = '2026-10-02T02:00:00Z' // Primary evidence must not hide an additional technician.
    }
    global.fetch = async () => Response.json({ value: rows })
    const before = structuredClone(rows)
    assert.deepEqual(JSON.parse((await get('open')).body).items.map((item) => item.dispatchId), [id(2), id(4)])
    assert.deepEqual(rows, before)
})

test('repeat successful sends are deduplicated across pages; open scan errors never claim an empty queue', async () => {
    const rows = [dispatch(1), dispatch(2, { _gr_job_value: id(101), gr_Job: dispatch(1).gr_Job })]
    global.fetch = async () => Response.json({ value: rows })
    assert.equal(JSON.parse((await get('open', { limit: '1' })).body).items.length, 1)
    assert.equal(JSON.parse((await get('open', { offset: '1', limit: '1' })).body).items.length, 0)
    global.fetch = async () => Response.json({ error: 'private upstream details' }, { status: 403 })
    const denied = await get('open')
    assert.equal(denied.status, 503)
    assert.match(JSON.parse(denied.body).error, /could not be verified/)
    assert.doesNotMatch(denied.body, /private upstream/)
})

test('dispatch continuation is same-origin only, bounded and follows valid smaller server pages', async () => {
    let calls = 0
    global.fetch = async () => ++calls === 1 ? Response.json({ value: [dispatch(1)], '@odata.nextLink': `${origin}/api/data/v9.2/gr_emaildispatchs?$skiptoken=safe` }) : Response.json({ value: [dispatch(2)] })
    assert.equal(JSON.parse((await get('open')).body).items.length, 2)
    assert.equal(calls, 2)
    calls = 0
    global.fetch = async () => { calls++; return Response.json({ value: [], '@odata.nextLink': 'https://attacker.invalid/gr_emaildispatchs' }) }
    assert.equal((await get('open')).status, 503)
    assert.equal(calls, 1)
})

test('Open lifecycle checks batch Job IDs and fail closed on incomplete evidence', async () => {
    global.fetch = async () => Response.json({ value: [dispatch(1), dispatch(2)] })
    const batches = []
    const store = { listByJobIds: async (ids, limit) => { batches.push(ids); assert.equal(limit, 501); return [] } }
    await listOpenJobs({ origin, authorization: 'Bearer sample', store, offset: 0, limit: 100 })
    assert.deepEqual(batches, [[id(101), id(102)]])
    store.listByJobIds = async () => Array.from({ length: 501 }, () => record(1))
    await assert.rejects(listOpenJobs({ origin, authorization: 'Bearer sample', store, offset: 0, limit: 100 }), /safe Open jobs scan/)
    const azure = Object.create(AzureJobCardStore.prototype)
    azure.collect = async (filter, limit) => { assert.doesNotMatch(filter, /status eq/); assert.match(filter, new RegExp(id(101))); assert.equal(limit, 501); return [] }
    await azure.listByJobIds([id(101), id(102)])
})

test('updated authenticated detail advertises office recovery independently of meter activation', async () => {
    process.env.JOB_CARD_METER_APPROVAL_ENABLED = 'false'
    await getJobCardStore().create(record(1))
    const response = await service.handleReviewRequest({ method: 'GET', headers, query: { reviewId: id(1) } })
    assert.equal(response.status, 200)
    const detail = JSON.parse(response.body)
    assert.equal(detail.officeRecoveryAvailable, true)
    assert.equal(detail.meterApprovalAvailable, false)
})

test('withdrawn and replaced cycles leave Open, but expired unreturned cards remain visible', async () => {
    const rows = [dispatch(1), dispatch(2), dispatch(3), dispatch(4), dispatch(5)]
    global.fetch = async () => Response.json({ value: rows })
    const store = getJobCardStore()
    for (const [index, status] of ['withdrawn', 'superseded', 'active', 'active', 'expired'].entries()) {
        await store.create(record(30 + index, {
            sourceJobId: id(101 + index), status, submittedOn: undefined,
            createdOn: '2026-10-02T00:59:00Z', expiresOn: index === 2 ? '2000-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
        }))
    }
    const result = JSON.parse((await get('open')).body)
    assert.deepEqual(result.items.map((item) => item.dispatchId), [id(3), id(4), id(5)])
    assert.equal(result.items[0].linkExpired, true)
    assert.equal(result.items[1].linkExpired, false)
    assert.equal(result.items[2].linkExpired, true)
})

test('Open requires reviewer authentication before reading dispatches', async () => {
    let calls = 0
    global.fetch = async () => { calls++; throw new Error('Should not fetch') }
    assert.equal((await service.handleReviewRequest({ method: 'GET', headers: {}, query: { view: 'open' } })).status, 401)
    assert.equal(calls, 0)
})

test('disabled meter feature refuses retries without acquiring credentials or changing saved approval', async () => {
    process.env.JOB_CARD_METER_APPROVAL_ENABLED = 'false'
    const store = getJobCardStore()
    const saved = await store.create(record(1, { meterSyncStatus: 'pending', meterApprovalJson: '{"hours":1620}' }))
    let calls = 0
    global.fetch = async () => { calls++; throw new Error('No token or Dataverse request permitted') }
    const response = await service.handleReviewRequest({ method: 'POST', headers, query: { reviewId: id(1) }, body: { action: 'retryMeterSync', etag: saved.etag } })
    assert.equal(response.status, 503)
    assert.equal(calls, 0)
    assert.deepEqual(await store.getByReviewId(id(1)), saved)
})
