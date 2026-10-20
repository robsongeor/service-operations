const assert = require('node:assert/strict')
const test = require('node:test')
const { coordinationSummary, normalizeJobIds, summarizeJob, _test } = require('../api/services/jobCardCoordinationSummary')

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const jobId = id(1)
const primary = id(2)
const assignmentId = id(3)
const additional = id(4)
const job = { gr_jobid: jobId, gr_status: 122830000, _gr_mechanic_value: primary }
const assignment = { gr_jobassignmentid: assignmentId, _gr_job_value: jobId, _gr_mechanic_value: additional }
const card = (overrides = {}) => ({ sourceJobId: jobId, assignmentId: '', technicianId: primary, status: 'active', expiresOn: '2999-01-01', createdOn: '2026-10-01', tokenHash: 'a', ...overrides })

test('coordination summary projects not-sent, awaiting, partial, ready, expired and conflict without evidence', () => {
    assert.equal(summarizeJob(jobId, job, [], []).state, 'not-sent')
    assert.equal(summarizeJob(jobId, job, [], [card()]).state, 'awaiting')
    assert.equal(summarizeJob(jobId, job, [assignment], [card({ status: 'reviewed', submittedOn: '2026-10-02' }), card({ assignmentId, technicianId: additional, tokenHash: 'b' })]).state, 'partial')
    const ready = summarizeJob(jobId, job, [assignment], [card({ status: 'reviewed', submittedOn: '2026-10-02' }), card({ assignmentId, technicianId: additional, status: 'pendingReview', tokenHash: 'b', submittedOn: '2026-10-03' })])
    assert.equal(ready.state, 'ready')
    assert.equal(ready.returnedCount, 2)
    assert.equal(ready.officeAttentionRecommended, true)
    assert.equal(summarizeJob(jobId, job, [], [card({ expiresOn: '2000-01-01' })]).state, 'expired')
    assert.equal(summarizeJob(jobId, job, [], [card(), card({ tokenHash: 'b' })]).state, 'conflict')
    assert.deepEqual(Object.keys(ready).sort(), ['actionRequiredPreserved', 'currentRequiredTechnicianCount', 'expectedTechnicianCount', 'jobId', 'jobStatus', 'lastChangedOn', 'officeAttentionRecommended', 'returnedCount', 'state'].sort())
})

test('assignment changes and all-withdrawn lifecycles never claim ready', () => {
    assert.equal(summarizeJob(jobId, { ...job, _gr_mechanic_value: id(9) }, [], [card()]).state, 'conflict')
    const withdrawn = summarizeJob(jobId, job, [], [card({ status: 'withdrawn', withdrawnOn: '2026-10-03' })])
    assert.equal(withdrawn.state, 'not-sent')
    assert.equal(withdrawn.officeAttentionRecommended, true)
})

test('batch summary uses bounded Dataverse and lifecycle reads rather than one request per Job', async () => {
    const jobIds = Array.from({ length: 21 }, (_, index) => id(index + 10))
    let storeCalls = 0
    let fetchCalls = 0
    const result = await coordinationSummary({
        body: { action: 'coordinationSummary', jobIds },
        origin: 'https://sample.crm.dynamics.com', authorization: 'Bearer token',
        store: { async listByJobIds(ids) { storeCalls++; return ids.map((sourceJobId, index) => card({ sourceJobId, technicianId: id(index + 200), createdOn: `2026-10-${String(index + 1).padStart(2, '0')}` })) } },
        fetchImpl: async (url) => {
            fetchCalls++
            const decoded = decodeURIComponent(String(url))
            const ids = jobIds.filter((value) => decoded.includes(value))
            if (decoded.includes('/gr_jobassignments?')) return Response.json({ value: [] })
            return Response.json({ value: ids.map((value, index) => ({ gr_jobid: value, gr_status: 122830000, _gr_mechanic_value: id(index + 200) })) })
        },
    })
    assert.equal(result.items.length, 21)
    assert.equal(storeCalls, 2)
    assert.equal(fetchCalls, 4)
    assert.equal(_test.JOB_BATCH_SIZE, 20)
})

test('invalid, duplicate, oversized and incomplete batch evidence fails closed', async () => {
    assert.equal(normalizeJobIds({ action: 'coordinationSummary', jobIds: [jobId, jobId] }), null)
    assert.equal(normalizeJobIds({ action: 'coordinationSummary', jobIds: Array(_test.MAXIMUM_JOB_IDS + 1).fill(jobId) }), null)
    await assert.rejects(coordinationSummary({
        body: { action: 'coordinationSummary', jobIds: [jobId] }, origin: 'https://sample.crm.dynamics.com', authorization: 'Bearer token',
        store: { async listByJobIds() { return Array(_test.MAXIMUM_RECORDS_PER_BATCH + 1).fill(card()) } },
        fetchImpl: async () => Response.json({ value: [], '@odata.nextLink': 'more' }),
    }))
})

test('Action Required is context only and never auto-cleared by a summary', () => {
    const result = summarizeJob(jobId, { ...job, gr_status: 122830002 }, [], [card({ status: 'reviewed', submittedOn: '2026-10-02' })])
    assert.equal(result.state, 'ready')
    assert.equal(result.actionRequiredPreserved, true)
    assert.equal(result.jobStatus, 122830002)
})
