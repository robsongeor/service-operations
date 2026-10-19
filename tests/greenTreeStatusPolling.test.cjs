const assert = require('node:assert/strict')
const test = require('node:test')
const { pollGreenTreeJobStatuses, _test } = require('../api/services/greenTreeStatusPolling')

test('status cadence follows Not entered, Open, 7am NZ Closed and terminal Finalised rules', () => {
    const now = Date.parse('2026-10-19T18:00:00Z') // 07:00 NZDT on 20 October
    assert.equal(_test.statusRefreshDue('', '2026-10-19T17:44:59Z', now), true)
    assert.equal(_test.statusRefreshDue('', '2026-10-19T17:45:01Z', now), false)
    assert.equal(_test.statusRefreshDue('open', '2026-10-19T14:59:59Z', now), true)
    assert.equal(_test.statusRefreshDue('open', '2026-10-19T15:00:01Z', now), false)
    assert.equal(_test.statusRefreshDue('closed', '2026-10-18T18:30:00Z', now), true)
    assert.equal(_test.statusRefreshDue('closed', '2026-10-19T17:30:00Z', now), true)
    assert.equal(_test.statusRefreshDue('closed', '2026-10-19T18:00:00Z', now), false)
    assert.equal(_test.statusRefreshDue('finalised', '', now), false)
})

test('closed daily check waits until 7am in both NZ daylight and standard time', () => {
    assert.equal(_test.statusRefreshDue('closed', '2026-01-18T18:00:00Z', Date.parse('2026-01-19T17:59:59Z')), false)
    assert.equal(_test.statusRefreshDue('closed', '2026-01-18T18:00:00Z', Date.parse('2026-01-19T18:00:00Z')), true)
    assert.equal(_test.statusRefreshDue('closed', '2026-06-18T19:00:00Z', Date.parse('2026-06-19T18:59:59Z')), false)
    assert.equal(_test.statusRefreshDue('closed', '2026-06-18T19:00:00Z', Date.parse('2026-06-19T19:00:00Z')), true)
})

test('status transitions progress forward and reject regressions', () => {
    assert.equal(_test.transitionAllowed('', 'finalised'), true)
    assert.equal(_test.transitionAllowed('open', 'closed'), true)
    assert.equal(_test.transitionAllowed('open', 'finalised'), true)
    assert.equal(_test.transitionAllowed('closed', 'finalised'), true)
    assert.equal(_test.transitionAllowed('closed', 'open'), false)
    assert.equal(_test.transitionAllowed('finalised', 'closed'), false)
})

test('backfill deduplicates Job Numbers, updates every representation and leaves missing Jobs Not entered', async () => {
    const patches = []
    const reads = []
    const tableRows = {
        gr_jobs: [
            { '@odata.etag': 'W/"1"', gr_jobid: 'job-1', gr_jobnumber: '150001', gr_gtentered: false, gr_greentreestatus: null, gr_greentreestatuscheckedon: null },
            { '@odata.etag': 'W/"2"', gr_jobid: 'job-2', gr_jobnumber: '150002', gr_gtentered: false, gr_greentreestatus: null, gr_greentreestatuscheckedon: null },
        ],
        gr_jobbookentries: [
            { '@odata.etag': 'W/"3"', gr_jobbookentryid: 'ledger-1', gr_jobnumber: '150001', gr_entered: false, gr_greentreestatus: null, gr_greentreestatuscheckedon: null },
        ],
    }
    const result = await pollGreenTreeJobStatuses({
        mode: 'backfill', now: Date.parse('2026-10-19T00:00:00Z'),
        dataverseOrigin: 'https://example.crm.dynamics.com', authorization: 'Bearer token',
        fetchJob: async (code) => { reads.push(code); return code === '150001' ? { code, isClosed: true, isFinalised: true } : null },
        fetchImpl: async (url, options = {}) => {
            if (!options.method) {
                const table = /\/api\/data\/v9\.2\/([^?]+)/.exec(String(url))?.[1]
                return Response.json({ value: tableRows[table] || [] })
            }
            patches.push({ url: String(url), body: JSON.parse(options.body) })
            return new Response(null, { status: 204 })
        },
    })
    assert.deepEqual(reads.sort(), ['150001', '150002'])
    assert.equal(result.checked, 2)
    assert.equal(result.finalised, 1)
    assert.equal(result.notEntered, 1)
    assert.equal(result.updatedRecords, 3)
    assert.equal(patches.filter((patch) => patch.body.gr_greentreestatus === 'finalised').length, 2)
    assert.equal(patches.filter((patch) => Object.keys(patch.body).length === 1).length, 1)
    assert.equal(patches.some((patch) => Object.hasOwn(patch.body, 'gr_status')), false)
})

test('scheduled polling excludes fresh and finalised records and quarantines a regression', async () => {
    const now = Date.parse('2026-10-19T18:00:00Z')
    let patches = 0
    const result = await pollGreenTreeJobStatuses({
        mode: 'scheduled', now, dataverseOrigin: 'https://example.crm.dynamics.com', authorization: 'Bearer token',
        fetchJob: async () => ({ code: '150003', isClosed: false, isFinalised: false }),
        fetchImpl: async (url, options = {}) => {
            if (options.method) { patches += 1; return new Response(null, { status: 204 }) }
            const table = /\/api\/data\/v9\.2\/([^?]+)/.exec(String(url))?.[1]
            return Response.json({ value: table === 'gr_jobs' ? [
                { '@odata.etag': 'W/"1"', gr_jobid: 'job-1', gr_jobnumber: '150003', gr_gtentered: true, gr_greentreestatus: 'closed', gr_greentreestatuscheckedon: '2026-10-18T18:00:00Z' },
                { '@odata.etag': 'W/"2"', gr_jobid: 'job-2', gr_jobnumber: '150004', gr_gtentered: true, gr_greentreestatus: 'finalised', gr_greentreestatuscheckedon: null },
                { '@odata.etag': 'W/"3"', gr_jobid: 'job-3', gr_jobnumber: '150005', gr_gtentered: true, gr_greentreestatus: 'open', gr_greentreestatuscheckedon: '2026-10-19T17:00:00Z' },
            ] : [] })
        },
    })
    assert.equal(result.selected, 1)
    assert.deepEqual(result.conflicts, ['150003'])
    assert.equal(patches, 0)
})
