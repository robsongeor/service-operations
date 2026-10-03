import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolveApplicationAccess } from '../src/auth/applicationAccess.ts'
import { createBlankJobBookRow, JOB_BOOK_ENTRY_STAGES } from '../src/alpha/job-book/jobBookPrototype.ts'
import { jobBookClipboardSource, jobBookCopyBlockedReason, jobBookEmailBlockedReason } from '../src/alpha/job-book/jobBookActions.ts'
import { buildNumberedJobBookSpreadsheetRow } from '../src/alpha/jobs/utils/jobBookClipboard.ts'
import { assignedTechnicianEmailBlockedReason, queuePrimaryJobDispatch } from '../src/alpha/jobs/services/primaryJobEmailWorkflow.ts'
import type { CorrectableJob } from '../src/alpha/jobs/services/jobCorrectionsApi.ts'
import { mapManagedJobBookRow } from '../src/alpha/job-book/jobBookApi.ts'
import { JOB_BOOKS } from '../src/alpha/job-book/jobBookConfig.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const job: CorrectableJob = {
    gr_jobid: id(1), '@odata.etag': 'W/"1"', gr_jobnumber: 'WJ1234567', createdon: '2026-10-03T01:00:00Z', gr_description: 'Sample work', gr_ordernumber: 'PO1', gr_status: 122830000, gr_jobtype: 122830000, gr_gtentered: false, gr_timecloudentered: false,
    gr_Mechanic: { gr_mechanicid: id(2), gr_name: 'Sample Technician', gr_email: 'technician@example.invalid' },
    gr_Equipment: { gr_equipmentid: id(3), gr_fleet: 'FN123', gr_alternatefleetnumbers: 'ALT-123', gr_make: 'Make', gr_model: 'Model', gr_serial: 'S1' },
    gr_Site: { gr_siteid: id(4), gr_name: 'Site', gr_address: 'Sample address', gr_Customer: { gr_customerid: id(5), gr_name: 'Customer' } },
}
const draft = { recipientEmail: 'technician@example.invalid', subject: 'Sample Job', technicianComments: 'Sample comment only' }
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })

test('email permission is independent of allocation and absent for JobBookOnly/denied', () => {
    for (const mode of ['full', 'job-card-admin', 'job-book-only', 'denied']) {
        const access = resolveApplicationAccess(null, { isDevelopment: true, enforceAccessControl: true, simulatedMode: mode })
        assert.equal(access.canEmailAssignedTechnician, mode === 'full' || mode === 'job-card-admin')
        assert.equal(access.canManageJobs, mode === 'full')
    }
})

test('managed order-book export matches Jobs exactly, including alternate fleets and long regional number', () => {
    const row = mapManagedJobBookRow(job, JOB_BOOKS.waikato)
    const output = buildNumberedJobBookSpreadsheetRow(jobBookClipboardSource(row))
    assert.equal(output, buildNumberedJobBookSpreadsheetRow(job))
    assert.equal(output, 'Sample Technician\tWJ1234567\tFN123 / ALT-123\tCustomer\t\tSample Technician\n')
    const serialOnly = { ...job, gr_Equipment: { ...job.gr_Equipment!, gr_fleet: null, gr_alternatefleetnumbers: null } }
    assert.equal(buildNumberedJobBookSpreadsheetRow(jobBookClipboardSource(mapManagedJobBookRow(serialOnly, JOB_BOOKS.waikato))), buildNumberedJobBookSpreadsheetRow(serialOnly))
})

test('Intake copies its saved snapshots without requiring or inventing a managed Job', () => {
    const row = { ...createBlankJobBookRow(1), jobNumber: '900010', mechanicName: 'Outwork\nTechnician', customer: 'Customer\tname', fleet: '' }
    assert.equal(jobBookCopyBlockedReason(row), '')
    assert.equal(buildNumberedJobBookSpreadsheetRow(jobBookClipboardSource(row)), 'Outwork Technician\t900010\tW/S\tCustomer name\t\tOutwork Technician\n')
    assert.match(jobBookEmailBlockedReason(row, true), /managed Job/)
    assert.match(jobBookCopyBlockedReason({ ...row, jobNumber: '' }), /Job Number/)
    assert.match(jobBookCopyBlockedReason({ ...row, entryStage: JOB_BOOK_ENTRY_STAGES.VOID }), /Void/)
})

test('Void, unnumbered, unassigned and restricted rows cannot start an email', () => {
    const row = mapManagedJobBookRow(job, JOB_BOOKS.waikato)
    assert.equal(jobBookEmailBlockedReason(row, true), '')
    assert.match(jobBookEmailBlockedReason(row, false), /role/)
    assert.match(jobBookEmailBlockedReason({ ...row, mechanicId: '' }, true), /assign/)
    assert.match(jobBookEmailBlockedReason({ ...row, jobNumber: '' }, true), /Number/)
    assert.match(jobBookEmailBlockedReason({ ...row, entryStage: JOB_BOOK_ENTRY_STAGES.VOID }, true), /Void/)
})

test('fresh Job eligibility validates technician, email, number and workflow', () => {
    assert.equal(assignedTechnicianEmailBlockedReason(job), '')
    assert.match(assignedTechnicianEmailBlockedReason({ ...job, gr_Mechanic: undefined }), /assign/)
    assert.match(assignedTechnicianEmailBlockedReason({ ...job, gr_Mechanic: { ...job.gr_Mechanic!, gr_email: 'invalid' } }), /valid email/)
    assert.match(assignedTechnicianEmailBlockedReason({ ...job, gr_jobnumber: '' }), /Number/)
    assert.match(assignedTechnicianEmailBlockedReason({ ...job, gr_status: 122830005 }), /confirm/)
    assert.match(assignedTechnicianEmailBlockedReason({ ...job, _gr_sitecheck_value: id(9) }), /Site Check/)
})

test('localhost sending is rejected before token-dependent reads, link generation or dispatch', async () => {
    globalThis.fetch = async () => { throw new Error('Unexpected network request') }
    for (const hostname of ['localhost', '127.0.0.1', '::1']) await assert.rejects(queuePrimaryJobDispatch('sample-token', job, draft, { hostname, assignedRecipientOnly: true }), /disabled on localhost/)
})

test('Admin cannot override the assigned recipient even with a crafted draft', async () => {
    globalThis.fetch = async (_url, options) => { assert.notEqual(options?.method, 'POST'); return Response.json(job) }
    await assert.rejects(queuePrimaryJobDispatch('sample-token', job, { ...draft, recipientEmail: 'other@example.invalid' }, { hostname: 'sample.example.invalid', assignedRecipientOnly: true }), /only the assigned technician/)
})

test('changed Job version or technician details requires a fresh preview before any side effect', async () => {
    for (const changed of [
        { ...job, '@odata.etag': 'W/"2"' },
        { ...job, gr_Mechanic: { ...job.gr_Mechanic!, gr_email: 'new@example.invalid' } },
        { ...job, gr_Site: { ...job.gr_Site!, gr_address: 'Changed address' } },
    ]) {
        globalThis.fetch = async (_url, options) => { assert.notEqual(options?.method, 'POST'); return Response.json(changed) }
        await assert.rejects(queuePrimaryJobDispatch('sample-token', job, draft, { hostname: 'sample.example.invalid', assignedRecipientOnly: true }), /changed/)
    }
})

test('missing version and invalid message fail before any writes', async () => {
    globalThis.fetch = async () => { throw new Error('Unexpected request') }
    await assert.rejects(queuePrimaryJobDispatch('sample-token', { ...job, '@odata.etag': undefined }, draft, { hostname: 'sample.example.invalid', assignedRecipientOnly: true }), /current Job version/)
    for (const invalid of [{ ...draft, subject: '' }, { ...draft, subject: 'x'.repeat(501) }, { ...draft, technicianComments: 'x'.repeat(2001) }]) await assert.rejects(queuePrimaryJobDispatch('sample-token', job, invalid, { hostname: 'sample.example.invalid' }), /characters/)
})

test('confirmed ordinary delivery creates only Email Dispatch, without changing Job state, assignment or evidence', async () => {
    const original = structuredClone(job)
    const requests: { url: string; method: string }[] = []
    globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), method: options?.method || 'GET' })
        if (String(url).includes('gr_jobs(')) return Response.json(job)
        if (options?.method === 'POST') {
            assert.match(String(url), /gr_emaildispatchs$/)
            const payload = JSON.parse(String(options.body))
            assert.equal(payload.gr_recipientemail, draft.recipientEmail)
            assert.equal(payload['gr_Job@odata.bind'], `/gr_jobs(${id(1)})`)
            assert.match(payload.gr_body, /Sample comment only/)
            return Response.json({ gr_emaildispatchid: id(7) })
        }
        assert.match(String(url), /gr_emaildispatchs\(/)
        return Response.json({ gr_emailsent: true })
    }
    const queued = await queuePrimaryJobDispatch('sample-token', job, draft, { hostname: 'sample.example.invalid', assignedRecipientOnly: true })
    assert.equal(requests.length, 2, 'queue returns before delivery polling')
    await queued.confirmDelivery()
    assert.equal(requests.length, 3)
    assert.equal(requests.filter((request) => request.method === 'POST').length, 1)
    assert.equal(requests.some((request) => request.method === 'PATCH'), false)
    assert.deepEqual(job, original)
})

test('queue and delivery failure remain distinct, without automatic resend', async () => {
    let writes = 0
    globalThis.fetch = async (url, options) => {
        if (String(url).includes('gr_jobs(')) return Response.json(job)
        if (options?.method === 'POST') { writes += 1; return Response.json({ gr_emaildispatchid: id(7) }) }
        return Response.json({ gr_errormessage: 'Sample delivery failure' })
    }
    const queued = await queuePrimaryJobDispatch('sample-token', job, draft, { hostname: 'sample.example.invalid', assignedRecipientOnly: true })
    await assert.rejects(queued.confirmDelivery(), /Sample delivery failure/)
    assert.equal(writes, 1)
})

test('both tables reuse action controls, composer, clipboard contract and queue workflow', () => {
    const read = (path: string) => readFileSync(new URL(`../src/alpha/${path}`, import.meta.url), 'utf8')
    for (const path of ['jobs/components/JobsTable.tsx', 'job-book/JobBookPrototypeScreen.tsx']) {
        assert.match(read(path), /<JobQuickActions/)
        assert.match(read(path), /<JobEmailComposer/)
    }
    assert.match(read('jobs/hooks/useJobs.ts'), /usePrimaryJobEmail\(\{/)
    assert.match(read('job-book/useJobBookActions.ts'), /usePrimaryJobEmail\(\{/)
    assert.match(read('job-book/useJobBookActions.ts'), /copyNumberedJobBookSpreadsheetRow/)
    assert.match(read('job-book/JobBookPrototypeScreen.tsx'), /assignedRecipientOnly=\{!canManageJobs\}/)
    assert.match(read('jobs/hooks/usePrimaryJobEmail.ts'), /pending.current.has/)
    assert.match(read('jobs/hooks/usePrimaryJobEmail.ts'), /enabled\) throw new Error/)
    const jobBook = read('job-book/JobBookPrototypeScreen.tsx')
    assert.doesNotMatch(jobBook, /<JobQuickActions labels|>Correct details</)
    assert.match(jobBook, /canCorrectJobDetails && row.linkedJobId[\s\S]*>Edit entry</)
    assert.match(jobBook, /aria-label="Mark as void" disabled=\{Boolean\(voidBlocked\) \|\| markerBusy \|\| loading\}/)
})
