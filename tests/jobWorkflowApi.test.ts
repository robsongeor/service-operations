import assert from 'node:assert/strict'
import test from 'node:test'
import { buildJobWorkflowAction, createJobWorkflowClient, runJobWorkflow, type VoidRegisteredJobBookEntryCommand } from '../src/alpha/jobs/services/jobWorkflowApi.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const manage = { kind: 'manage', jobId: id(1), jobEtag: 'W/"10"' } as const
const voidCommand: VoidRegisteredJobBookEntryCommand = { kind: 'void', book: 'christchurch', jobId: id(1), ledgerId: id(2), jobEtag: 'W/"10"', ledgerEtag: 'W/"20"', reason: ' Entered twice ' }
const manageResult = { JobId: id(1), JobRowVersion: '11', CoordinatorManaged: true, RegistrationVoid: false, WasReplay: false }
const voidResult = { JobId: id(1), LedgerId: id(2), JobRowVersion: '11', LedgerRowVersion: '21', CoordinatorManaged: false, RegistrationVoid: true, WasReplay: false }
const dispatch = { kind: 'dispatch', requestId: id(3), jobId: id(1), jobEtag: 'W/"10"', recipientEmail: ' TECH@example.invalid ', subject: ' Job details ', body: ' <p>Body</p> ' } as const
const dispatchResult = { DispatchId: id(3), WasReplay: false }
const client = (fetcher: typeof fetch) => createJobWorkflowClient({ enabled: true, apiUrl: 'https://dataverse.example.invalid/api/data/v9.2', fetcher })

test('workflow client is disabled by default and has no direct-write fallback', async () => {
    await assert.rejects(() => runJobWorkflow('sample', manage), { kind: 'disabled' })
    const disabled = createJobWorkflowClient({ enabled: false, apiUrl: 'unused', fetcher: async () => assert.fail('Unexpected request') })
    await assert.rejects(() => disabled('sample', manage), { kind: 'disabled' })
})

test('Manage job accepts only identity and an exact Job version', () => {
    assert.deepEqual(buildJobWorkflowAction(manage), { action: 'gr_ManageJobBookJob', parameters: { JobId: id(1), ExpectedJobRowVersion: '10' } })
    assert.ok(Object.isFrozen(buildJobWorkflowAction(manage).parameters))
    for (const jobEtag of ['', '*', 'W/"*"', 'W/"1"\r\nOther: x']) assert.throws(() => buildJobWorkflowAction({ ...manage, jobEtag }), /exact current version/)
    assert.throws(() => buildJobWorkflowAction({ ...manage, jobType: 122830000 } as never), /unrelated/)
})

test('registered Void carries both exact versions, region and trimmed reason only', () => {
    assert.deepEqual(buildJobWorkflowAction(voidCommand), {
        action: 'gr_VoidRegisteredJobBookEntry',
        parameters: { JobId: id(1), ExpectedJobRowVersion: '10', Book: 'christchurch', LedgerId: id(2), ExpectedLedgerRowVersion: '20', Reason: 'Entered twice' },
    })
    for (const change of [
        { book: 'unknown' }, { jobId: 'not-a-guid' }, { ledgerId: '00000000-0000-0000-0000-000000000000' },
        { ledgerEtag: '*' }, { reason: ' ' }, { reason: 'x'.repeat(1001) },
    ]) assert.throws(() => buildJobWorkflowAction({ ...voidCommand, ...change } as never))
    assert.throws(() => buildJobWorkflowAction({ ...voidCommand, entered: false } as never), /unrelated/)
})

test('initial dispatch accepts one retained request and no caller-supplied technician or assignment', () => {
    assert.deepEqual(buildJobWorkflowAction(dispatch), {
        action: 'gr_QueueInitialJobDispatch',
        parameters: { JobId: id(1), ExpectedJobRowVersion: '10', RequestId: id(3), RecipientEmail: 'tech@example.invalid', Subject: 'Job details', Body: '<p>Body</p>' },
    })
    for (const change of [
        { requestId: 'new' }, { recipientEmail: 'not-an-email' }, { subject: ' ' }, { subject: 'x'.repeat(501) }, { body: ' ' }, { body: 'x'.repeat(100001) },
    ]) assert.throws(() => buildJobWorkflowAction({ ...dispatch, ...change } as never))
    assert.throws(() => buildJobWorkflowAction({ ...dispatch, mechanicId: id(9) } as never), /unrelated/)
    assert.throws(() => buildJobWorkflowAction({ ...dispatch, assignmentId: id(9) } as never), /unrelated/)
})

test('one guarded action request returns verified workflow state', async () => {
    const save = client(async (url, options) => {
        assert.match(String(url), /\/gr_VoidRegisteredJobBookEntry$/)
        assert.equal(options?.method, 'POST')
        assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer sample')
        assert.deepEqual(JSON.parse(String(options?.body)), buildJobWorkflowAction(voidCommand).parameters)
        return Response.json(voidResult)
    })
    assert.deepEqual(await save('sample', voidCommand), {
        jobId: id(1), ledgerId: id(2), jobEtag: 'W/"11"', ledgerEtag: 'W/"21"', coordinatorManaged: false, registrationVoid: true, replayed: false,
    })
})

test('initial dispatch posts once and verifies the retained request identity', async () => {
    let calls = 0
    const save = client(async (url, options) => {
        calls++
        assert.match(String(url), /\/gr_QueueInitialJobDispatch$/)
        assert.deepEqual(JSON.parse(String(options?.body)), buildJobWorkflowAction(dispatch).parameters)
        return Response.json(dispatchResult)
    })
    assert.deepEqual(await save('sample', dispatch), { jobId: id(1), dispatchId: id(3), replayed: false })
    assert.equal(calls, 1)
    await assert.rejects(() => client(async () => Response.json({ ...dispatchResult, DispatchId: id(9) }))('sample', dispatch), { kind: 'unknown' })
})

test('uncertain responses never trigger an automatic retry', async () => {
    let calls = 0
    const save = client(async () => { calls++; throw new Error('Connection lost after commit') })
    await assert.rejects(() => save('sample', voidCommand), { kind: 'unknown' })
    assert.equal(calls, 1)
})

test('safe errors distinguish conflicts, access rejection, reconciliation and uncertainty', async () => {
    for (const [status, code, kind] of [
        [412, '', 'conflict'], [400, 'CONFLICT', 'conflict'], [403, '', 'rejected'], [400, 'FORBIDDEN', 'rejected'],
        [400, 'INVALID', 'rejected'], [400, 'INCONSISTENT', 'rejected'], [404, '', 'rejected'], [500, 'SAVE_FAILED', 'unknown'],
    ] as const) {
        const save = client(async () => Response.json({ error: { message: `[JOB_WORKFLOW_${code}] private details` } }, { status }))
        await assert.rejects(() => save('sample', manage), (error: Error & { kind: string }) => {
            assert.equal(error.kind, kind)
            assert.doesNotMatch(error.message, /private details/)
            return true
        })
    }
})

test('mismatched or contradictory success payloads remain unconfirmed', async () => {
    for (const change of [
        { JobId: id(9) }, { LedgerId: id(9) }, { JobRowVersion: '' }, { LedgerRowVersion: '*' },
        { CoordinatorManaged: true }, { RegistrationVoid: false }, { WasReplay: undefined },
    ]) await assert.rejects(() => client(async () => Response.json({ ...voidResult, ...change }))('sample', voidCommand), { kind: 'unknown' })
    await assert.rejects(() => client(async () => Response.json({ ...manageResult, CoordinatorManaged: false }))('sample', manage), { kind: 'unknown' })
})
