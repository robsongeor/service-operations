import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const job = {
    gr_jobid: id(1), '@odata.etag': 'W/"10"', gr_jobnumber: '900001', createdon: '2026-10-06T00:00:00Z',
    gr_description: 'Sample work', gr_status: 122830000, gr_jobtype: 122830000,
    gr_Mechanic: { gr_mechanicid: id(2), gr_name: 'Sample Technician', gr_email: 'tech@example.invalid' },
    gr_Site: { gr_siteid: id(3), gr_name: 'Sample Site', gr_address: 'Sample address', gr_Customer: { gr_customerid: id(4), gr_name: 'Sample Customer' } },
}
const draft = { recipientEmail: 'tech@example.invalid', subject: 'Job details', technicianComments: 'Safe note' }
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
let server, queuePrimaryJobDispatch, fetchUnifiedJobsPage, unifiedJobsServerFilter
let buildJobCreatePayload, createJob, createJobsAtomically, allocateJobNumbers, allocateSiteCheckJobNumbers, clearSiteCheckJobNumber, deleteSiteCheckOccurrence, updateWof

test.before(async () => {
    globalThis.window = { location: { hostname: 'app.example.invalid', origin: 'https://app.example.invalid' }, setTimeout }
    server = await createServer({ configFile: false, envDir: false, define: {
        'import.meta.env.VITE_UNIFIED_JOB_WORKFLOW_ENABLED': '"true"',
        'import.meta.env.VITE_DATAVERSE_URL': '"https://dataverse.example.invalid"',
    }, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
    queuePrimaryJobDispatch = (await server.ssrLoadModule('/src/alpha/jobs/services/primaryJobEmailWorkflow.ts')).queuePrimaryJobDispatch
    ;({ fetchUnifiedJobsPage, unifiedJobsServerFilter, buildJobCreatePayload, createJob, createJobsAtomically, allocateJobNumbers } = await server.ssrLoadModule('/src/alpha/jobs/services/jobsApi.ts'))
    ;({ allocateSiteCheckJobNumbers, clearSiteCheckJobNumber, deleteSiteCheckOccurrence } = await server.ssrLoadModule('/src/alpha/site-checks/services/siteChecksApi.ts'))
    ;({ updateWof } = await server.ssrLoadModule('/src/alpha/wof/services/wofApi.ts'))
})
test.after(async () => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; await server?.close() })

test('gated Admin dispatch queues only through the guarded Custom API', async () => {
    const requests = []
    globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), method: options?.method ?? 'GET', body: options?.body && JSON.parse(String(options.body)) })
        if (String(url).includes('/gr_jobs(')) return Response.json(job)
        if (String(url).endsWith('/gr_QueueInitialJobDispatch')) return Response.json({ DispatchId: id(9), WasReplay: false })
        if (String(url).includes('/gr_emaildispatchs(')) return Response.json({ gr_emailsent: true })
        throw new Error(`Unexpected request ${url}`)
    }
    const attempt = { requestId: id(9) }
    const queued = await queuePrimaryJobDispatch('token', job, draft, { hostname: 'app.example.invalid', assignedRecipientOnly: true, verifyCurrentJob: true, dispatchAttempt: attempt })
    const action = requests.find((request) => request.url.endsWith('/gr_QueueInitialJobDispatch'))
    assert.equal(action.body.RequestId, id(9))
    assert.equal(action.body.RecipientEmail, 'tech@example.invalid')
    assert.match(action.body.Body, /Safe note/)
    assert.equal(requests.some((request) => request.method === 'POST' && request.url.endsWith('/gr_emaildispatchs')), false)
    await queued.confirmDelivery()
})

test('uncertain guarded dispatch retry reuses the same request and rendered body', async () => {
    const bodies = []
    let actionCalls = 0
    globalThis.fetch = async (url, options) => {
        if (String(url).includes('/gr_jobs(')) return Response.json(job)
        if (String(url).endsWith('/gr_QueueInitialJobDispatch')) {
            bodies.push(String(options.body)); actionCalls++
            if (actionCalls === 1) throw new Error('Connection lost after commit')
            return Response.json({ DispatchId: id(10), WasReplay: true })
        }
        throw new Error(`Unexpected request ${url}`)
    }
    const attempt = { requestId: id(10) }
    await assert.rejects(() => queuePrimaryJobDispatch('token', job, draft, { hostname: 'app.example.invalid', assignedRecipientOnly: true, verifyCurrentJob: true, dispatchAttempt: attempt }), /could not be confirmed/i)
    await queuePrimaryJobDispatch('token', job, draft, { hostname: 'app.example.invalid', assignedRecipientOnly: true, verifyCurrentJob: true, dispatchAttempt: attempt })
    assert.equal(bodies.length, 2)
    assert.equal(bodies[0], bodies[1])
})

test('production unified worklist is server-filtered, bounded and explicitly paged', async () => {
    const requests = []
    const next = 'https://dataverse.example.invalid/api/data/v9.2/gr_jobs?$skiptoken=page-2'
    globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), headers: options?.headers })
        return Response.json(requests.length === 1 ? { value: [job], '@odata.nextLink': next } : { value: [] })
    }
    const first = await fetchUnifiedJobsPage('token', 'operational')
    assert.equal(first.records[0].gr_jobid, job.gr_jobid)
    assert.equal(first.next, next)
    const initial = new URL(requests[0].url)
    assert.equal(initial.pathname, '/api/data/v9.2/gr_jobs')
    assert.equal(initial.searchParams.get('$filter'), '(gr_coordinatormanaged eq true or gr_coordinatormanaged eq null) and gr_registrationvoid ne true')
    assert.match(initial.searchParams.get('$select'), /gr_coordinatormanaged/)
    assert.equal(requests[0].headers.Prefer, 'odata.maxpagesize=100')
    await fetchUnifiedJobsPage('token', 'operational', first.next)
    assert.equal(requests[1].url, next)
})

test('production worklist filters preserve tab meaning and reject untrusted paging', async () => {
    assert.equal(unifiedJobsServerFilter('all'), '')
    assert.equal(unifiedJobsServerFilter('staging'), 'gr_jobnumber eq null and gr_registrationvoid ne true')
    assert.equal(unifiedJobsServerFilter('unnumbered'), 'gr_jobnumber eq null and gr_registrationvoid ne true')
    assert.match(unifiedJobsServerFilter('unconfirmed'), /gr_status eq 122830005/)
    assert.equal(unifiedJobsServerFilter(122830004), 'gr_jobtype eq 122830004 and gr_registrationvoid ne true')
    globalThis.fetch = async () => Response.json({ value: [], '@odata.nextLink': 'https://attacker.invalid/api/data/v9.2/gr_jobs?$skiptoken=x' })
    await assert.rejects(() => fetchUnifiedJobsPage('token', 'all'), /invalid Jobs continuation link/)
})

test('unified runtime fails closed before every remaining direct number mutation', async () => {
    globalThis.fetch = async () => { throw new Error('A blocked number mutation must not reach Dataverse.') }
    await assert.rejects(() => createJob('token', { jobNumber: '145900' }), /cannot be supplied during creation/)
    await assert.rejects(() => createJobsAtomically('token', [{ jobNumber: '145900' }]), /regional allocation system/)
    await assert.rejects(() => allocateJobNumbers('token', [{ job: {}, jobNumber: '145900' }]), /Manual Job number entry is disabled/)
    await assert.rejects(() => allocateSiteCheckJobNumbers('token', []), /Manual Site Check Job number entry is disabled/)
    await assert.rejects(() => clearSiteCheckJobNumber('token', {}), /cannot be cleared or reused/)
    await assert.rejects(() => deleteSiteCheckOccurrence('token', {}, [{ gr_jobnumber: '145900' }], []), /must be retained as history/)
})

test('unified Job creation omits the number field entirely', () => {
    const payload = buildJobCreatePayload({
        jobNumber: '', orderNumber: '', description: 'Staged work', jobType: 122830000,
        status: 122830005, serviceType: 122830000, siteId: id(3),
    })
    assert.equal(Object.hasOwn(payload, 'gr_jobnumber'), false)
})

test('unified WOF corrections never submit the Job number field', async () => {
    const requests = []
    globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), body: options?.body ? JSON.parse(String(options.body)) : undefined })
        return new Response(null, { status: 204 })
    }
    await updateWof('token', {
        jobId: id(20), inspectionId: id(21), jobNumber: '145900', description: 'WOF inspection',
        equipment: { gr_equipmentid: id(22) }, assignmentMode: 'internal', internalInspectorId: id(23),
        registrationNumberSnapshot: 'ABC123', previousWofExpiry: '', inspectionDate: '', newWofExpiry: '',
        result: 122830000, certificateNumber: '', notes: '', scheduledDate: '',
    })
    assert.equal(requests.length, 2)
    assert.equal(Object.hasOwn(requests[0].body, 'gr_jobnumber'), false)
    assert.equal(requests[0].body.gr_description, 'WOF inspection')
})
