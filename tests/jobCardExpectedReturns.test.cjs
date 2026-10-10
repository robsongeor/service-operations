const test = require('node:test')
const assert = require('node:assert/strict')
const { expectedReturns, readExpectedReturns } = require('../api/services/jobCardExpectedReturns')
const { moveJobToCompletionReviewAfterAllRequiredSubmissions } = require('../api/services/jobOperationalStatusAutomation')
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const job = { gr_jobid: id(1), _gr_mechanic_value: id(2), gr_status: 122830000, '@odata.etag': 'W/"1"' }
const assignment = { gr_jobassignmentid: id(3), _gr_mechanic_value: id(4) }
const card = { technicianId: id(2), status: 'pendingReview', createdOn: '2026-10-01', tokenHash: 'a' }
const config = { jobId: id(1), records: [card], origin: 'https://sample.crm.dynamics.com', dataverseOrigin: 'https://sample.crm.dynamics.com', authorization: 'Bearer sample' }

test('expected returns include assigned technicians who were never sent a link', () => {
    assert.deepEqual(expectedReturns(job, [assignment], [card]).map((item) => item.state), ['received', 'notSent'])
    assert.equal(expectedReturns({ ...job, _gr_mechanic_value: id(5) }, [], [card])[0].state, 'notSent')
    assert.equal(expectedReturns({}, [{ gr_jobassignmentid: id(3) }], [{ assignmentId: id(3), status: 'reviewed' }])[0].state, 'notSent')
})

test('latest links determine returns; expired, withdrawn and unreturned cards stay distinct', () => {
    for (const [status, expiresOn, expected] of [
        ['active', '2000-01-01', 'expired'], ['active', '2999-01-01', 'awaiting'],
        ['withdrawn', '', 'withdrawn'], ['reviewed', '', 'received'],
    ]) {
        assert.equal(expectedReturns(job, [], [card, { ...card, status, expiresOn, createdOn: '2026-10-02', tokenHash: 'b' }])[0].state, expected)
    }
})

test('missing, unverified or truncated assignment reads fail closed', async () => {
    for (const payload of [{}, { value: [], '@odata.nextLink': 'more' }, { value: Array(501).fill(assignment) }, { value: [{ gr_jobassignmentid: id(3) }] }]) {
        await assert.rejects(readExpectedReturns({ ...config, fetchImpl: async (url) => Response.json(String(url).includes('/gr_jobassignments?') ? payload : job) }))
    }
    await assert.rejects(readExpectedReturns({ ...config, fetchImpl: async () => new Response(null, { status: 403 }) }), /could not be verified/)
    await assert.rejects(readExpectedReturns({ ...config, fetchImpl: async () => Response.json({ ...job, '@odata.etag': undefined }) }), /version/)
})

test('an unsent assignment or changed Job version prevents automatic Completion Review', async () => {
    let writes = 0
    const fetchImpl = async (url, options) => {
        if (options.method === 'PATCH') { writes++; return new Response(null, { status: 204 }) }
        return Response.json(String(url).includes('/gr_jobassignments?') ? { value: [assignment] } : job)
    }
    assert.equal(await moveJobToCompletionReviewAfterAllRequiredSubmissions({ ...config, fetchImpl }), false)
    let reads = 0
    await assert.rejects(moveJobToCompletionReviewAfterAllRequiredSubmissions({ ...config, fetchImpl: async (url, options) => {
        if (options.method === 'PATCH') { writes++; return new Response(null, { status: 204 }) }
        if (String(url).includes('/gr_jobassignments?')) return Response.json({ value: [] })
        return Response.json({ ...job, '@odata.etag': ++reads === 1 ? 'W/"1"' : 'W/"2"' })
    } }), /changed after/)
    assert.equal(writes, 0)
})
