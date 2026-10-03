import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
    assertJobCanBeDeleted, assertJobNumberUnchanged, hasAllocatedJobNumber,
    requireJobNumberEtag, validateImportedJobNumber,
} from '../src/alpha/jobs/domain/jobNumberPolicy.ts'
import { allocateJobNumbers, buildJobUpdateFields, deleteJob, updateJob, updateJobFields } from '../src/alpha/jobs/services/jobsApi.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import type { JobSaveInput } from '../src/alpha/jobs/types/jobSave.types.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const blank = (n = 1): Job => ({
    gr_jobid: id(n), gr_jobnumber: null, '@odata.etag': `W/"${n}"`,
    gr_description: 'Sample work', gr_ordernumber: null, gr_status: 122830001, createdon: '',
})
const input: JobSaveInput = {
    jobNumber: '999999999', description: 'Sample correction', orderNumber: 'PO-1',
    jobType: 122830000, status: 122830001, serviceType: 122830000,
}
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })
const batchSuccess = (count = 1) => new Response(Array(count).fill('HTTP/1.1 204 No Content').join('\r\n'))

test('numbers remain strings, including leading zeros and every region beyond five digits', () => {
    for (const value of ['0000123456789', 'WJ123456789', 'HJ123456789', 'CJ123456789', '9'.repeat(30)]) {
        assert.equal(validateImportedJobNumber(` ${value} `), value)
        assert.equal(hasAllocatedJobNumber({ gr_jobnumber: value }), true)
        assert.throws(() => assertJobCanBeDeleted({ ...blank(), gr_jobnumber: value }), /cannot be deleted/)
    }
    for (const value of ['', 'WJ', 'WJ-123', 'ABC123', '12.3', '1e6', '9'.repeat(31)]) {
        assert.throws(() => validateImportedJobNumber(value), /numeric Job number/)
    }
})

test('historical numbers of any format remain protected; blank/null numbers remain unallocated', () => {
    for (const value of ['OLD-123', 'SC-1', 'WOF/123']) {
        assert.throws(() => assertJobCanBeDeleted({ ...blank(), gr_jobnumber: value }), /cannot be deleted/)
        assert.doesNotThrow(() => assertJobNumberUnchanged({ ...blank(), gr_jobnumber: value }, value))
    }
    for (const value of [null, undefined, '', ' ']) {
        assert.equal(hasAllocatedJobNumber({ gr_jobnumber: value }), false)
        assert.doesNotThrow(() => assertJobCanBeDeleted({ ...blank(), gr_jobnumber: value }))
    }
})

test('editing can neither allocate, replace nor clear numbers', () => {
    assert.throws(() => assertJobNumberUnchanged(blank(), '123'), /cannot be changed/)
    assert.throws(() => assertJobNumberUnchanged({ ...blank(), gr_jobnumber: 'WJ123' }, 'WJ124'), /cannot be changed/)
    assert.throws(() => assertJobNumberUnchanged({ ...blank(), gr_jobnumber: 'WJ123' }, ''), /cannot be changed/)
    assert.doesNotThrow(() => assertJobNumberUnchanged({ ...blank(), gr_jobnumber: 'WJ123' }, ' WJ123 '))
})

test('generic Job and completion patch builder never includes a number from a stale draft', () => {
    const patch = buildJobUpdateFields(input)
    assert.equal(Object.hasOwn(patch, 'gr_jobnumber'), false)
    assert.equal(patch.gr_description, 'Sample correction')
    assert.equal(patch.gr_status, 122830001)
})

test('ordinary Job save cannot overwrite a concurrently allocated number', async () => {
    globalThis.fetch = async (_url, options) => {
        assert.equal(options?.method, 'PATCH')
        assert.equal(Object.hasOwn(JSON.parse(String(options.body)), 'gr_jobnumber'), false)
        return new Response(null, { status: 204 })
    }
    await updateJob('sample', id(1), input)
})

test('generic field API rejects explicit number writes before any request, including null or undefined', async () => {
    globalThis.fetch = async () => { assert.fail('No request should occur') }
    for (const value of ['123', '', null, undefined]) {
        await assert.rejects(() => updateJobFields('sample', id(1), { gr_jobnumber: value } as never), /allocated separately/)
    }
})

test('invalid or already-numbered bulk selections make no requests', async () => {
    globalThis.fetch = async () => { assert.fail('No request should occur') }
    for (const allocations of [
        [{ job: { ...blank(), gr_jobnumber: '123' }, jobNumber: '124' }],
        [{ job: { ...blank(), gr_jobnumber: '123' }, jobNumber: '123' }],
        [{ job: { ...blank(), '@odata.etag': '*' }, jobNumber: '124' }],
        [{ job: { ...blank(), gr_jobid: 'not-a-guid' }, jobNumber: '124' }],
        [{ job: blank(), jobNumber: 'WJ123' }, { job: blank(2), jobNumber: 'WJ123' }],
        [{ job: blank(), jobNumber: '123' }, { job: blank(), jobNumber: '124' }],
        Array.from({ length: 101 }, (_, i) => ({ job: blank(i + 1), jobNumber: String(i + 1) })),
    ]) await assert.rejects(() => allocateJobNumbers('sample', allocations))
})

test('bulk preflight rereads bounded number/version projections before one conditional changeset', async () => {
    const jobs = Array.from({ length: 41 }, (_, i) => blank(i + 1))
    const calls: string[] = []
    globalThis.fetch = async (url, options) => {
        calls.push(String(url))
        if (options?.method !== 'POST') {
            const query = new URL(String(url), 'http://localhost').searchParams
            assert.equal(query.get('$select'), 'gr_jobid,gr_jobnumber')
            assert.equal(query.get('$top'), '40')
            assert.equal(options?.cache, 'no-store')
            return Response.json({ value: jobs.filter((job) => query.get('$filter')!.includes(job.gr_jobid)) })
        }
        assert.equal(calls.length, 3)
        assert.equal((String(options.body).match(/PATCH \/api\/data\/v9.2\/gr_jobs/g) || []).length, 41)
        assert.match(String(options.body), /If-Match: W\/"41"/)
        assert.match(String(options.body), /"gr_jobnumber":"WJ123456741"/)
        return batchSuccess(41)
    }
    await allocateJobNumbers('sample', jobs.map((job, i) => ({ job, jobNumber: `WJ1234567${i + 1}` })))
    assert.equal(calls.length, 3)
})

test('a number allocated since the table loaded blocks the entire changeset', async () => {
    globalThis.fetch = async (_url, options) => {
        assert.notEqual(options?.method, 'POST')
        return Response.json({ value: [{ ...blank(), gr_jobnumber: 'CJ987654321', '@odata.etag': 'W/"new"' }, blank(2)] })
    }
    await assert.rejects(() => allocateJobNumbers('sample', [
        { job: blank(), jobNumber: '123' }, { job: blank(2), jobNumber: '124' },
    ]), /already has a number/)
})

test('missing, failed, partial and changed preflight records all fail closed', async () => {
    for (const response of [
        Response.json({ value: [] }),
        Response.json({ error: 'Not allowed' }, { status: 403 }),
        Response.json({ value: [blank()], '@odata.nextLink': 'https://untrusted.invalid/next' }),
        Response.json({ value: [{ ...blank(), '@odata.etag': 'W/"new"' }] }),
        Response.json({ value: [{ ...blank(), '@odata.etag': '*' }] }),
        Response.json({ value: [{ gr_jobid: id(1), '@odata.etag': 'W/"1"' }] }),
        Response.json({ value: [blank(), blank()] }),
        Response.json({ value: [blank(2)] }),
    ]) {
        globalThis.fetch = async (_url, options) => {
            assert.notEqual(options?.method, 'POST')
            return response
        }
        await assert.rejects(() => allocateJobNumbers('sample', [{ job: blank(), jobNumber: '123' }]))
    }
})

test('allocation racing after preflight reports conflict without retrying', async () => {
    let writes = 0
    globalThis.fetch = async (_url, options) => {
        if (options?.method !== 'POST') return Response.json({ value: [blank()] })
        writes++
        assert.match(String(options.body), /If-Match: W\/"1"/)
        return new Response('HTTP/1.1 412 Precondition Failed', { status: 200 })
    }
    await assert.rejects(() => allocateJobNumbers('sample', [{ job: blank(), jobNumber: '123' }]), /changed elsewhere/)
    assert.equal(writes, 1)
})

test('caller changes during preflight cannot swap the displayed version or requested number', async () => {
    const allocations = [{ job: blank(), jobNumber: '123' }]
    globalThis.fetch = async (_url, options) => {
        if (options?.method !== 'POST') {
            allocations[0].job['@odata.etag'] = 'W/"new"'
            allocations[0].jobNumber = '999'
            return Response.json({ value: [blank()] })
        }
        assert.match(String(options.body), /If-Match: W\/"1"/)
        assert.match(String(options.body), /"gr_jobnumber":"123"/)
        assert.doesNotMatch(String(options.body), /999|new/)
        return batchSuccess()
    }
    await allocateJobNumbers('sample', allocations)
})

test('authoritative numbered Job blocks deletion even if its caller was stale', async () => {
    globalThis.fetch = async (url, options) => {
        assert.notEqual(options?.method, 'DELETE')
        assert.match(String(url), /\?\$select=gr_jobid,gr_jobnumber$/)
        return Response.json({ ...blank(), gr_jobnumber: 'HJ1234567' })
    }
    await assert.rejects(() => deleteJob('sample', id(1)), /cannot be deleted/)
})

test('unnumbered deletion is conditional, so concurrent allocation cannot be deleted', async () => {
    let deletes = 0
    globalThis.fetch = async (_url, options) => {
        if (options?.method !== 'DELETE') return Response.json(blank())
        deletes++
        assert.equal(new Headers(options.headers).get('If-Match'), 'W/"1"')
        return new Response(null, { status: 412 })
    }
    await assert.rejects(() => deleteJob('sample', id(1)), /received a number elsewhere/)
    assert.equal(deletes, 1)
})

test('successful unnumbered deletion and already-absent Job are handled without retries', async () => {
    let requests = 0
    globalThis.fetch = async (_url, options) => {
        requests++
        return options?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(blank())
    }
    await deleteJob('sample', id(1))
    assert.equal(requests, 2)
    globalThis.fetch = async (_url, options) => {
        assert.notEqual(options?.method, 'DELETE')
        return new Response(null, { status: 404 })
    }
    await deleteJob('sample', id(1))
})

test('number guards require exact versions, never a wildcard or header injection', () => {
    for (const etag of [undefined, '*', '', 'W/"1"\r\nInjected: x', '1']) {
        assert.throws(() => requireJobNumberEtag({ ...blank(), '@odata.etag': etag }), /Reload/)
    }
})

test('canonical drawer/table never expose number edits and numbered deletion is hidden', () => {
    const read = (file: string) => readFileSync(new URL(`../src/alpha/jobs/${file}`, import.meta.url), 'utf8')
    assert.match(read('components/JobCoreFields.tsx'), /readOnly=\{stagingOnly \|\| correctionsOnly \|\| Boolean\(jobBookJob\)\}/)
    assert.match(read('components/JobsTable.tsx'), /aria-label="Job number"\s+readOnly/)
    assert.doesNotMatch(read('components/JobsTable.tsx'), /onJobFieldsChange\(job.gr_jobid, \{ gr_jobnumber/)
    assert.match(read('components/JobsTable.tsx'), /disabled=\{selectedShownJobs.length === 0 \|\| isPastingJobNumbers \|\| selectionContainsNumberedJob\}/)
    assert.match(read('components/JobEditDrawer.tsx'), /!correctionsOnly && !hasAllocatedJobNumber\(job\) && <button/)
    assert.doesNotMatch(read('hooks/useJobs.ts'), /gr_jobnumber: job.jobNumber/)
})
