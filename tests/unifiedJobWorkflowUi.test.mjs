import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, Registration, Create, Table, Provider, EquipmentDrawer, detailsPatch
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
    EquipmentDrawer = (await server.ssrLoadModule('/src/alpha/equipment/components/EquipmentDrawer.tsx')).default
    detailsPatch = (await server.ssrLoadModule('/src/alpha/equipment/services/equipmentDetailsApi.ts')).equipmentDetailsPatch
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

function renderWorklist(rows, tab) {
    return renderToStaticMarkup(createElement(Table, {
        unifiedWorklist: true, jobs: rows, visibleStatuses: [122830001],
        viewState: { searchText: '', selectedJobType: tab, officeAttentionFilter: 'all', scheduledJobsVisibility: 'all', sort: { field: 'created', direction: 'desc' } },
        onAllocateNumber: unavailable, onManageJob: unavailable, onViewStateChange: unavailable, onToggleStatus: unavailable, onResetToDefault: unavailable,
        onStatusChange: unavailable, onJobFieldsChange: unavailable, onJobNumberAllocation: unavailable, onEmailTechnician: unavailable, emailDeliveryStates: {},
        onEditJob: unavailable, onOpenJobCard: unavailable, onOpenEquipment: unavailable, mechanics: [], officeUpdates: [], scheduleOptions: [], stickyThroughColumnId: null,
    }))
}

test('single coordination tab row separates membership from type and unconfirmed status', () => {
    const rows = [
        { ...job, gr_jobid: id(10), gr_description: 'Managed site check', gr_coordinatormanaged: true, gr_jobtype: 122830004 },
        { ...job, gr_jobid: id(11), gr_description: 'Unnumbered staging' },
        { ...job, gr_jobid: id(12), gr_description: 'Registered book work', gr_jobnumber: '910001' },
        { ...job, gr_jobid: id(13), gr_description: 'Unconfirmed work', gr_status: 122830005 },
        { ...job, gr_jobid: id(14), gr_description: 'Historical ledger entry', legacyBookEntry: { void: false } },
    ]
    const operational = renderWorklist(rows, 'operational')
    assert.match(operational, /Managed site check/)
    assert.doesNotMatch(operational, /jobs-table-muted">Managed</)
    for (const text of ['Unnumbered staging', 'Registered book work', 'Historical ledger entry']) assert.ok(!operational.includes(text))
    assert.equal((operational.match(/role="tablist"/g) ?? []).length, 1)
    assert.match(operational, />Unconfirmed</)
    assert.match(operational, />All jobs</)
    assert.doesNotMatch(operational, />All types</)
    const all = renderWorklist(rows, 'all')
    for (const row of rows) assert.ok(all.includes(row.gr_description))
    const unconfirmed = renderWorklist(rows, 'unconfirmed')
    assert.match(unconfirmed, /Unconfirmed work/)
    assert.doesNotMatch(unconfirmed, /Unnumbered staging|Historical ledger entry/)
    const legacy = renderWorklist([rows[4]], 'all')
    assert.match(legacy, /read-only/)
    assert.doesNotMatch(legacy, /Allocate job number|Manage job|>Edit</)
})

test('restricted Equipment editor includes road compliance but excludes maintenance, ownership and deletion', () => {
    const html = renderToStaticMarkup(createElement(Provider, { scope: 'restricted-equipment-test' }, createElement(EquipmentDrawer, {
        mode: 'edit', detailsOnly: true, equipment: { gr_equipmentid: id(91), gr_fleet: 'F1', gr_make: 'Make', gr_model: 'Model', gr_serial: 'Serial', statecode: 0 },
        customers: [], sites: [], equipmentList: [], jobs: [], isSaving: false, saveError: '',
        onClose: unavailable, onSave: unavailable, onDelete: unavailable, onSaveMaintenanceHistory: unavailable,
    })))
    assert.match(html, /Serial number/)
    assert.match(html, /WOF \/ REGO/)
    assert.doesNotMatch(html, /Delete equipment|Equipment Ownership|Site Check Availability|>Maintenance<|>Job History</)
})
test('Equipment correction payload includes road compliance, excludes unrelated fields and rejects unsaved Sites', () => {
    const input = { fleet: ' F1 ', alternateFleetNumbers: '', make: ' Make ', model: 'Model', serial: 'Serial', siteId: id(92), registrationNumber: 'ABC123', complianceStatus: 122830000, wofRequired: true, currentWofExpiry: '2030-01-01', regoExpiry: '2029-12-01', maintenanceProfile: 9, ownershipType: 3 }
    const patch = detailsPatch(input)
    assert.deepEqual(Object.keys(patch).sort(), ['gr_fleet','gr_alternatefleetnumbers','gr_make','gr_model','gr_serial','gr_registrationnumber','gr_compliancestatus','gr_wofrequired','gr_currentwofexpiry','gr_regoexpiry','gr_Site@odata.bind'].sort())
    assert.equal(patch.gr_fleet, 'F1')
    assert.equal(patch.gr_registrationnumber, 'ABC123')
    assert.equal(patch.gr_wofrequired, true)
    assert.throws(() => detailsPatch({ ...input, siteId: 'prototype-site' }), /saved Site/)
})
