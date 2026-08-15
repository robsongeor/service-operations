import assert from 'node:assert/strict'
import test from 'node:test'

import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'
import {
    mapGreentreeEquipmentRecords,
    duplicateSerialCorrectionCsv,
    profileGreentreeEquipment,
    reconcileGreentreeEquipment,
    reconciliationReviewCount,
    type GreentreeEquipmentSnapshot,
} from '../src/alpha/equipment-test/greentreeReconciliation.ts'
import { greentreeImportBatches, greentreeImportIssues, importGreentreeEquipmentBatch } from '../src/alpha/equipment-test/greentreeEquipmentImport.ts'

test('owned Greentree table maps code and stable source key', () => {
    const mapped = mapGreentreeEquipmentRecords([{
        gr_greentreeequipmentid: 'row-1',
        gr_sourcekey: 'source-1',
        gr_greentreecode: 'FLT-100',
    }], 'gr_greentreeequipmentid')
    assert.equal(mapped[0].fleet, 'FLT-100')
    assert.equal(mapped[0].sourceId, 'source-1')
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
    siteAddress2: '',
    siteName: '',
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

test('source profile reports duplicates, missing fields, and legacy fleet labels', () => {
    const first = { ...sourceEquipment('F100', 'S100'), siteAddress1: '1 Test Road' }
    const second = { ...sourceEquipment('F100', '') }
    const app = [appEquipment('1', 'Cardinal01 exFN1584', 'APP-1')]
    const reconciliation = reconcileGreentreeEquipment([first, second], app)
    const profile = profileGreentreeEquipment([first, second], reconciliation, app)
    assert.equal(profile.fleet.duplicateValues, 1)
    assert.equal(profile.fleet.duplicateRows, 2)
    assert.equal(profile.serial.missing, 1)
    assert.equal(profile.missingSiteName, 2)
    assert.equal(profile.distinctSiteAddresses, 1)
    assert.equal(profile.legacyAppFleetLabels, 1)
})

test('any Greentree row with a fleet number and at most one app match is importable', () => {
    const complete = reconcileGreentreeEquipment([sourceEquipment('F100', 'S100')], []).rows[0]
    assert.deepEqual(greentreeImportIssues(complete), [])
    const incomplete = reconcileGreentreeEquipment([{ ...sourceEquipment('F101', ''), make: '' }], []).rows[0]
    assert.deepEqual(greentreeImportIssues(incomplete), [])
    const matched = reconcileGreentreeEquipment([sourceEquipment('F102', 'S102')], [appEquipment('1', 'F102', 'S102')]).rows[0]
    assert.deepEqual(greentreeImportIssues(matched), [])
    const noFleet = reconcileGreentreeEquipment([{ ...sourceEquipment('', 'S103') }], []).rows[0]
    assert.deepEqual(greentreeImportIssues(noFleet), ['Fleet Number Code is required.'])
    const ambiguous = reconcileGreentreeEquipment(
        [sourceEquipment('F104', 'S104')],
        [appEquipment('1', 'F104', 'OTHER'), appEquipment('2', 'OTHER', 'S104')],
    ).rows[0]
    assert.match(greentreeImportIssues(ambiguous).join(' '), /Multiple app records/)
})

test('duplicate Greentree serials are blocked from import', () => {
    const rows = reconcileGreentreeEquipment(
        [sourceEquipment('F105', 'DUPLICATE-SERIAL'), sourceEquipment('F106', 'duplicate-serial')],
        [],
    ).rows
    assert.equal(rows.every((row) => greentreeImportIssues(row).some((issue) => /Serial is duplicated/gi.test(issue))), true)
})

test('duplicate serial correction CSV lists every affected item and its peers', () => {
    const source = [
        { ...sourceEquipment('F105', 'DUP-1'), name: 'First machine', siteName: 'North' },
        { ...sourceEquipment('F106', 'dup-1'), name: 'Second machine', siteName: 'South' },
        sourceEquipment('F107', 'UNIQUE'),
    ]
    const csv = duplicateSerialCorrectionCsv(source)
    assert.match(csv, /Serial,Greentree Code,Equipment Name/)
    assert.match(csv, /DUP-1,F105,First machine/)
    assert.match(csv, /dup-1,F106,Second machine/)
    assert.match(csv, /F106/)
    assert.match(csv, /F105/)
    assert.doesNotMatch(csv, /UNIQUE/)
})

test('one-click import planning splits records into guarded batches of 50', () => {
    const rows = Array.from({ length: 121 }, (_, index) => reconcileGreentreeEquipment([sourceEquipment(`F${index}`, `S${index}`)], []).rows[0])
    assert.deepEqual(greentreeImportBatches(rows).map((batch) => batch.length), [50, 50, 21])
})

const administrator = { storageId: 'admin', displayName: 'Admin', username: 'georger@liftrucks.co.nz' }

test('a clear app match is updated from Greentree', async () => {
    const row = reconcileGreentreeEquipment(
        [{ ...sourceEquipment('F200', 'S200'), make: 'Komatsu', model: 'FG25' }],
        [appEquipment('existing', 'F200', 'OLD-SERIAL')],
    ).rows[0]
    const originalFetch = globalThis.fetch
    let requestUrl = ''
    let requestMethod = ''
    let payload: Record<string, unknown> = {}
    globalThis.fetch = async (input, init) => {
        requestUrl = String(input)
        requestMethod = init?.method ?? ''
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(null, { status: 204 })
    }
    try {
        const result = await importGreentreeEquipmentBatch(administrator, 'token', [row])
        assert.match(requestUrl, /gr_equipments\(existing\)$/)
        assert.equal(requestMethod, 'PATCH')
        assert.deepEqual(payload, { gr_fleet: 'F200', gr_serial: 'S200', gr_make: 'Komatsu', gr_model: 'FG25' })
        assert.deepEqual(result.succeeded, [{ sourceId: 'F200-S200', equipmentId: 'existing', action: 'updated' }])
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('unmatched import creates Equipment and excludes Customer and Site data', async () => {
    const row = reconcileGreentreeEquipment([sourceEquipment('F201', 'S201')], []).rows[0]
    const originalFetch = globalThis.fetch
    let payload: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
        payload = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(JSON.stringify({ gr_equipmentid: 'created-1' }), { status: 200 })
    }
    try {
        const result = await importGreentreeEquipmentBatch(administrator, 'token', [row])
        assert.equal(result.succeeded.length, 1)
        assert.equal(result.succeeded[0].action, 'created')
        assert.deepEqual(payload, { gr_fleet: 'F201', gr_serial: 'S201', gr_make: 'Toyota', gr_model: '8FG' })
        assert.equal(Object.keys(payload).some((key) => /site|customer/i.test(key)), false)
    } finally {
        globalThis.fetch = originalFetch
    }
})
