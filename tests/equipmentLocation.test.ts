import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createEquipmentDestination, createEquipmentSite, isPersistedEquipmentId, moveEquipmentLocation } from '../src/alpha/equipment/services/equipmentLocationWorkflow.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types'
import type { Site } from '../src/alpha/jobs/types/site.types'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const site: Site = { gr_siteid: id(2), gr_name: 'Destination', gr_address: 'Test address', gr_Customer: { gr_customerid: id(3), gr_name: 'Customer' } }
const destination = { customerId: id(3), siteId: id(2) }
const source: Equipment = { gr_equipmentid: id(1), gr_fleet: 'TEST', gr_serial: null, gr_make: null, gr_model: null, gr_currenthourmeter: 123, '@odata.etag': 'W/"1"', gr_Site: { gr_siteid: id(4), gr_name: 'Original' } }
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const newDestination = { customerName: 'New Customer', siteName: 'New Site', address: 'Verified sample address' }
const destinationIO = () => ({
    findCustomers: async () => [] as { gr_customerid: string; gr_name: string }[],
    createCustomer: async () => id(21),
    rememberCustomer: () => undefined,
    readSites: async () => [] as Site[],
    createSite: async () => id(22),
})

test('new equipment destination reuses Customer and Site creation and does not move the Equipment', async () => {
    const writes: unknown[] = []
    const result = await createEquipmentDestination(newDestination, true, {
        ...destinationIO(),
        createCustomer: async (value) => { writes.push(value); return id(21) },
        createSite: async (value) => { writes.push(value); return id(22) },
    })
    assert.deepEqual(writes, [{ name: 'New Customer' }, { customerId: id(21), name: 'New Site', address: 'Verified sample address' }])
    assert.equal(result.customer.gr_customerid, id(21))
    assert.equal(result.site.gr_Customer?.gr_customerid, id(21))
})

test('destination creation checks permissions and required fields before any reads or writes', async () => {
    const io = { ...destinationIO(), findCustomers: async () => assert.fail('no reads allowed') }
    await assert.rejects(createEquipmentDestination(newDestination, false, io), /permission/)
    for (const field of ['customerName', 'siteName', 'address']) {
        await assert.rejects(createEquipmentDestination({ ...newDestination, [field]: ' ' }, true, io), /Enter/)
    }
})

test('destination retry reuses the saved Customer after a Site failure', async () => {
    let saved: { gr_customerid: string; gr_name: string } | undefined
    let customerWrites = 0
    const io = {
        ...destinationIO(), findCustomers: async () => saved ? [saved] : [],
        createCustomer: async () => { customerWrites++; return id(21) },
        rememberCustomer: (value: { gr_customerid: string; gr_name: string }) => { saved = value },
    }
    await assert.rejects(createEquipmentDestination(newDestination, true, { ...io, createSite: async () => { throw new Error('Permission denied') } }), /Customer is saved.*Equipment has not moved/)
    const result = await createEquipmentDestination(newDestination, true, io)
    assert.equal(result.site.gr_siteid, id(22))
    assert.equal(customerWrites, 1)
})

test('existing identical Customer/Site are reused; ambiguous or conflicting names do not create records', async () => {
    const customer = { gr_customerid: id(21), gr_name: 'New Customer' }
    const savedSite = { gr_siteid: id(22), gr_name: 'New Site', gr_address: newDestination.address, gr_Customer: customer }
    const io = {
        ...destinationIO(), findCustomers: async () => [customer], readSites: async () => [savedSite],
        createCustomer: async () => assert.fail('reuse Customer'), createSite: async () => assert.fail('reuse Site'),
    }
    assert.deepEqual(await createEquipmentDestination(newDestination, true, io), { customer, site: savedSite })
    await assert.rejects(createEquipmentDestination(newDestination, true, { ...io, findCustomers: async () => [customer, customer] }), /More than one/)
    await assert.rejects(createEquipmentDestination(newDestination, true, { ...io, readSites: async () => [{ ...savedSite, gr_address: 'Different address' }] }), /already exists/)
})

test('failed duplicate and Site reads fail closed without inventing a new destination', async () => {
    const fail = async () => { throw new Error('Read failed') }
    await assert.rejects(createEquipmentDestination(newDestination, true, { ...destinationIO(), findCustomers: fail, createCustomer: async () => assert.fail('no write') }), /Read failed/)
    await assert.rejects(createEquipmentDestination(newDestination, true, { ...destinationIO(), readSites: fail, createSite: async () => assert.fail('no write') }), /Customer is saved/)
})

test('both location editors use the canonical inline create form and guarded shared creation hook', () => {
    const shared = read('src/alpha/jobs/components/JobEquipmentLocation.tsx')
    assert.match(shared, /onCreateCustomerAndSite=\{location.canCreateDestination \? location.createDestination : undefined\}/)
    assert.match(shared, /location.pending \|\| anyCreateFormOpen/)
    assert.match(shared, /disabled=\{anyCreateFormOpen \|\|/)
    assert.match(shared, /location.creatingDestination/)
    const hook = read('src/alpha/jobs/hooks/useEquipmentLocation.ts')
    assert.match(hook, /canCreateEquipmentDestination/)
    assert.match(hook, /createEquipmentDestination\(input/)
    assert.match(hook, /createCustomer\(token, value\)/)
    assert.match(hook, /createSite\(token, value\)/)
    assert.match(hook, /rememberedCustomer.current/)
    const customerApi = read('src/alpha/jobs/services/customersApi.ts')
    assert.match(customerApi, /'\$top': '2'/)
    assert.match(customerApi, /replaceAll\("'", "''"\)/)
})

test('adding a Site uses the selected Customer ID and writes only the Site', async () => {
    const customer = { gr_customerid: id(31), gr_name: 'Existing Customer' }
    const calls: unknown[] = []
    const result = await createEquipmentSite(customer, { name: ' New Depot ', address: ' Verified address ' }, true, {
        readSites: async (customerId) => { calls.push(customerId); return [] },
        createSite: async (input) => { calls.push(input); return id(32) },
    })
    assert.deepEqual(calls, [id(31), { customerId: id(31), name: 'New Depot', address: 'Verified address' }])
    assert.equal(result.gr_Customer, customer)
    assert.equal(result.gr_siteid, id(32))
})

test('Site-only creation rejects denied, missing Customer and incomplete details before reads', async () => {
    const customer = { gr_customerid: id(31), gr_name: 'Existing Customer' }
    const io = { readSites: async () => assert.fail('no reads'), createSite: async () => assert.fail('no writes') }
    const input = { name: 'Depot', address: 'Address' }
    await assert.rejects(createEquipmentSite(customer, input, false, io), /permission/)
    await assert.rejects(createEquipmentSite({ ...customer, gr_customerid: '' }, input, true, io), /existing Customer/)
    await assert.rejects(createEquipmentSite(customer, { ...input, address: ' ' }, true, io), /verified address/)
    await assert.rejects(createEquipmentSite(customer, { ...input, name: ' ' }, true, io), /Site name/)
})

test('Site-only duplicate and failure handling preserves existing records and permits a safe retry', async () => {
    const customer = site.gr_Customer!
    const input = { name: site.gr_name, address: site.gr_address }
    const io = { readSites: async () => [site], createSite: async () => assert.fail('reuse existing Site') }
    assert.equal(await createEquipmentSite(customer, input, true, io), site)
    await assert.rejects(createEquipmentSite(customer, { ...input, address: 'Other address' }, true, io), /already exists/)
    await assert.rejects(createEquipmentSite(customer, input, true, { ...io, readSites: async () => { throw new Error('read failed') } }), /read failed/)
    await assert.rejects(createEquipmentSite(customer, input, true, { readSites: async () => [], createSite: async () => { throw new Error('write failed') } }), /write failed/)
    assert.equal(await createEquipmentSite(customer, input, true, io), site)
})

test('location and Job relationship editors reuse the extracted Site form, and the tile action is Edit', () => {
    const location = read('src/alpha/jobs/components/JobEquipmentLocation.tsx')
    const relationships = read('src/alpha/jobs/components/JobRelationshipFields.tsx')
    const panel = read('src/alpha/jobs/components/JobSiteCreatePanel.tsx')
    assert.match(location, /onEdit=\{location.canMove \? location.edit : undefined\}/)
    assert.match(read('src/alpha/jobs/components/JobLocationSummary.tsx'), /onClick=\{onEdit\}>Edit<\/button>/)
    assert.match(location, /onAddSite=\{location.canCreateDestination && !createFormOpen/)
    assert.match(location, /<JobSiteCreatePanel/)
    assert.match(relationships, /<JobSiteCreatePanel/)
    assert.doesNotMatch(relationships, /siteAddressSelection/)
    assert.match(panel, /<VerifiedAddressField/)
    assert.match(panel, /addressSelection.formattedAddress === site.address/)
    assert.match(panel, /disabled=\{saving \|\| !verified\}/)
    const hook = read('src/alpha/jobs/hooks/useEquipmentLocation.ts')
    assert.match(hook, /createEquipmentSite\(selectedCustomer, input/)
    assert.match(hook, /destinationInFlight.current \|\| saving \|\| loading/)
})

test('location save updates only the Site, using the original ETag; history and maintenance are untouched', async () => {
    const writes: unknown[][] = []
    const before = structuredClone(source)
    const moved = await moveEquipmentLocation(source, destination, true, { readSite: async () => site, writeSite: async (...args) => { writes.push(args) } })
    assert.deepEqual(writes, [[id(1), id(2), 'W/"1"']])
    assert.deepEqual(source, before)
    assert.equal(moved.gr_Site, site)
    assert.equal(moved.gr_currenthourmeter, 123)
    assert.equal(moved.gr_fleet, 'TEST')
    assert.equal(moved['@odata.etag'], undefined, 'another edit must refresh the ETag')
})

test('unlinked equipment can be assigned an existing Customer and Site', async () => {
    const moved = await moveEquipmentLocation({ ...source, gr_Site: undefined }, destination, true, { readSite: async () => site, writeSite: async () => undefined })
    assert.equal(moved.gr_Site?.gr_Customer?.gr_customerid, id(3))
})

test('denied capability never reads or writes', async () => {
    const fail = async () => { assert.fail('must not call Dataverse') }
    await assert.rejects(moveEquipmentLocation(source, destination, false, { readSite: fail, writeSite: fail }), /permission/)
})

test('unknown and snapshot IDs cannot become equipment or destination master-data writes', async () => {
    const fail = async () => { assert.fail('must not call Dataverse') }
    for (const badId of ['', 'prototype-site-123', 'not-a-guid', `${id(2)})/gr_jobs`]) {
        assert.equal(isPersistedEquipmentId(badId), false)
        await assert.rejects(moveEquipmentLocation(source, { ...destination, siteId: badId }, true, { readSite: fail, writeSite: fail }), /existing Customer/)
        await assert.rejects(moveEquipmentLocation({ ...source, gr_equipmentid: badId }, destination, true, { readSite: fail, writeSite: fail }), /existing Customer/)
    }
})

test('missing and wildcard ETags fail closed', async () => {
    const fail = async () => { assert.fail('must not call Dataverse') }
    for (const etag of [undefined, '*', 'W/"1"\r\nInjected: header']) {
        await assert.rejects(moveEquipmentLocation({ ...source, '@odata.etag': etag }, destination, true, { readSite: fail, writeSite: fail }), /Refresh/)
    }
})

test('the destination Site must still belong to the chosen Customer', async () => {
    await assert.rejects(moveEquipmentLocation(source, destination, true, { readSite: async () => ({ ...site, gr_Customer: { gr_customerid: id(9), gr_name: 'Changed' } }), writeSite: async () => assert.fail('no write') }), /no longer belongs/)
    await assert.rejects(moveEquipmentLocation(source, destination, true, { readSite: async () => ({ ...site, gr_siteid: id(9) }), writeSite: async () => assert.fail('no write') }), /no longer belongs/)
})

test('two administrators cannot silently overwrite the same equipment version', async () => {
    let etag = 'W/"1"'
    const io = { readSite: async () => site, writeSite: async (_id: string, _site: string, expected: string) => {
        if (etag !== expected) throw new Error('412 conflict')
        etag = 'W/"2"'
    } }
    const results = await Promise.allSettled([moveEquipmentLocation(source, destination, true, io), moveEquipmentLocation(source, destination, true, io)])
    assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
    assert.equal(results.filter((row) => row.status === 'rejected').length, 1)
})

test('read/write failures preserve the original equipment and do not fake success', async () => {
    const before = structuredClone(source)
    for (const stage of ['read', 'write']) {
        await assert.rejects(moveEquipmentLocation(source, destination, true, {
            readSite: async () => { if (stage === 'read') throw new Error('read failed'); return site },
            writeSite: async () => { throw new Error('write failed') },
        }), /failed/)
        assert.deepEqual(source, before)
    }
})

test('creation and edit flows reuse the location, Customer and Site components; history is moved only explicitly', () => {
    const book = read('src/alpha/job-book/JobBookPrototypeScreen.tsx')
    const fields = read('src/alpha/jobs/components/JobRelationshipFields.tsx')
    const create = read('src/alpha/jobs/components/JobCreateDrawer.tsx')
    const edit = read('src/alpha/jobs/components/JobEditDrawer.tsx')
    const shared = read('src/alpha/jobs/components/JobEquipmentLocation.tsx')
    assert.match(book, /!editingIntakeRow && isPersistedEquipmentId/)
    assert.match(book, /<JobEquipmentLocation/)
    assert.match(fields, /<JobEquipmentLocation/)
    assert.match(fields, /manageEquipmentLocation = false/)
    assert.match(create, /manageEquipmentLocation/)
    assert.match(edit, /manageEquipmentLocation/)
    assert.match(edit, /correctionsOnly allowCorrectionMasterCreation=\{allowCorrectionMasterCreation\} manageEquipmentLocation useLocationSummary deferLocationUntilEquipmentChoice/)
    assert.match(edit, /onLocationPendingChange=\{setLocationPending\}/)
    assert.match(edit, /disabled=\{isSaving \|\| locationPending \|\| locationSaving/)
    assert.match(shared, /<JobCustomerField/)
    assert.match(shared, /<JobSiteContactFields/)
    assert.match(shared, /Save equipment location/)
    assert.match(shared, /Cancel location edit/)
    assert.match(shared, /Previous jobs and maintenance settings stay unchanged/)
    assert.match(shared, /Refresh location/)
    assert.match(create, /disabled=\{isSaving \|\| locationPending \|\| locationSaving\}/)
    assert.match(book, /disabled=\{savingIntake \|\| registration.busy \|\| locationPending \|\| locationSaving\}/)
})

test('conditional API writes are narrow and job creation does not reapply a stale asset location', () => {
    const api = read('src/alpha/jobs/services/equipmentApi.ts').split('export async function updateEquipmentSite(')[1]
    assert.match(api, /'If-Match': ifMatch/)
    assert.match(api, /result.status === 412/)
    assert.match(api, /result.status === 403/)
    const hook = read('src/alpha/jobs/hooks/useEquipmentLocation.ts')
    assert.match(hook, /updateEquipmentSite\(token, id, destination, undefined, etag\)/)
    assert.match(hook, /controller.signal.aborted/)
    assert.match(hook, /canMoveEquipment/)
    assert.match(read('src/alpha/jobs/hooks/useJobs.ts'), /job.equipmentId && job.siteId && !job.equipmentLocationHandled/)
    assert.match(read('src/alpha/job-book/jobBookEquipmentIndexApi.ts'), /writeIfCurrent\(scope, generation, rows\)/)
})
