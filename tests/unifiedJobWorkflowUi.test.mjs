import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, Registration, Create, Table, Provider
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
const values = new Map()
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
const unavailable = () => { throw new Error('Rendering must not send a request.') }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const job = { gr_jobid: id(1), createdon: '2026-10-03T00:00:00Z', gr_description: 'Sample work', gr_status: 122830001, gr_coordinatormanaged: false, '@odata.etag': 'W/"11"' }
test.before(async () => {
    globalThis.window = { sessionStorage: storage, location: { hostname: '127.0.0.1' } }
    globalThis.fetch = unavailable
    server = await createServer({ configFile: false, envDir: false, define: { 'import.meta.env.VITE_UNIFIED_JOB_WALKTHROUGH': '"true"' }, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
    Registration = (await server.ssrLoadModule('/src/alpha/jobs/components/JobRegistrationDialog.tsx')).default
    Create = (await server.ssrLoadModule('/src/alpha/jobs/components/JobCreateDrawer.tsx')).default
    Table = (await server.ssrLoadModule('/src/alpha/jobs/components/JobsTable.tsx')).default
    Provider = (await server.ssrLoadModule('/src/alpha/shared/data/OperationalDataClientProvider.tsx')).OperationalDataClientProvider
})
test.after(async () => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; await server?.close() })
test.beforeEach(() => values.clear())
const renderRegistration = (props = {}) => renderToStaticMarkup(createElement(Registration, { job, mode: 'allocate', getAccessToken: unavailable, onSaved: unavailable, onClose: unavailable, ...props }))

test('allocation confirms permanence, all four regions and independent coordinator membership', () => {
    const html = renderRegistration()
    for (const label of ['Auckland', 'Waikato', 'Hastings', 'Christchurch']) assert.match(html, new RegExp(`>${label}</option>`))
    assert.match(html, /permanent regional number/)
    assert.match(html, /does not send an email, enter GreenTree or add the Job to Operational/)
    assert.doesNotMatch(html, /Retry same request/)
})
test('retained allocation can be retried after refresh even when its number is now visible', () => {
    storage.setItem('job-registration-attempt.v1.undefined.allocation', JSON.stringify({ kind: 'allocate', requestId: id(2), jobId: id(1), etag: 'W/"11"', book: 'waikato' }))
    const html = renderRegistration({ job: { ...job, gr_jobnumber: 'WJ910001' } })
    assert.match(html, /<select disabled/)
    assert.match(html, /value="waikato" selected/)
    assert.match(html, /across closing or reloading this tab/)
    assert.match(html, /class="primary">Retry same request/)
    const other = renderRegistration({ job: { ...job, gr_jobid: id(3) } })
    assert.match(other, /class="primary" disabled="">Retry same request/)
})
test('numbered and Void Jobs cannot start another allocation; Manage does not create another record', () => {
    assert.match(renderRegistration({ job: { ...job, gr_jobnumber: '1' } }), /class="primary" disabled="">Allocate number/)
    assert.match(renderRegistration({ job: { ...job, gr_registrationvoid: true } }), /class="primary" disabled="">Allocate number/)
    const html = renderRegistration({ mode: 'manage' })
    assert.match(html, /No new Job or number is created/)
    assert.match(html, /Add to Operational/)
    assert.doesNotMatch(html, /<select/)
})
test('Staging reuses the create drawer but removes editable numbering and scheduling', () => {
    const html = renderToStaticMarkup(createElement(Provider, { scope: 'unified-qa' }, createElement(Create, {
        stagingOnly: true, mechanics: [], equipmentList: [], sites: [], customers: [], siteContacts: [], servicePlans: [],
        onCreateJob: unavailable, onCreateCustomer: unavailable, onCreateSite: unavailable, onCreateContact: unavailable, onCreateEquipment: unavailable, onCreateScheduleOption: unavailable, onClose: unavailable,
    })))
    assert.match(html, /Save to Staging. No number is allocated and no email is sent/)
    assert.match(html, /readOnly="" value=""/)
    assert.doesNotMatch(html, /Add schedule|Schedule date|Time window/)
})
test('unified Void rows have no allocation, management, spreadsheet-export or sending actions', () => {
    const html = renderToStaticMarkup(createElement(Table, {
        unifiedWorklist: true, jobs: [{ ...job, gr_jobnumber: '910001', gr_registrationvoid: true }], visibleStatuses: [122830001],
        viewState: { searchText: '', selectedJobType: 'all', officeAttentionFilter: 'all', scheduledJobsVisibility: 'all', sort: { field: 'created', direction: 'desc' } },
        onAllocateNumber: unavailable, onManageJob: unavailable, onViewStateChange: unavailable, onToggleStatus: unavailable, onResetToDefault: unavailable,
        onStatusChange: unavailable, onJobFieldsChange: unavailable, onJobNumberAllocation: unavailable, onEmailTechnician: unavailable, emailDeliveryStates: {},
        onEditJob: unavailable, onOpenJobCard: unavailable, onOpenEquipment: unavailable, mechanics: [], officeUpdates: [], scheduleOptions: [], stickyThroughColumnId: null,
    }))
    assert.match(html, />Void</)
    assert.doesNotMatch(html, /Allocate job number|Manage job|Paste Job numbers|Job book spreadsheet export|Click the row to copy/)
    assert.match(html, /disabled="">Edit/)
    assert.match(html, /Void entries cannot be sent/)
})
