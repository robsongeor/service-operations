import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createBlankJobBookRow, getPromotionReadiness, JOB_BOOK_ENTRY_STAGES, type JobBookRow } from '../src/alpha/job-book/jobBookPrototype.ts'
import { JOB_BOOKS } from '../src/alpha/job-book/jobBookConfig.ts'
import { canUpdateJobBookMarkers, isEditableJobBookIntake, jobBookVoidBlockedReason, jobBookVoidReasonError } from '../src/alpha/job-book/jobBookEntryWorkflow.ts'
import { fetchJobBookIntakeRow, fetchJobBookIntakeRows, JobBookConflictError, updateJobBookIntakeMarker, updateJobBookIntakeRow, updateManagedJobBookMarker, voidJobBookIntakeRow } from '../src/alpha/job-book/jobBookApi.ts'

const row: JobBookRow = {
    ...createBlankJobBookRow(900010), id: 'intake-auckland-entry-1', entrySource: 'dataverse-intake',
    intakeRecordId: 'entry-1', etag: 'W/"1"', description: 'Original work', equipmentReviewRequired: true,
}
const record = {
    gr_jobbookentryid: row.intakeRecordId, gr_stage: 122830000, gr_jobnumber: row.jobNumber,
    gr_description: row.description, createdon: '2026-10-03T00:00:00Z', '@odata.etag': row.etag,
    gr_entered: false, gr_timecloudentered: false, gr_equipmentreviewrequired: true,
    gr_customersnapshot: 'Recorded customer', gr_fleetsnapshot: 'Recorded equipment',
}

test('only saved unpromoted Intake entries are editable and eligible for voiding', () => {
    assert.equal(isEditableJobBookIntake(row), true)
    assert.equal(jobBookVoidBlockedReason(row), '')
    for (const patch of [
        { entryStage: JOB_BOOK_ENTRY_STAGES.VOID }, { entryStage: JOB_BOOK_ENTRY_STAGES.PROMOTED },
        { entryStage: JOB_BOOK_ENTRY_STAGES.LEGACY }, { linkedJobId: 'managed-job' }, { intakeRecordId: '' },
        { entrySource: 'dataverse-job' as const }, { entrySource: 'local-intake' as const },
    ]) {
        assert.equal(isEditableJobBookIntake({ ...row, ...patch }), false)
        assert.ok(jobBookVoidBlockedReason({ ...row, ...patch }))
    }
})

test('either entry marker blocks voiding and missing marker data fails closed', () => {
    for (const entered of [false, true]) for (const timecloudEntered of [false, true]) {
        assert.equal(Boolean(jobBookVoidBlockedReason({ ...row, entered, timecloudEntered })), entered || timecloudEntered)
    }
    for (const field of ['entered', 'timecloudEntered']) {
        assert.match(jobBookVoidBlockedReason({ ...row, [field]: undefined }), /Reload/)
    }
})

test('Void is terminal for edits, promotion, and markers regardless of managed permissions', () => {
    const voided = { ...row, entryStage: JOB_BOOK_ENTRY_STAGES.VOID, entered: true, timecloudEntered: true }
    assert.equal(isEditableJobBookIntake(voided), false)
    assert.equal(getPromotionReadiness(voided).ready, false)
    assert.equal(canUpdateJobBookMarkers(voided, true), false)
    assert.equal(canUpdateJobBookMarkers(voided, false), false)
    assert.equal(canUpdateJobBookMarkers(row, false), true)
    assert.equal(canUpdateJobBookMarkers({ ...row, linkedJobId: 'job-1' }, false), false)
    assert.equal(canUpdateJobBookMarkers({ ...row, linkedJobId: 'job-1' }, true), true)
})

test('reason is mandatory, trimmed, and bounded by the provisioned 1000-character field', () => {
    for (const reason of ['', '  \n  ']) assert.ok(jobBookVoidReasonError(reason))
    assert.equal(jobBookVoidReasonError('Duplicate of Job 900001'), '')
    assert.equal(jobBookVoidReasonError(' x '), '')
    assert.equal(jobBookVoidReasonError('x'.repeat(1000)), '')
    assert.ok(jobBookVoidReasonError('x'.repeat(1001)))
})

for (const book of Object.values(JOB_BOOKS)) test(`${book.label}: void is a conditional status/reason-only PATCH, retaining number and evidence`, async (t) => {
    const regional = { ...row, jobBookKey: book.key, jobNumber: `${book.prefix}900010` }
    let stored = { ...record, [book.idField]: row.intakeRecordId, gr_jobnumber: regional.jobNumber }
    const calls: string[] = []
    const original = structuredClone(stored)
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
        assert.ok(String(url).includes(`${book.tableSetName}(${row.intakeRecordId})?`))
        assert.ok(String(url).includes('gr_voidreason'))
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer sample-token')
        calls.push(init?.method ?? 'GET')
        if (!init?.method) { assert.equal(init?.cache, 'no-store'); return Response.json(stored) }
        assert.equal(init.method, 'PATCH')
        assert.equal((init.headers as Record<string, string>)['If-Match'], row.etag)
        const body = JSON.parse(String(init.body))
        assert.deepEqual(body, { gr_stage: 122830003, gr_voidreason: 'Duplicate of Job 900001' })
        stored = { ...stored, ...body, '@odata.etag': 'W/"2"' }
        return Response.json(stored)
    })
    const saved = await voidJobBookIntakeRow('sample-token', regional, '  Duplicate of Job 900001  ')
    assert.deepEqual(calls, ['GET', 'PATCH'])
    assert.equal(saved.entryStage, 'void')
    assert.equal(saved.voidReason, 'Duplicate of Job 900001')
    assert.equal(saved.jobNumber, regional.jobNumber)
    assert.equal(saved.entered, false)
    assert.equal(saved.timecloudEntered, false)
    assert.equal(saved.description, original.gr_description)
    assert.equal(saved.customer, original.gr_customersnapshot)
    assert.equal(saved.fleet, original.gr_fleetsnapshot)
    assert.equal(saved.etag, 'W/"2"')
    assert.equal(regional.entryStage, 'intake', 'input is never mutated')
    assert.deepEqual(await fetchJobBookIntakeRow('sample-token', saved), saved, 'reload preserves Void')
})

test('invalid reason, markers, stage, links and missing/wildcard ETags never make a request', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => assert.fail('no backend request expected'))
    for (const reason of ['', ' ', 'x'.repeat(1001)]) await assert.rejects(voidJobBookIntakeRow('sample-token', row, reason))
    for (const patch of [
        { entered: true }, { timecloudEntered: true }, { linkedJobId: 'job-1' }, { etag: '' }, { etag: '*' },
        { entryStage: JOB_BOOK_ENTRY_STAGES.LEGACY }, { entryStage: JOB_BOOK_ENTRY_STAGES.PROMOTED },
        { entryStage: JOB_BOOK_ENTRY_STAGES.VOID },
    ]) await assert.rejects(voidJobBookIntakeRow('sample-token', { ...row, ...patch }, 'Mistake'))
})

for (const patch of [
    { gr_entered: true }, { gr_timecloudentered: true }, { gr_stage: 122830003 },
    { gr_stage: 122830001 }, { gr_PromotedJob: { gr_jobid: 'managed-job' } },
]) test(`authoritative preflight rejects changed eligibility ${JSON.stringify(patch)}`, async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        assert.equal(init?.method, undefined, 'no PATCH may be sent')
        return Response.json({ ...record, ...patch })
    })
    await assert.rejects(voidJobBookIntakeRow('sample-token', row, 'Mistake'))
})

test('a changed ETag requires explicit refresh even if the new entry is still eligible', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        assert.equal(init?.method, undefined)
        return Response.json({ ...record, '@odata.etag': 'W/"2"' })
    })
    await assert.rejects(voidJobBookIntakeRow('sample-token', row, 'Mistake'), JobBookConflictError)
})

test('a competing marker/edit/void after preflight causes conflict without automatic retry', async (t) => {
    let writes = 0
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        if (!init?.method) return Response.json(record)
        writes++
        return new Response('', { status: 412 })
    })
    await assert.rejects(voidJobBookIntakeRow('sample-token', row, 'Mistake'), JobBookConflictError)
    assert.equal(writes, 1)
})

test('failed authoritative read, missing record, or unknown stage fail closed', async (t) => {
    for (const response of [new Response('', { status: 403 }), Response.json({}), Response.json({ ...record, gr_stage: 999 })]) {
        const mock = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
            assert.equal(init?.method, undefined)
            return response
        })
        await assert.rejects(voidJobBookIntakeRow('sample-token', row, 'Mistake'), /could not be/)
        mock.mock.restore()
    }
})

test('unsuccessful PATCH preserves the caller entry and surfaces a safe error', async (t) => {
    const before = structuredClone(row)
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => !init?.method ? Response.json(record) : new Response('private upstream details', { status: 403 }))
    await assert.rejects(voidJobBookIntakeRow('sample-token', row, 'Mistake'), /^Error: The Intake changes were not saved\.$/)
    assert.deepEqual(row, before)
})

test('Void entries cannot be edited or marked through any normal save path', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => assert.fail('no request expected'))
    const voided = { ...row, entryStage: JOB_BOOK_ENTRY_STAGES.VOID }
    await assert.rejects(updateJobBookIntakeRow('sample-token', voided), /read-only/)
    for (const field of ['entered', 'timecloudEntered'] as const) {
        await assert.rejects(updateJobBookIntakeMarker('sample-token', voided, field, true), /read-only/)
        await assert.rejects(updateManagedJobBookMarker('sample-token', voided, field, true), /read-only/)
    }
})

test('managed marker save recovers a missing table ETag before applying the protected update', async (t) => {
    const managed = {
        ...row,
        entrySource: 'dataverse-job' as const,
        entryStage: JOB_BOOK_ENTRY_STAGES.PROMOTED,
        linkedJobId: 'managed-job-1',
        intakeRecordId: '',
        etag: '',
    }
    const calls: string[] = []
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        calls.push(init?.method ?? 'GET')
        if (!init?.method) {
            assert.equal(init?.cache, 'no-store')
            return Response.json({ gr_jobid: managed.linkedJobId, gr_gtentered: false, gr_timecloudentered: false }, { headers: { ETag: 'W/"7"' } })
        }
        assert.equal(init.method, 'PATCH')
        assert.equal((init.headers as Record<string, string>)['If-Match'], 'W/"7"')
        assert.deepEqual(JSON.parse(String(init.body)), { gr_gtentered: true })
        return Response.json({ gr_jobid: managed.linkedJobId, gr_gtentered: true, gr_timecloudentered: false }, { headers: { ETag: 'W/"8"' } })
    })

    const saved = await updateManagedJobBookMarker('sample-token', managed, 'entered', true)
    assert.deepEqual(calls, ['GET', 'PATCH'])
    assert.deepEqual(saved, { entered: true, timecloudEntered: false, etag: 'W/"8"' })
})

test('managed marker recovery fails closed when the latest Job version cannot be verified', async (t) => {
    const managed = { ...row, entrySource: 'dataverse-job' as const, linkedJobId: 'managed-job-1', etag: '' }
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ gr_jobid: 'different-job' }, { headers: { ETag: 'W/"7"' } }))
    await assert.rejects(updateManagedJobBookMarker('sample-token', managed, 'entered', true), /could not be verified/)
    assert.equal(mock.mock.callCount(), 1, 'no PATCH is attempted with unverified version data')
})

test('stale edit and marker saves cannot resurrect or mutate a newly voided entry', async (t) => {
    for (const etag of [row.etag, 'W/"2"']) {
        const mock = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
            assert.equal(init?.method, undefined, 'no PATCH after Void')
            return Response.json({ ...record, gr_stage: 122830003, '@odata.etag': etag })
        })
        await assert.rejects(updateJobBookIntakeRow('sample-token', row))
        await assert.rejects(updateJobBookIntakeMarker('sample-token', row, 'entered', true))
        mock.mock.restore()
    }
})

test('ordinary edits never write stage, number or void reason', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        if (!init?.method) return Response.json(record)
        const body = JSON.parse(String(init.body))
        for (const key of ['gr_stage', 'gr_jobnumber', 'gr_voidreason']) assert.equal(key in body, false)
        return Response.json({ ...record, ...body })
    })
    assert.equal((await updateJobBookIntakeRow('sample-token', row)).entryStage, 'intake')
})

test('historical/promoted Intake marker saves only write the chosen marker, never reset stage', async (t) => {
    for (const gr_stage of [122830001, 122830002]) {
        const mock = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
            if (!init?.method) return Response.json({ ...record, gr_stage })
            assert.deepEqual(JSON.parse(String(init.body)), { gr_timecloudentered: true })
            return Response.json({ ...record, gr_stage, gr_timecloudentered: true })
        })
        const saved = await updateJobBookIntakeMarker('sample-token', row, 'timecloudEntered', true)
        assert.equal(saved.entryStage, gr_stage === 122830001 ? 'promoted' : 'legacy')
        mock.mock.restore()
    }
})

test('historical Void rows remain visible with their original markers even without a reason', async (t) => {
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
        assert.ok(String(url).includes('gr_voidreason'))
        return Response.json({ value: [{ ...record, gr_stage: 122830003, gr_entered: true, gr_timecloudentered: true }] })
    })
    const saved = (await fetchJobBookIntakeRows('sample-token')).records[0]
    assert.equal(saved.entryStage, 'void')
    assert.equal(saved.voidReason, '')
    assert.equal(saved.entered, true)
    assert.equal(saved.timecloudEntered, true)
})

test('unified intake reads use the deployed registered Job navigation property', () => {
    const source = readFileSync(new URL('../src/alpha/job-book/jobBookApi.ts', import.meta.url), 'utf8')
    assert.match(source, /gr_registeredjob\(\$select=/)
    assert.doesNotMatch(source, /gr_RegisteredJob/)
})

test('screen and dialog reuse the workflow rules, retain Void evidence, and offer explicit conflict recovery', () => {
    const read = (path: string) => readFileSync(new URL(`../src/alpha/job-book/${path}`, import.meta.url), 'utf8')
    const screen = read('JobBookPrototypeScreen.tsx')
    const dialog = read('JobBookVoidDialog.tsx')
    const hook = read('useJobBookVoid.ts')
    assert.match(screen, /canUpdateJobBookMarkers\(row, allowManagedJobMarkerUpdates\)/)
    assert.match(screen, /disabled=\{Boolean\(voidBlocked\) \|\| markerBusy \|\| loading\}/)
    assert.match(screen, /disabled=\{!canUpdateEntryMarkers \|\| isVoid \|\| markerBusy\}/)
    assert.match(screen, /job-book-void-badge">VOID/)
    assert.match(screen, /row\.voidReason \|\| 'No reason recorded/)
    assert.match(screen, /allowManagedJobNavigation && row\.linkedJobId/)
    assert.match(dialog, /<EditDrawerFormDialog/)
    assert.match(dialog, /submitDisabled=\{needsReload \|\| Boolean\(blocked \|\| jobBookVoidReasonError\(reason\)\)\}/)
    assert.match(dialog, /Reload latest entry/)
    assert.match(hook, /if \(!row \|\| busyRef\.current \|\| needsReload\) return/)
    assert.match(hook, /setNeedsReload\(cause instanceof JobBookConflictError\)/)
    assert.match(hook, /fetchJobBookIntakeRow\(await getAccessToken\(\), row\)/)
})
