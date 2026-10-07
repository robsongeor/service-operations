import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { jobCreationLocationErrors, assertJobCreationLocation } from '../src/alpha/jobs/domain/jobCreationLocation.ts'
import { createJob } from '../src/alpha/jobs/services/jobsApi.ts'
import { createJobBookIntakeRow, updateJobBookIntakeRow } from '../src/alpha/job-book/jobBookApi.ts'
import { createBlankJobBookRow, setEquipmentReviewRequired, applyIntakeCustomerToRow, jobBookEquipmentFallback } from '../src/alpha/job-book/jobBookPrototype.ts'
import { JOB_TYPES } from '../src/alpha/jobs/types/jobType.types.ts'
import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'
import { SERVICE_TYPES } from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'
import type { JobSaveInput } from '../src/alpha/jobs/types/jobSave.types.ts'

const location = { customerId: 'customer-1', siteId: 'site-1', address: '1 Sample Road' }
const job: JobSaveInput = { jobNumber: '', orderNumber: '', description: 'Sample work', jobType: JOB_TYPES.BREAKDOWN, status: JOB_STATUSES.UNALLOCATED, serviceType: SERVICE_TYPES.NONE }
const selectedSite = { gr_siteid: location.siteId, gr_name: 'Sample site', gr_address: location.address, gr_Customer: { gr_customerid: location.customerId, gr_name: 'Sample customer' } }
const intake = { ...setEquipmentReviewRequired(createBlankJobBookRow(0), true), ...location, description: 'Sample work', addressVerified: true }
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const intakeResponse = { gr_jobbookentryid: 'intake-1', gr_jobnumber: '900100', gr_stage: 122830000, createdon: '2026-10-03T00:00:00Z', '@odata.etag': 'W/"2"' }

test('no-equipment creation requires Customer, Site and a non-whitespace address', () => {
    assert.deepEqual(Object.keys(jobCreationLocationErrors({})), ['customer', 'site', 'address'])
    for (const [field, errorField] of [['customerId', 'customer'], ['siteId', 'site'], ['address', 'address']] as const) {
        for (const blank of [undefined, null, '', '  \n ']) {
            const incomplete = { ...location, [field]: blank }
            assert.deepEqual(Object.keys(jobCreationLocationErrors(incomplete)), [errorField])
            assert.throws(() => assertJobCreationLocation(incomplete), /when no equipment is selected/)
        }
    }
    assert.deepEqual(jobCreationLocationErrors(location), {})
    assert.doesNotThrow(() => assertJobCreationLocation(location))
})

test('known Equipment bypasses the new rule; clearing it immediately restores requirements', () => {
    assert.deepEqual(jobCreationLocationErrors({ equipmentId: 'equipment-1' }), {})
    assert.deepEqual(jobCreationLocationErrors({ equipmentId: 'prototype-equipment-1' }), {})
    assert.equal(Object.keys(jobCreationLocationErrors({ equipmentId: '' })).length, 3)
})

test('changing the unknown-equipment Customer clears the old Site and address for revalidation', () => {
    const changed = applyIntakeCustomerToRow(intake, 'customer-2', 'Different customer')
    assert.equal(changed.equipmentReviewRequired, true)
    assert.equal(changed.siteId, '')
    assert.equal(changed.address, '')
    assert.deepEqual(Object.keys(jobCreationLocationErrors(changed)), ['site', 'address'])
})

test('managed Job service rejects no Site without any request', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => assert.fail('no request expected'))
    await assert.rejects(createJob('sample-token', job), /Select a customer/)
})

test('managed Job creation rechecks the saved Site and rejects missing Customer or address before writing', async (t) => {
    for (const site of [{ ...selectedSite, gr_Customer: undefined }, { ...selectedSite, gr_address: '  ' }]) {
        const calls: string[] = []
        const mock = t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
            assert.equal(init?.method, undefined)
            calls.push(String(url))
            return Response.json(site)
        })
        await assert.rejects(createJob('sample-token', { ...job, siteId: location.siteId }), /when no equipment is selected/)
        assert.equal(calls.length, 1)
        assert.match(calls[0], /gr_sites\(site-1\)/)
        mock.mock.restore()
    }
})

test('failed Site verification blocks managed Job creation without a POST', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        assert.notEqual(init?.method, 'POST')
        return new Response('', { status: 403 })
    })
    await assert.rejects(createJob('sample-token', { ...job, siteId: location.siteId }), /could not be verified/)
})

test('valid no-equipment managed Job saves the Site link, not duplicate Customer or address columns', async (t) => {
    const writes: Record<string, unknown>[] = []
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).includes('gr_sites(')) return Response.json(selectedSite)
        assert.equal(init?.method, 'POST')
        writes.push(JSON.parse(String(init?.body)))
        return Response.json({ gr_jobid: 'job-1' })
    })
    assert.equal(await createJob('sample-token', { ...job, siteId: location.siteId }), 'job-1')
    assert.equal(writes.length, 1)
    assert.equal(writes[0]['gr_Site@odata.bind'], '/gr_sites(site-1)')
    assert.equal(writes[0]['gr_Equipment@odata.bind'], undefined)
    assert.equal(writes[0]['gr_Customer@odata.bind'], undefined)
    assert.equal(writes[0].gr_address, undefined)
})

test('equipment-linked creation does not add a Site request or new requirement', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        assert.equal(init?.method, 'POST')
        return Response.json({ gr_jobid: 'job-2' })
    })
    assert.equal(await createJob('sample-token', { ...job, equipmentId: 'equipment-1' }), 'job-2')
})

test('incomplete no-equipment Intake is rejected before allocating any Job Number', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => assert.fail('must not allocate a number'))
    for (const field of ['customerId', 'siteId', 'address']) {
        await assert.rejects(createJobBookIntakeRow('sample-token', { ...intake, [field]: ' ' }), /when no equipment is selected/)
    }
    // An explicit unknown decision cannot accidentally be bypassed by a stale Equipment ID.
    await assert.rejects(createJobBookIntakeRow('sample-token', { ...intake, equipmentId: 'stale', address: '' }), /address/)
})

test('valid unknown-equipment Intake preserves its Customer, Site and address snapshot', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        assert.equal(init?.method, 'POST')
        const body = JSON.parse(String(init?.body))
        assert.equal(body['gr_Customer@odata.bind'], '/gr_customers(customer-1)')
        assert.equal(body['gr_Site@odata.bind'], '/gr_sites(site-1)')
        assert.equal(body.gr_addresssnapshot, location.address)
        assert.equal(body.gr_equipmentreviewrequired, true)
        assert.equal(body.gr_jobnumber, undefined)
        return Response.json(intakeResponse)
    })
    assert.equal((await createJobBookIntakeRow('sample-token', intake)).jobNumber, '900100')
})

test('inline Customer/Site snapshots remain accepted without inventing master-record links', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body))
        assert.equal(body['gr_Customer@odata.bind'], undefined)
        assert.equal(body['gr_Site@odata.bind'], undefined)
        assert.equal(body.gr_customersnapshot, 'New customer')
        assert.equal(body.gr_sitesnapshot, 'New site')
        assert.equal(body.gr_addresssnapshot, location.address)
        return Response.json(intakeResponse)
    })
    await createJobBookIntakeRow('sample-token', { ...intake, customerId: 'prototype-customer-1', siteId: 'prototype-site-1', customer: 'New customer', site: 'New site' })
})

test('old incomplete Intake edits and marker updates remain valid and conditional', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        if (!init?.method) return Response.json({ ...intakeResponse, '@odata.etag': 'W/"1"' })
        assert.equal(init?.method, 'PATCH')
        assert.equal((init?.headers as Record<string, string>)['If-Match'], 'W/"1"')
        return Response.json(intakeResponse)
    })
    await updateJobBookIntakeRow('sample-token', { ...createBlankJobBookRow(0), entrySource: 'dataverse-intake', intakeRecordId: 'intake-1', etag: 'W/"1"', entered: true })
})

test('equipment snapshot survives save/reopen/edit without a master lookup or lost location', async (t) => {
    const draft = { ...createBlankJobBookRow(0), equipmentId: 'prototype-machine', fleet: '123', serial: 'S123', make: 'Saved make', model: 'Saved model', equipmentConfigured: true, description: 'Original work', customer: 'Saved Customer', site: 'Saved Site', ...location }
    let stored: Record<string, unknown> = {}
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        if (!init?.method) return Response.json(stored)
        const body = JSON.parse(String(init?.body))
        assert.equal(body['gr_Equipment@odata.bind'], undefined)
        assert.equal(body.gr_fleetsnapshot, '123')
        assert.equal(body.gr_serialsnapshot, 'S123')
        assert.equal(body.gr_customersnapshot, 'Saved Customer')
        assert.equal(body.gr_sitesnapshot, 'Saved Site')
        assert.equal(body.gr_addresssnapshot, location.address)
        if (init?.method === 'PATCH') assert.equal((init.headers as Record<string, string>)['If-Match'], 'W/"2"')
        stored = { ...intakeResponse, ...body, gr_Customer: { gr_customerid: location.customerId }, gr_Site: { gr_siteid: location.siteId } }
        return Response.json(stored)
    })
    const saved = await createJobBookIntakeRow('sample-token', draft)
    assert.equal(saved.equipmentId, '')
    assert.equal(jobBookEquipmentFallback(saved)?.gr_fleet, '123')
    const edited = await updateJobBookIntakeRow('sample-token', { ...saved, description: 'Changed work only' })
    assert.equal(edited.equipmentId, '')
    assert.deepEqual(jobBookEquipmentFallback(edited), jobBookEquipmentFallback(saved))
    assert.equal(edited.customerId, saved.customerId)
    assert.equal(edited.siteId, saved.siteId)
})

test('both creation drawers use shared validation and required Customer/Site/address controls, not edit-only flows', () => {
    const create = read('src/alpha/jobs/components/JobCreateDrawer.tsx')
    const intakeScreen = read('src/alpha/job-book/JobBookPrototypeScreen.tsx')
    const relationships = read('src/alpha/jobs/components/JobRelationshipFields.tsx')
    const sharedEquipment = read('src/alpha/jobs/components/JobEquipmentAndLocationFields.tsx')
    const sharedDetails = read('src/alpha/jobs/components/JobDetailsFields.tsx')
    const core = read('src/alpha/jobs/components/JobCoreFields.tsx')
    const selectors = read('src/alpha/jobs/components/JobSiteContactFields.tsx')
    assert.match(create, /jobCreationLocationErrors\(/)
    assert.match(create, /locationRequired=\{equipmentUnknown\}/)
    assert.match(create, /deferLocationUntilEquipmentChoice/)
    assert.match(create, /label: 'Equipment not known yet'/)
    assert.match(create, /if \(!draft\.equipmentId && !equipmentUnknown\)/)
    assert.match(create, /if \(locationError\) return setSaveError\(locationError\)/)
    assert.match(intakeScreen, /const requireIntakeLocation = !editingIntakeRow && draft.equipmentReviewRequired/)
    assert.match(intakeScreen, /required=\{requireIntakeLocation\}/)
    assert.match(intakeScreen, /locationRequired=\{requireIntakeLocation\}/)
    assert.match(relationships, /locationRequired = false/)
    assert.match(relationships, /showRelationshipFields = !deferLocationUntilEquipmentChoice \|\| Boolean\(draft\.equipmentId\) \|\| Boolean\(unknownEquipmentOption\?\.selected\)/)
    assert.match(relationships, /<JobEquipmentAndLocationFields/)
    assert.match(intakeScreen, /<JobEquipmentAndLocationFields/)
    assert.match(sharedEquipment, /<JobEquipmentField/)
    assert.match(intakeScreen, /<JobDetailsFields/)
    assert.match(core, /<JobDetailsFields/)
    assert.match(sharedDetails, /Description of the job/)
    assert.match(sharedDetails, /Customer PO/)
    assert.match(relationships, /<JobCustomerField[\s\S]*required=\{locationRequired\}/)
    assert.match(selectors, /<span>Site address \*<\/span>/)
    assert.match(selectors, /<input readOnly value=\{selectedAddress\}/)
    assert.match(selectors, /aria-required=\{locationRequired \|\| undefined\}/)
    assert.doesNotMatch(read('src/alpha/jobs/components/JobEditDrawer.tsx'), /jobCreationLocationErrors|locationRequired/)
})
