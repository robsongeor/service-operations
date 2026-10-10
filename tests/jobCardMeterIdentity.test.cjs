const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { getJobCardMeterDataverseApplicationToken } = require('../api/services/dataverseApplicationToken')
const { reconcilePendingCompletionReviews } = require('../api/services/jobOperationalStatusAutomation')
const original = { ...process.env }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test.beforeEach(() => {
    process.env.DATAVERSE_URL = 'https://meter-test.invalid'
    process.env.JOB_CARD_METER_APPROVAL_ENABLED = 'true'
    for (const key of ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET']) delete process.env[`JOB_CARD_METER_DATAVERSE_${key}`]
})
test.afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]
    Object.assign(process.env, original)
})
test('meter credentials fail closed without falling back to GreenTree or general application credentials', async () => {
    Object.assign(process.env, { GREENTREE_DATAVERSE_CLIENT_ID: 'shared', GREENTREE_DATAVERSE_CLIENT_SECRET: 'sample', DATAVERSE_CLIENT_ID: 'general' })
    const fetchImpl = () => { throw new Error('Token request must not be sent') }
    await assert.rejects(getJobCardMeterDataverseApplicationToken({ fetchImpl }), /dedicated/)
    process.env.JOB_CARD_METER_DATAVERSE_CLIENT_ID = 'SHARED'
    await assert.rejects(getJobCardMeterDataverseApplicationToken({ fetchImpl }), /dedicated/)
    process.env.JOB_CARD_METER_DATAVERSE_CLIENT_ID = 'general'
    await assert.rejects(getJobCardMeterDataverseApplicationToken({ fetchImpl }), /dedicated/)
    process.env.JOB_CARD_METER_DATAVERSE_CLIENT_ID = 'dedicated'
    await assert.rejects(getJobCardMeterDataverseApplicationToken({ fetchImpl }), /unavailable/)
})
test('token request uses only dedicated credentials and the configured Dataverse audience', async () => {
    Object.assign(process.env, { JOB_CARD_METER_DATAVERSE_CLIENT_ID: 'meter-app', JOB_CARD_METER_DATAVERSE_TENANT_ID: 'meter-tenant', JOB_CARD_METER_DATAVERSE_CLIENT_SECRET: 'fixture-secret' })
    assert.equal(await getJobCardMeterDataverseApplicationToken({ fetchImpl: async (url, request) => {
        assert.equal(url, 'https://login.microsoftonline.com/meter-tenant/oauth2/v2.0/token')
        assert.deepEqual(Object.fromEntries(request.body), { grant_type: 'client_credentials', client_id: 'meter-app', client_secret: 'fixture-secret', scope: 'https://meter-test.invalid/.default' })
        return Response.json({ access_token: 'dedicated-token' })
    } }), 'dedicated-token')
})
const pending = (n) => ({ reviewId: id(n), sourceJobId: id(n + 100), equipmentId: id(3), etag: 'old', meterSyncStatus: 'failed',
    meterApprovalJson: JSON.stringify({ reviewId: id(n), jobId: id(n + 100), equipmentId: id(3), hours: 1620, recordedDate: '2026-10-09', approvedBy: { userId: id(9) } }) })
const storeFor = (records) => {
    const writes = [], cursors = []
    return { writes, cursors, listReconciliationPage: async () => ({ records, next: 'next' }), listByJobId: async () => [],
        replace: async (record, etag) => { writes.push({ record, etag }); return record }, saveReconciliationCursor: async (cursor) => { cursors.push(cursor) } }
}
test('scheduled meter retries use a separate identity once per batch, never the status caller', async () => {
    const store = storeFor([pending(1), pending(2)])
    let tokens = 0, writes = 0
    const result = await reconcilePendingCompletionReviews({ store, dataverseOrigin: 'https://meter-test.invalid', authorization: 'Bearer ordinary-status-caller',
        acquireMeterToken: async () => { tokens++; return 'meter-only' }, fetchImpl: async (url, request) => {
            assert.equal(request.headers.Authorization, 'Bearer meter-only')
            if (request.method === 'PATCH') { writes++; return new Response(null, { status: 204 }) }
            return Response.json({ gr_jobid: /gr_jobs\(([^)]+)\)/.exec(url)[1], _gr_equipment_value: id(3), statecode: 0, gr_status: 122830004, '@odata.etag': 'W/"1"' })
        } })
    assert.equal(tokens, 1)
    assert.equal(writes, 2)
    assert.equal(result.meterApplied, 2)
    assert.deepEqual(store.writes.map(({ record }) => record.meterSyncStatus), ['applied', 'applied'])
})
test('failed dedicated authentication preserves approvals for retry without borrowing caller authority', async () => {
    const record = pending(1), store = storeFor([record])
    const result = await reconcilePendingCompletionReviews({ store, dataverseOrigin: 'https://meter-test.invalid', authorization: 'Bearer broad-caller',
        acquireMeterToken: async () => { throw new Error('Credential unavailable') }, fetchImpl: () => { throw new Error('Must not contact Dataverse') } })
    assert.equal(result.meterFailed, 1)
    assert.equal(result.meterApplied, 0)
    assert.equal(store.writes.length, 0)
    assert.equal(record.meterSyncStatus, 'failed')
    assert.deepEqual(store.cursors, ['next'])
})
test('disabled or empty meter work never requests a meter credential', async () => {
    for (const records of [[], [pending(1)]]) {
        process.env.JOB_CARD_METER_APPROVAL_ENABLED = records.length ? 'false' : 'true'
        const result = await reconcilePendingCompletionReviews({ store: storeFor(records), dataverseOrigin: 'https://meter-test.invalid', authorization: 'Bearer ordinary',
            acquireMeterToken: () => { throw new Error('Must not acquire token') }, fetchImpl: () => { throw new Error('Must not call backend') } })
        assert.equal(result.meterApplied, 0)
        assert.equal(result.meterFailed, 0)
    }
})

test('meter deployment contract has no baseline, human role grant, impersonation or automatic activation', () => {
    const read = (file) => readFileSync(require('node:path').join(__dirname, '..', file), 'utf8')
    const policy = JSON.parse(read('dataverse/access/job-card-meter-writer.json'))
    assert.equal(policy.baselineRole, null)
    assert.equal(policy.featureEnableIncluded, false)
    assert.deepEqual(policy.patchFields, ['gr_hourmeter', 'gr_hourmeterreadingtype', 'gr_hourmeterrecordeddate', 'gr_hourmeterapprovalreference'])
    assert.deepEqual(policy.privileges.map(({ name }) => name), ['prvReadgr_Job', 'prvWritegr_Job', 'prvReadgr_Equipment', 'prvReadSystemUser', 'prvReadRole', 'prvReadTeam'])
    assert.ok(policy.privileges.every(({ depth }) => depth === 'Global'))
    const inspector = read('scripts/inspect-job-card-meter-access.ps1')
    assert.match(inspector, /\$LoginPrompt = 'Never'/)
    assert.match(inspector, /RetrieveRolePrivilegesRoleRequest/)
    assert.match(inspector, /teamroles/)
    assert.match(inspector, /Incomplete.*result/)
    assert.doesNotMatch(inspector, /CreateRequest|UpdateRequest|DeleteRequest|AddPrivilegesRoleRequest|AssociateRequest|PublishXmlRequest|\.Update\(|\.Create\(/)
    const configure = read('scripts/configure-job-card-meter-guard.ps1')
    assert.match(configure, /\$Mode = 'Plan'/)
    assert.match(configure, /ConfirmMeterFeatureDisabled/)
    assert.match(configure, /ConfirmExclusiveDeploymentWindow/)
    assert.match(configure, /ExecuteTransactionRequest/)
    assert.match(configure, /\[IO\.FileMode\]::CreateNew/)
    assert.doesNotMatch(configure, /AddPrivilegesRoleRequest|AssociateRequest|DeleteRequest|SetStateRequest|ClientSecret/)
    assert.match(read('api/services/jobSubmissionService.js'), /async function synchronizeMeter[\s\S]*?getJobCardMeterDataverseApplicationToken\(\)/)
})
