import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildJobCorrectionsPatch, fetchJobForCorrection, saveJobCorrections, JobCorrectionConflictError, JobCorrectionRefreshError, type CorrectableJob, type JobCorrectionsInput } from '../src/alpha/jobs/services/jobCorrectionsApi.ts'
import { APPLICATION_ROLES, resolveApplicationAccess } from '../src/auth/applicationAccess.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const job: CorrectableJob = {
    gr_jobid: id(1), '@odata.etag': 'W/"v1"', createdon: '2026-10-03T01:00:00Z',
    gr_jobnumber: 'WJ1234567', gr_description: 'Original', gr_ordernumber: 'PO1',
    gr_jobtype: 122830000, gr_status: 122830003, gr_gtentered: true, gr_timecloudentered: false,
    gr_Site: { gr_siteid: id(2), gr_name: 'Original Site', gr_address: 'Original address', gr_Customer: { gr_customerid: id(3), gr_name: 'Customer' } },
    gr_Contact: { gr_contactid: id(4), gr_name: 'Historical Contact' },
    gr_Equipment: { gr_equipmentid: id(5), gr_fleet: 'F1', gr_make: 'Make', gr_model: 'Model', gr_serial: 'S1' },
    gr_techniciansubmissionstory: 'Immutable evidence', gr_completeddate: '2026-10-02',
}
const input: JobCorrectionsInput = { description: 'Corrected', orderNumber: 'PO1', customerId: id(3), siteId: id(2), contactId: id(4), equipmentId: id(5), mechanicId: '' }
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })
const json = (body: unknown, status = 200) => Response.json(body, { status })

test('corrections capability does not grant operational or master editing', () => {
    for (const simulatedMode of ['full', 'job-card-admin', 'job-book-only', 'denied']) {
        const access = resolveApplicationAccess(null, { enforceAccessControl: true, isDevelopment: true, simulatedMode })
        assert.equal(access.canCorrectJobDetails, ['full', 'job-card-admin'].includes(simulatedMode))
        assert.equal(access.canManageJobs, simulatedMode === 'full')
        assert.equal(access.canEditEquipment, simulatedMode === 'full')
        assert.equal(access.canEditCustomers, simulatedMode === 'full')
    }
    const access = resolveApplicationAccess({ idTokenClaims: { roles: [APPLICATION_ROLES.JOB_CARD_ADMIN] } } as never, { enforceAccessControl: true, isDevelopment: false })
    assert.equal(access.canCorrectJobDetails, true)
    assert.equal(access.canManageJobs, false)
})

test('patch contains changed data only, preserving all original operational fields and evidence', () => {
    const before = structuredClone(job)
    assert.deepEqual(buildJobCorrectionsPatch(job, input), { gr_description: 'Corrected' })
    assert.deepEqual(buildJobCorrectionsPatch(job, { ...input, description: 'Original', orderNumber: '   ' }), { gr_ordernumber: null })
    assert.deepEqual(buildJobCorrectionsPatch(job, { ...input, description: 'Original' }), {})
    assert.deepEqual(job, before)
})

test('relationship corrections use only Job bindings, never mutate master records', () => {
    assert.deepEqual(buildJobCorrectionsPatch(job, { ...input, equipmentId: id(6), mechanicId: id(9), customerId: id(7), siteId: id(8), contactId: '' }), {
        gr_description: 'Corrected', 'gr_Equipment@odata.bind': `/gr_equipments(${id(6)})`, 'gr_Mechanic@odata.bind': `/gr_mechanics(${id(9)})`, 'gr_Site@odata.bind': `/gr_sites(${id(8)})`, 'gr_Contact@odata.bind': null,
    })
    assert.equal(buildJobCorrectionsPatch(job, { ...input, equipmentId: '' })['gr_Equipment@odata.bind'], null)
})

for (const field of ['jobNumber', 'jobType', 'status', 'serviceType', 'hourMeter', 'currentOfficeAction', 'gr_gtentered', 'gr_techniciansubmissionstory', 'address']) {
    test(`rejects unexpected correction field: ${field}`, () => {
        assert.throws(() => buildJobCorrectionsPatch(job, { ...input, [field]: 'tampered' }), /Only recorded Job details/)
    })
}

test('invalid, incomplete and overlong details are rejected before any writes', () => {
    assert.throws(() => buildJobCorrectionsPatch(job, { ...input, description: ' ' }), /description/)
    assert.throws(() => buildJobCorrectionsPatch(job, { ...input, description: 'x'.repeat(4001) }), /4,000/)
    assert.throws(() => buildJobCorrectionsPatch(job, { ...input, equipmentId: 'invalid/path' }), /valid saved record/)
    assert.throws(() => buildJobCorrectionsPatch(job, { ...input, siteId: '' }), /Customer and its Site/)
    assert.throws(() => buildJobCorrectionsPatch(job, { ...input, siteId: '', customerId: '' }), /Site for the Contact/)
})

test('focused read is exact, abortable and excludes all technician evidence and operational children', async () => {
    const controller = new AbortController()
    globalThis.fetch = async (url, options) => {
        assert.ok(String(url).includes(`gr_jobs(${id(1)})?`))
        assert.doesNotMatch(String(url), /techniciansubmission|schedule|token|quote|hourmeter|assignment/i)
        assert.equal(options?.signal, controller.signal)
        return json(job)
    }
    assert.deepEqual(await fetchJobForCorrection('sample', id(1), controller.signal), job)
})

test('successful save verifies Site, preserves unchanged historical Contact and sends the original ETag', async () => {
    const calls: string[] = []
    globalThis.fetch = async (url, options) => {
        calls.push(String(url))
        if (String(url).includes('gr_sites(')) return json(job.gr_Site)
        if (options?.method === 'PATCH') {
            assert.equal(String(url).includes('?$select='), false)
            assert.equal(new Headers(options.headers).get('If-Match'), 'W/"v1"')
            assert.equal(new Headers(options.headers).get('Prefer'), null)
            assert.deepEqual(JSON.parse(String(options.body)), { gr_description: 'Corrected' })
            return new Response(null, { status: 204 })
        }
        assert.ok(String(url).includes('?$select='))
        return json({ ...job, gr_description: 'Corrected', '@odata.etag': 'W/"v2"' })
    }
    const saved = await saveJobCorrections('sample', job, input)
    assert.equal(saved.gr_description, 'Corrected')
    assert.equal(saved.gr_techniciansubmissionstory, job.gr_techniciansubmissionstory)
    assert.equal(calls.length, 3)
})

test('Customer/Site mismatch blocks correction, not just its presentation', async () => {
    globalThis.fetch = async (_url, options) => { assert.notEqual(options?.method, 'PATCH'); return json(job.gr_Site) }
    await assert.rejects(saveJobCorrections('sample', job, { ...input, customerId: id(7) }), /does not belong/)
})

test('changed Contact is verified against the selected Site and rejected when absent', async () => {
    globalThis.fetch = async (url, options) => {
        assert.notEqual(options?.method, 'PATCH')
        if (String(url).includes('gr_sites(')) return json(job.gr_Site)
        assert.ok(String(url).includes(`_gr_site_value eq ${id(2)} and _gr_contact_value eq ${id(9)}`))
        assert.ok(String(url).endsWith('$top=1'))
        return json({ value: [] })
    }
    await assert.rejects(saveJobCorrections('sample', job, { ...input, contactId: id(9) }), /not linked/)
})

test('ETag conflicts do not retry or overwrite another administrator', async () => {
    let writes = 0
    globalThis.fetch = async (url, options) => {
        if (String(url).includes('gr_sites(')) return json(job.gr_Site)
        assert.equal(options?.method, 'PATCH'); writes += 1
        return json({}, 412)
    }
    await assert.rejects(saveJobCorrections('sample', job, input), JobCorrectionConflictError)
    assert.equal(writes, 1)
})

test('missing and wildcard ETags fail closed without network activity', async () => {
    globalThis.fetch = async () => { throw new Error('Unexpected request') }
    for (const etag of [undefined, '', '*']) await assert.rejects(saveJobCorrections('sample', { ...job, '@odata.etag': etag }, input), /current version/)
})

test('permission rejection is actionable and does not retry', async () => {
    globalThis.fetch = async (url) => String(url).includes('gr_sites(') ? json(job.gr_Site) : json({}, 403)
    await assert.rejects(saveJobCorrections('sample', job, input), /permission.*No changes were saved/)
})

test('historical unlinked Job can receive a description correction without invented relationships', async () => {
    const historical = { ...job, gr_Equipment: undefined, gr_Site: undefined, gr_Contact: undefined }
    globalThis.fetch = async (_url, options) => {
        if (options?.method === 'PATCH') {
            assert.deepEqual(JSON.parse(String(options.body)), { gr_description: 'Corrected' })
            return new Response(null, { status: 204 })
        }
        return json({ ...historical, gr_description: 'Corrected', '@odata.etag': 'W/"v2"' })
    }
    await saveJobCorrections('sample', historical, { ...input, equipmentId: '', siteId: '', customerId: '', contactId: '' })
})

test('successful write with failed readback is distinguished from a failed save', async () => {
    globalThis.fetch = async (url, options) => {
        if (String(url).includes('gr_sites(')) return json(job.gr_Site)
        if (options?.method === 'PATCH') return new Response(null, { status: 204 })
        return json({}, 503)
    }
    await assert.rejects(saveJobCorrections('sample', job, input), JobCorrectionRefreshError)
})

test('restricted host keeps five routes and projects only correction fields into the narrow API', () => {
    const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    const app = read('src/App.tsx').split("access.mode === 'job-card-admin' ? <Routes>")[1].split('</Routes>')[0]
    assert.doesNotMatch(app, /path="\/jobs/)
    assert.match(app, /allowManagedJobNavigation=\{false\} allowManagedJobMarkerUpdates=\{access.canUpdateEntryMarkers\}/)
    const screen = read('src/alpha/job-book/JobBookPrototypeScreen.tsx')
    assert.match(screen, /canCorrectJobDetails && correctingJobId && <JobCorrectionsDrawer/)
    const hook = read('src/alpha/jobs/hooks/useJobCorrections.ts')
    assert.doesNotMatch(hook, /\bupdateJob\b|fetchJobs\(|fetchCustomers\(|fetchEquipment\(/)
    assert.match(hook, /invalidateJobsCache\(token\)/)
    assert.match(hook, /setReloadReason\(error.message\)/)
    const projection = hook.split('saveJobCorrections(token, job, {')[1].split('})')[0]
    assert.doesNotMatch(projection, /\.\.\.input|status:|jobType:|jobNumber:/)
    assert.match(projection, /mechanicId:/)
})
