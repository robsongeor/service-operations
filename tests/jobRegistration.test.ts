import assert from 'node:assert/strict'
import test from 'node:test'
import { buildJobRegistrationAction, createJobRegistrationClient, registerOrAllocateJob, type RegisterJobBookCommand } from '../src/alpha/jobs/services/jobRegistrationApi.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const command: RegisterJobBookCommand = { kind: 'register', requestId: id(1), book: 'waikato', description: 'Sample work', siteId: id(2), equipmentUnknown: true, mechanicId: id(3) }
const result = { JobId: id(1), LedgerId: id(1), JobNumber: 'WJ12345678', Book: 'waikato', JobRowVersion: '123', WasReplay: false }
const client = (fetcher: typeof fetch) => createJobRegistrationClient({ enabled: true, apiUrl: 'https://dataverse.example.invalid/api/data/v9.2', fetcher })

test('registration is disabled by default and never falls back to legacy table writes', async () => {
    await assert.rejects(() => registerOrAllocateJob('sample', command), { kind: 'disabled' })
    const disabled = createJobRegistrationClient({ apiUrl: 'unused', enabled: false, fetcher: async () => assert.fail('Unexpected request') })
    await assert.rejects(() => disabled('sample', command), { kind: 'disabled' })
})

test('registration accepts only simple initial data, preserving a stable explicit request ID', () => {
    const { action, parameters } = buildJobRegistrationAction(command)
    assert.equal(action, 'gr_RegisterJobBookJob')
    assert.deepEqual(parameters, { RequestId: id(1), Book: 'waikato', Description: 'Sample work', OrderNumber: '', SiteId: id(2), EquipmentUnknown: true, MechanicId: id(3) })
    assert.ok(Object.isFrozen(parameters))
    assert.deepEqual(buildJobRegistrationAction(command).parameters, parameters)
    for (const field of ['jobNumber', 'jobType', 'status', 'coordinatorManaged', 'recipient', 'actorId', 'schedule', 'entered']) {
        assert.throws(() => buildJobRegistrationAction({ ...command, [field]: 'tampered' } as never), /additional fields/)
    }
})

test('registration accepts bounded external supplier details instead of a Staff lookup', () => {
    const external = { ...command, mechanicId: undefined, externalSupplierDetails: ' AutoTreads — 09 000 0000 ' }
    assert.deepEqual(buildJobRegistrationAction(external).parameters, {
        RequestId: id(1), Book: 'waikato', Description: 'Sample work', OrderNumber: '', SiteId: id(2),
        EquipmentUnknown: true, ExternalSupplierDetails: 'AutoTreads — 09 000 0000',
    })
    assert.throws(() => buildJobRegistrationAction({ ...command, externalSupplierDetails: 'AutoTreads' }), /either a Staff member or another supplier/)
    assert.throws(() => buildJobRegistrationAction({ ...external, externalSupplierDetails: 'x'.repeat(1001) }), /1,000/)
})

test('number allocation carries no corrections or reassignment, and requires an exact version', () => {
    const allocate = { kind: 'allocate', requestId: id(4), book: 'hastings', jobId: id(5), etag: 'W/"987"' } as const
    assert.deepEqual(buildJobRegistrationAction(allocate).parameters, { RequestId: id(4), Book: 'hastings', JobId: id(5), ExpectedRowVersion: '987' })
    for (const etag of ['', '*', 'W/"*"', 'W/"1"\r\nOther: x']) assert.throws(() => buildJobRegistrationAction({ ...allocate, etag }), /exact current version/)
    assert.throws(() => buildJobRegistrationAction({ ...allocate, mechanicId: id(3) } as never), /additional fields/)
})

test('invalid relationships and equipment decisions fail before requesting a number', () => {
    for (const change of [
        { requestId: 'new' }, { requestId: '00000000-0000-0000-0000-000000000000' }, { siteId: '' }, { book: 'unknown' },
        { description: ' ' }, { description: 'x'.repeat(4001) }, { orderNumber: 'x'.repeat(101) },
        { equipmentUnknown: false }, { equipmentId: id(9), equipmentUnknown: true }, { mechanicId: 'not-a-record' },
    ]) assert.throws(() => buildJobRegistrationAction({ ...command, ...change } as never))
})

test('one action request returns verified metadata only, not a second Job create or email', async () => {
    const calls: string[] = []
    const save = client(async (url, options) => {
        calls.push(String(url))
        assert.match(String(url), /\/gr_RegisterJobBookJob$/)
        assert.equal(options?.method, 'POST')
        assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer sample')
        assert.equal(JSON.parse(String(options.body)).RequestId, id(1))
        return Response.json(result)
    })
    assert.deepEqual(await save('sample', command), { jobId: id(1), ledgerId: id(1), jobNumber: 'WJ12345678', book: 'waikato', etag: 'W/"123"', replayed: false })
    assert.equal(calls.length, 1)
})

test('lost responses are uncertain and retries reuse the identical body without automatic sends', async () => {
    const bodies: string[] = []
    const save = client(async (_url, options) => {
        bodies.push(String(options?.body))
        if (bodies.length === 1) throw new Error('Connection lost after commit')
        return Response.json({ ...result, WasReplay: true })
    })
    await assert.rejects(() => save('sample', command), { kind: 'unknown' })
    assert.equal(bodies.length, 1)
    assert.equal((await save('sample', command)).replayed, true)
    assert.equal(bodies[0], bodies[1])
})

test('safe errors distinguish conflicts, forbidden requests, deployment gates and unknown results', async () => {
    for (const [status, code, kind] of [
        [412, '', 'conflict'], [400, 'CONFLICT', 'conflict'], [400, 'REQUEST_REUSED', 'conflict'], [400, 'ALREADY_NUMBERED', 'conflict'],
        [403, '', 'rejected'], [401, '', 'rejected'], [400, 'SPECIALIST', 'rejected'], [400, 'CONFIGURATION', 'rejected'], [404, '', 'rejected'],
        [500, '', 'unknown'], [400, 'SAVE_FAILED', 'unknown'], [429, '', 'unknown'],
    ] as const) {
        let calls = 0
        const save = client(async () => { calls++; return Response.json({ error: { message: `[JOB_REGISTRATION_${code}] private server details` } }, { status }) })
        await assert.rejects(() => save('sample', command), (error: Error & { kind: string }) => { assert.equal(error.kind, kind); assert.doesNotMatch(error.message, /private server details/); return true })
        assert.equal(calls, 1)
    }
})

test('missing or inconsistent success responses cannot appear as confirmed saves', async () => {
    for (const change of [
        { JobId: id(9) }, { LedgerId: id(9) }, { Book: 'hastings' }, { JobNumber: 'HJ123' },
        { JobNumber: 'WJ1'.repeat(20) }, { WasReplay: undefined }, { JobRowVersion: '' }, { JobNumber: 'wj123' },
    ]) await assert.rejects(() => client(async () => Response.json({ ...result, ...change }))('sample', command), { kind: 'unknown' })
    await assert.rejects(() => client(async () => new Response(null, { status: 204 }))('sample', command), { kind: 'unknown' })
})

test('a caller refresh during the request cannot change response verification', async () => {
    const mutable = { ...command }
    const save = client(async () => {
        mutable.requestId = id(99)
        mutable.book = 'hastings'
        return Response.json(result)
    })
    assert.equal((await save('sample', mutable)).jobId, id(1))
})
