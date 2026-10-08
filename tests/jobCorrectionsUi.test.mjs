import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

let server, Drawer, Provider
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
test.before(async () => {
    globalThis.fetch = async () => { throw new Error('Rendering cannot mutate or fetch data.') }
    globalThis.window = { location: { hostname: '127.0.0.1' } }
    server = await createServer({ configFile: false, envDir: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
    Drawer = (await server.ssrLoadModule('/src/alpha/jobs/components/JobEditDrawer.tsx')).default
    Provider = (await server.ssrLoadModule('/src/alpha/shared/data/OperationalDataClientProvider.tsx')).OperationalDataClientProvider
})
test.after(async () => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; await server?.close() })

const unavailable = () => { throw new Error('No mutation allowed during render.') }
const site = { gr_siteid: 'site', gr_name: 'Historical Site', gr_address: 'Saved Site address', gr_Customer: { gr_customerid: 'customer', gr_name: 'Saved Customer' } }
const equipment = { gr_equipmentid: '11111111-1111-4111-8111-111111111111', gr_fleet: 'SAVED-EQUIPMENT', gr_make: 'Make', gr_model: 'Model', gr_serial: 'SERIAL', gr_Site: site }
const job = { gr_jobid: 'job', gr_jobnumber: 'WJ1234567', gr_jobtype: 122830000, gr_status: 122830003, gr_description: 'Saved description', gr_ordernumber: 'PO-1', gr_Equipment: equipment, gr_Site: site, gr_Mechanic: { gr_mechanicid: 'mechanic', gr_name: 'Saved Technician' } }
const render = (props = {}) => renderToStaticMarkup(createElement(Provider, { scope: 'sample-corrections' }, createElement(Drawer, {
    job, correctionsOnly: true, jobBookLabel: 'Auckland', canCorrectMechanic: true, mechanics: [job.gr_Mechanic], equipmentList: [equipment], customers: [site.gr_Customer], sites: [site], siteContacts: [], scheduleOptions: [], servicePlans: [],
    onSave: unavailable, onDelete: unavailable, onClose: unavailable, onCreateCustomer: unavailable, onCreateSite: unavailable, onCreateContact: unavailable, onCreateEquipment: unavailable,
    onCreateScheduleOption: unavailable, onUpdateScheduleOption: unavailable, onDeleteScheduleOption: unavailable, onCreateQuote: unavailable, onOpenQuote: unavailable,
    onJobCardStatusChange: unavailable, onCreateAssignment: unavailable, onSendPrimary: unavailable, onSendAssignment: unavailable, onDeleteAssignment: unavailable, ...props,
})))

test('corrections drawer matches the new Job Book entry layout and functions', () => {
    const html = render()
    assert.match(html, /Edit Auckland Job Book entry/)
    assert.match(html, /Job number<\/span><strong>WJ1234567/)
    assert.match(html, /Equipment and location/)
    assert.match(html, /Job details/)
    assert.doesNotMatch(html, /Job type|Status<\/span>/)
    assert.match(html, /<textarea[^>]*>Saved description<\/textarea>/)
    assert.match(html, /value="PO-1"/)
    assert.match(html, /SAVED-EQUIPMENT/)
    assert.match(html, /Saved Site address/)
    assert.match(html, /aria-label="Edit location"/)
    assert.match(html, /aria-label="Equipment location"/)
    assert.doesNotMatch(html, /<span>Customer<\/span><input|<span>Site<\/span><select/)
    assert.match(html, /Saved Technician/)

    const drawer = readFileSync(new URL('../src/alpha/jobs/components/JobEditDrawer.tsx', import.meta.url), 'utf8')
    assert.match(drawer, /correctionsOnly allowCorrectionMasterCreation=\{allowCorrectionMasterCreation\} manageEquipmentLocation useLocationSummary deferLocationUntilEquipmentChoice/)
    assert.match(drawer, /onLocationPendingChange=\{setLocationPending\} onLocationSavingChange=\{setLocationSaving\}/)
})

test('corrections drawer has no scheduling, dispatch, deletion, master creation or evidence editing actions', () => {
    const html = render({ initialTab: 'scheduling' })
    assert.doesNotMatch(html, /role="tab"|Delete job|Email job|Add new equipment|Add new customer|Add site|Add contact|Create quote|Copy for Job Book/)
    assert.match(html, /Edit Auckland Job Book entry/)
})

test('unconfigured Job Book entries restore the unknown Equipment and saved location', () => {
    const html = render({ allowCorrectionMasterCreation: true, job: { ...job, gr_Equipment: undefined }, equipmentList: [] })
    assert.match(html, /Equipment not known yet/)
    assert.match(html, /Match or add the Equipment later/)
    assert.match(html, /Saved Customer/)
    assert.match(html, /Historical Site/)
    assert.match(html, /Saved Site address/)
    assert.match(html, /aria-label="Edit location"/)
    assert.doesNotMatch(html, /Search primary or alternate fleet/)
    const relationships = readFileSync(new URL('../src/alpha/jobs/components/JobRelationshipFields.tsx', import.meta.url), 'utf8')
    assert.match(relationships, /correctionsOnly && !allowCorrectionMasterCreation \? undefined : onCreateEquipment/)
    assert.match(relationships, /correctionsOnly && !allowCorrectionMasterCreation \? undefined : createCustomerAndSite/)
})

test('service type is omitted with the coordinator-only controls', () => {
    const html = render({ job: { ...job, gr_jobtype: 122830001, gr_servicetype: 122830001 } })
    assert.doesNotMatch(html, /Service type/)
    assert.doesNotMatch(html, /job-maintenance-summary/)
})

test('conflicted save is blocked and offers explicit reload, not automatic overwrite', () => {
    const html = render({ saveBlockedReason: 'Someone else changed this Job.', onReloadCorrections: unavailable })
    assert.match(html, /Reload latest details/)
    assert.match(html, /class="primary" disabled="">Save changes/)
})

test('normal coordinator editor retains operational controls but protects allocated numbers and deletion', () => {
    const html = render({ correctionsOnly: false })
    assert.match(html, />Scheduling/)
    assert.ok(html.indexOf('Equipment and location') < html.indexOf('Job details'))
    assert.ok(html.indexOf('Job details') < html.indexOf('Job type'))
    assert.match(html, /Customer &amp; site/)
    assert.match(html, /aria-label="Edit location"/)
    assert.match(html, /Saved Customer/)
    assert.match(html, /Historical Site/)
    assert.match(html, /Saved Site address/)
    assert.doesNotMatch(html, /id="job-editor-customer"/)
    assert.doesNotMatch(html, /Delete job/)
    assert.doesNotMatch(html, /<span>Job number<\/span>|value="WJ1234567"/)
    assert.doesNotMatch(html, /Copy for Job Book/)
    assert.doesNotMatch(html, /Job type<\/span><select disabled/)
})

test('coordinator can still delete an unnumbered draft', () => {
    const html = render({ correctionsOnly: false, job: { ...job, gr_jobnumber: null } })
    assert.match(html, /Delete job/)
    assert.doesNotMatch(html, /<span>Job number<\/span>|No number allocated/)
})
