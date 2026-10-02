import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

let server
let JobCardFields
let HistoryPanel
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch

test.before(async () => {
    // Compile/render synthetic fixtures only: never listen, sign in or call a backend.
    globalThis.fetch = async () => { throw new Error('UI fixture must not make network requests.') }
    server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' })
    globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost' } }
    JobCardFields = (await server.ssrLoadModule('/src/alpha/jobs/components/JobCardFields.tsx')).default
    HistoryPanel = (await server.ssrLoadModule('/src/alpha/job-card-reviews/JobCardHistoryPanel.tsx')).default
})
test.after(async () => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    await server?.close()
})

const noAction = async () => { throw new Error('Read-only render must not mutate data.') }
const fixture = (overrides = {}) => ({
    gr_jobid: '00000000-0000-4000-8000-000000000001', gr_jobnumber: 'TEST ONLY',
    gr_jobtype: 122830000, gr_status: 122830003, gr_jobcardstatus: 122830003,
    gr_Mechanic: { gr_mechanicid: 'tech-1', gr_name: 'Fixture technician', gr_email: 'fixture@example.test' },
    gr_techniciansubmissionsubmittedon: '2026-01-01T00:00:00Z',
    gr_techniciansubmissionstory: 'Historical test evidence',
    ...overrides,
})
const renderFields = (job) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(JobCardFields, {
    job, mechanics: [], assignments: [], onStatusChange: noAction, onCreateAssignment: noAction,
    onSendPrimary: noAction, onSendAssignment: noAction, onDeleteAssignment: noAction,
})))

test('ordinary Job renders Azure history and preserves closed legacy evidence without old controls', () => {
    const markup = renderFields(fixture())
    assert.match(markup, /Azure links &amp; submissions/)
    assert.match(markup, /Historical submissions · old system/)
    assert.doesNotMatch(markup, /Historical test evidence|Previous submission|Download PDF/)
    assert.match(markup, /Loading Job Card history/)
    assert.doesNotMatch(markup, /Office status|Job Card progress|Ready for office|of 1 submitted/)
    assert.match(markup, /disabled="">Send<\/button>/)
})

test('Site Check retains its existing office status and progress controls', () => {
    const markup = renderFields(fixture({ gr_jobtype: 122830004, _gr_sitecheck_value: 'occurrence-1' }))
    assert.match(markup, /Office status|Job Card progress/)
    assert.doesNotMatch(markup, /Azure links &amp; submissions/)
})

test('Azure history distinguishes created links from delivered email and exposes saved-review navigation', () => {
    const base = { reviewId: 'review-1', technicianName: 'Fixture technician', createdOn: '2026-10-02T00:00:00Z', expiresOn: '2026-10-09T00:00:00Z', photoCount: 0 }
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(HistoryPanel, {
        busy: false, refresh: noAction, data: { truncated: false, items: [
            { ...base, status: 'active' }, { ...base, reviewId: 'review-2', status: 'reviewed', submittedOn: '2026-10-02T00:01:00Z' },
        ] },
    })))
    assert.match(markup, /does not confirm email delivery/)
    assert.match(markup, /Link created/)
    assert.match(markup, /href="\/job-card-reviews\/review-2"/)
    assert.doesNotMatch(markup, /href="\/job-card-reviews\/review-1"/)
})

test('history errors are never shown as an empty submission history', () => {
    const markup = renderToStaticMarkup(createElement(HistoryPanel, { busy: false, refresh: noAction, error: 'Access unavailable.' }))
    assert.match(markup, /role="alert"/)
    assert.match(markup, /does not mean no cards exist/)
    assert.doesNotMatch(markup, /No Azure Job Cards/)
})
