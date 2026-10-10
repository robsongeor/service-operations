const test = require('node:test')
const assert = require('node:assert/strict')
const { prepareMeterApproval, syncApprovedMeter, validReadingDate, approvalReference } = require('../api/services/jobCardMeterApproval')
const { applyOfficeTransition } = require('../api/services/jobCardOfficeReview')
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = { userId: id(9), displayName: 'Office Admin', email: 'office@example.invalid' }
const record = { reviewId: id(1), sourceJobId: id(2), equipmentId: id(3), hourMeter: 1250, currentHourMeter: 1200, status: 'pendingReview', officeStatus: 'pending', story: 'Original', officeActivitiesJson: '[]' }
const input = { hours: 1250, confirmed: true, recordedDate: '2026-10-01' }
const reference = approvalReference({ ...input, reviewId: id(1), equipmentId: id(3) })
const originalFlag = process.env.JOB_CARD_METER_APPROVAL_ENABLED
test.beforeEach(() => { process.env.JOB_CARD_METER_APPROVAL_ENABLED = 'true' })
test.afterEach(() => { if (originalFlag == null) delete process.env.JOB_CARD_METER_APPROVAL_ENABLED; else process.env.JOB_CARD_METER_APPROVAL_ENABLED = originalFlag })
const approved = (values = input) => ({ ...record, ...prepareMeterApproval(record, values, actor, '2026-10-02T00:00:00Z') })
const current = (extra = {}) => ({ gr_jobid: id(2), _gr_equipment_value: id(3), gr_status: 122830004, statecode: 0, gr_registrationvoid: false, '@odata.etag': 'W/"2"', gr_Equipment: { gr_currenthourmeter: 1200, gr_currenthourmeterrecordeddate: '2026-09-20' }, ...extra })
const options = (job, writes = []) => ({ record: approved(), origin: 'https://sample.crm.dynamics.com', authorization: 'Bearer sample', fetchImpl: async (url, request) => {
    if (request.method === 'PATCH') { writes.push({ url, request, body: JSON.parse(request.body) }); return new Response(null, { status: 204 }) }
    return Response.json(job)
} })
test('approval requires explicit office confirmation, a real date and trusted actor; original evidence stays unchanged', () => {
    const before = structuredClone(record)
    assert.throws(() => applyOfficeTransition(record, { action: 'completeGreenTreeProcessing' }, actor), /Confirm/)
    assert.throws(() => applyOfficeTransition(record, { action: 'completeGreenTreeProcessing', meterApproval: input }, null), /reviewer access/)
    assert.throws(() => prepareMeterApproval(record, { ...input, confirmed: false }, actor), /Confirm/)
    assert.throws(() => prepareMeterApproval(record, { ...input, recordedDate: '2026-02-30' }, actor), /date/)
    assert.throws(() => prepareMeterApproval(record, { ...input, recordedDate: '2999-01-01' }, actor), /date/)
    const result = applyOfficeTransition(record, { action: 'completeGreenTreeProcessing', meterApproval: input }, actor)
    assert.equal(result.meterSyncStatus, 'pending')
    assert.equal(JSON.parse(result.meterApprovalJson).approvedBy.userId, actor.userId)
    assert.equal(result.hourMeter, record.hourMeter)
    assert.deepEqual(record, before)
    assert.equal(validReadingDate('2024-02-29', '2026-10-10'), true)
})
test('office corrections and anomalies need an explanation; disabled backend refuses approval', () => {
    assert.throws(() => approved({ ...input, hours: 1000 }), /Explain/)
    assert.equal(JSON.parse(approved({ ...input, hours: 1000, exceptionReason: 'Confirmed replacement meter with technician' }).meterApprovalJson).hours, 1000)
    process.env.JOB_CARD_METER_APPROVAL_ENABLED = 'false'
    assert.throws(() => approved(), /not been enabled/)
    assert.deepEqual(prepareMeterApproval(record, undefined, actor), {})
})
test('sync writes only approved Job meter fields with ETag, never completion or maintenance fields', async () => {
    const writes = []
    assert.equal(await syncApprovedMeter(options(current(), writes)), 'applied')
    assert.deepEqual(writes[0].body, { gr_hourmeter: 1250, gr_hourmeterrecordeddate: '2026-10-01', gr_hourmeterreadingtype: 122830000, gr_hourmeterapprovalreference: reference })
    assert.equal(writes[0].request.headers['If-Match'], 'W/"2"')
    assert.equal(writes.length, 1)
})
test('retries are idempotent; historical cards cannot overwrite newer Job readings', async () => {
    const writes = []
    assert.equal(await syncApprovedMeter(options(current({ gr_hourmeter: 1250, gr_hourmeterreadingtype: 122830000, gr_hourmeterrecordeddate: '2026-10-01', gr_hourmeterapprovalreference: reference }), writes)), 'applied')
    assert.equal(await syncApprovedMeter(options(current({ gr_hourmeter: 1260, gr_hourmeterrecordeddate: '2026-10-02' }), writes)), 'superseded')
    assert.equal(writes.length, 0)
    await assert.rejects(syncApprovedMeter(options(current({ gr_hourmeter: 1250, gr_hourmeterreadingtype: 122830001, gr_hourmeterrecordeddate: '2026-10-01', gr_hourmeterapprovalreference: reference }), writes)), /has been edited/)
    assert.equal(writes.length, 0)
})
test('changed equipment, conflicting readings, completed Jobs, missing versions and conflicts cannot be silently overwritten', async () => {
    for (const extra of [{ _gr_equipment_value: id(4) }, { gr_hourmeter: 1240, gr_hourmeterrecordeddate: '2026-10-01' }, { gr_status: 122830003 }, { '@odata.etag': undefined }, { gr_Equipment: { gr_currenthourmeter: 9999 } }, { statecode: 1 }, { statecode: undefined }, { gr_registrationvoid: true }, { gr_status: undefined }]) {
        const writes = []
        await assert.rejects(syncApprovedMeter(options(current(extra), writes)))
        assert.equal(writes.length, 0)
    }
    const request = options(current())
    const fetchImpl = request.fetchImpl
    request.fetchImpl = (url, init) => init.method === 'PATCH' ? Promise.resolve(new Response(null, { status: 412 })) : fetchImpl(url, init)
    await assert.rejects(syncApprovedMeter(request), /changed during/)
})

test('approval cannot be replayed for a different source Job or equipment', async () => {
    for (const changed of [{ sourceJobId: id(7) }, { equipmentId: id(8) }]) {
        const request = options(current())
        request.record = { ...request.record, ...changed }
        request.fetchImpl = () => { throw new Error('Must not make a Dataverse request') }
        await assert.rejects(syncApprovedMeter(request), /No valid office-approved/)
    }
    assert.ok(approvalReference({ reviewId: id(1), hours: 2147483647, recordedDate: '2026-10-01', equipmentId: id(3) }).length <= 100)
})
