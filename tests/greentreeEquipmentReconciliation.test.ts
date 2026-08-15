import assert from 'node:assert/strict'
import test from 'node:test'

import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'
import {
    mapGreentreeEquipmentRecords,
    profileGreentreeEquipment,
    reconcileGreentreeEquipment,
    reconciliationReviewCount,
    type GreentreeEquipmentSnapshot,
} from '../src/alpha/equipment-test/greentreeReconciliation.ts'
import { greentreeImportBatches, greentreeImportIssues, importGreentreeEquipmentBatch } from '../src/alpha/equipment-test/greentreeEquipmentImport.ts'

test('cr16b_Code maps to fleet while cr16b_CodeActive is ignored', () => {
    const mapped = mapGreentreeEquipmentRecords([{
        cr16b_greentreeequipmenttableid: 'source-1',
        cr16b_CodeActive: 'Yes',
        cr16b_Code: 'FLT-100',
    }], 'cr16b_greentreeequipmenttableid')
    assert.equal(mapped[0].fleet, 'FLT-100')
    assert.equal(mapped[0].codeActive, 'Yes')
})

const appEquipment = (id: string, fleet: string, serial: string): Equipment => ({
    gr_equipmentid: id,
    gr_fleet: fleet,
    gr_serial: serial,
    gr_make: 'Toyota',
    gr_model: '8FG',
})

const sourceEquipment = (fleet: string, serial: string): GreentreeEquipmentSnapshot => ({
    sourceId: `${fleet}-${serial}`,
    fleet,
    serial,
    make: 'Toyota',
    model: '8FG',
    siteAddress1: '',
    siteAddress3: '',
    siteName: '',
    codeActive: '',
})

test('fleet and serial matching one app record is exact', () => {
    const result = reconcileGreentreeEquipment([sourceEquipment('F100', 'S100')], [appEquipment('1', 'f100', 's100')])
    assert.equal(result.rows[0].status, 'exact')
    assert.equal(result.rows[0].appEquipment?.gr_equipmentid, '1')
    assert.equal(result.appOnly.length, 0)
})

test('one unique identity match is probable', () => {
    const result = reconcileGreentreeEquipment([sourceEquipment('F100', 'NEW-SERIAL')], [appEquipment('1', 'F100', 'OLD-SERIAL')])
    assert.equal(result.rows[0].status, 'probable')
    assert.deepEqual(result.rows[0].reasons, ['Matched by Fleet Number Code only'])
})

test('Site differences do not affect Equipment-only reconciliation review', () => {
    const source = { ...sourceEquipment('F103', 'S103'), siteName: 'Greentree Site', siteAddress1: '1 Source Road' }
    const app = { ...appEquipment('1', 'F103', 'S103'), gr_Site: { gr_siteid: 'site-1', gr_name: 'App Site', gr_address: '2 App Road' } }
    const row = reconcileGreentreeEquipment([source], [app]).rows[0]
    assert.equal(row.status, 'exact')
    assert.equal(row.qualityIssues.some((issue) => /site/i.test(issue)), false)
    assert.equal(row.differences.some((difference) => /site/i.test(difference.field)), false)
    assert.equal(reconciliationReviewCount(row), 0)
})

test('different fleet and serial matches are a conflict', () => {
    const result = reconcileGreentreeEquipment(
        [sourceEquipment('F100', 'S200')],
        [appEquipment('1', 'F100', 'S100'), appEquipment('2', 'F200', 'S200')],
    )
    assert.equal(result.rows[0].status, 'conflict')
    assert.match(result.rows[0].reasons.join(' '), /different app records/)
})

test('duplicates in Greentree are blocked as conflicts', () => {
    const result = reconcileGreentreeEquipment(
        [sourceEquipment('F100', 'S100'), sourceEquipment('F100', 'S101')],
        [],
    )
    assert.equal(result.rows[0].status, 'conflict')
    assert.equal(result.rows[1].status, 'conflict')
})

test('unmatched source and app records remain visible', () => {
    const result = reconcileGreentreeEquipment([sourceEquipment('NEW', 'NEW')], [appEquipment('1', 'OLD', 'OLD')])
    assert.equal(result.rows[0].status, 'new')
    assert.equal(result.appOnly[0].gr_equipmentid, '1')
})

test('source profile reports duplicates, missing fields, active distribution, and legacy fleet labels', () => {
    const first = { ...sourceEquipment('F100', 'S100'), codeActive: 'Yes', siteAddress1: '1 Test Road' }
    const second = { ...sourceEquipment('F100', ''), codeActive: 'No' }
    const app = [appEquipment('1', 'Cardinal01 exFN1584', 'APP-1')]
    const reconciliation = reconcileGreentreeEquipment([first, second], app)
    const profile = profileGreentreeEquipment([first, second], reconciliation, app)
    assert.equal(profile.fleet.duplicateValues, 1)
    assert.equal(profile.fleet.duplicateRows, 2)
    assert.equal(profile.serial.missing, 1)
    assert.equal(profile.missingSiteName, 2)
    assert.equal(profile.distinctSiteAddresses, 1)
    assert.deepEqual(profile.codeActiveValues, [{ value: 'No', count: 1 }, { value: 'Yes', count: 1 }])
    assert.equal(profile.legacyAppFleetLabels, 1)
})

test('only complete New rows are eligible for creation-only import', () => {
    const complete = reconcileGreentreeEquipment([sourceEquipment('F100', 'S100')], []).rows[0]
    assert.deepEqual(greentreeImportIssues(complete), [])
    const incomplete = reconcileGreentreeEquipment([{ ...sourceEquipment('F101', ''), make: '' }], []).rows[0]
    assert.deepEqual(greentreeImportIssues(incomplete), ['Serial is required.', 'Make is required.'])
    const matched = reconcileGreentreeEquipment([sourceEquipment('F102', 'S102')], [appEquipment('1', 'F102', 'S102')]).rows[0]
    assert.deepEqual(greentreeImportIssues(matched), ['Only New records can be imported.'])
})

test('one-click import planning splits records into guarded batches of 50', () => {
    const rows = Array.from({ length: 121 }, (_, index) => reconcileGreentreeEquipment([sourceEquipment(`F${index}`, `S${index}`)], []).rows[0])
    assert.deepEqual(greentreeImportBatches(rows).map((batch) => batch.length), [50, 50, 21])
})

const administrator = { storageId: 'admin', displayName: 'Admin', username: 'georger@liftrucks.co.nz' }

test('import preflight skips a newly duplicated fleet without issuing a POST', async () => {
    const row = reconcileGreentreeEquipment([sourceEquipment('F200', 'S200')], []).rows[0]
    const originalFetch = globalThis.fetch
    let writes = 0
    globalThis.fetch = async () => { writes += 1; return new Response() }
    try {
        const result = await importGreentreeEquipmentBatch(administrator, 'token', [row], async () => [appEquipment('existing', 'F200', 'OTHER')])
        assert.equal(writes, 0)
        assert.equal(result.succeeded.length, 0)
        assert.match(result.failed[0].message, /now exists/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('creation-only import payload excludes Customer and Site data', async () => {
    const row = reconcileGreentreeEquipment([sourceEquipment('F201', 'S201')], []).rows[0]
    const originalFetch = globalThis.fetch
    let payload: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(JSON.stringify({ gr_equipmentid: 'created-1' }), { status: 200 })
    }
    try {
        const result = await importGreentreeEquipmentBatch(administrator, 'token', [row], async () => [])
        assert.equal(result.succeeded.length, 1)
        assert.deepEqual(payload, { gr_fleet: 'F201', gr_serial: 'S201', gr_make: 'Toyota', gr_model: '8FG' })
        assert.equal(Object.keys(payload).some((key) => /site|customer/i.test(key)), false)
    } finally {
        globalThis.fetch = originalFetch
    }
})
