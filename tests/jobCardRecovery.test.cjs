const test = require('node:test')
const assert = require('node:assert/strict')
const { MemoryJobCardStore, AzureJobCardStore } = require('../api/services/jobCardStorage')
const { reviewPage } = require('../api/services/jobCardReviewPaging')
const { reconcilePendingCompletionReviews } = require('../api/services/jobOperationalStatusAutomation')
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const record = (n) => ({ tokenHash: String(n).padStart(8, '0'), reviewId: id(n), sourceJobId: id(n + 1000), technicianId: id(900), jobNumber: String(n), status: 'pendingReview', officeStatus: 'pending', submittedOn: '2026-10-01T00:00:00Z' })
test('cursor paging reaches older cards past 501 and does not skip after earlier cards are filed', async () => {
    const store = new MemoryJobCardStore()
    for (let n = 1; n <= 610; n++) await store.create(record(n))
    const first = await reviewPage(store, { view: 'submitted', limit: 100 })
    assert.equal(first.records.length, 100)
    await store.replace({ ...first.records[0], status: 'reviewed' }, first.records[0].etag)
    const ids = first.records.map((r) => r.reviewId)
    let cursor = first.nextCursor
    while (cursor) {
        const page = await reviewPage(store, { view: 'submitted', limit: 100, cursor })
        ids.push(...page.records.map((r) => r.reviewId)); cursor = page.nextCursor
    }
    assert.equal(ids.length, 610)
    assert.equal(new Set(ids).size, 610)
    const search = await reviewPage(store, { view: 'submitted', limit: 100, jobNumber: '610' })
    assert.deepEqual(search.records.map((r) => r.jobNumber), ['610'])
    await assert.rejects(reviewPage(store, { view: 'completed', limit: 100, cursor: first.nextCursor }), /cursor/)
})
test('Azure continuation stays opaque and bound to a fixed status/filter with small pages', async () => {
    const store = Object.create(AzureJobCardStore.prototype)
    const calls = []
    store.table = { listEntities: ({ queryOptions }) => ({ byPage: (options) => ({ next: async () => {
        calls.push({ queryOptions, options })
        return { value: Object.assign([record(1)], { continuationToken: 'opaque-next' }) }
    } }) }) }
    const page = await reviewPage(store, { view: 'submitted', limit: 50, jobNumber: '1' })
    assert.equal(calls[0].options.maxPageSize, 50)
    assert.match(calls[0].queryOptions.filter, /PartitionKey eq 'job-card'.*status eq 'pendingReview'.*jobNumber eq '1'/)
    await reviewPage(store, { view: 'submitted', limit: 50, jobNumber: '1', cursor: page.nextCursor })
    assert.equal(calls[1].options.continuationToken, 'opaque-next')
})
test('reconciliation discovery includes office-filed cards and advances past waiting jobs', async () => {
    const store = new MemoryJobCardStore()
    await store.create({ ...record(1), status: 'reviewed', officeStatus: 'processedInGreenTree' })
    await store.create(record(2))
    const checked = []
    const run = () => reconcilePendingCompletionReviews({ store, maxJobs: 1, dataverseOrigin: 'https://sample.crm.dynamics.com', authorization: 'Bearer sample', fetchImpl: async (url, options) => {
        if (options.method === 'PATCH') return new Response(null, { status: 204 })
        if (String(url).includes('/gr_jobassignments?')) return Response.json({ value: [] })
        const jobId = /gr_jobs\(([^)]+)\)/.exec(String(url))[1]
        checked.push(jobId)
        return Response.json({ gr_jobid: jobId, _gr_mechanic_value: id(900), gr_status: 122830000, '@odata.etag': 'W/"1"' })
    } })
    assert.equal((await run()).movedToCompletionReview, 1)
    assert.equal((await run()).movedToCompletionReview, 1)
    assert.deepEqual([...new Set(checked)], [id(1001), id(1002)])
    assert.equal(store.reconciliationCursor, '')
})
