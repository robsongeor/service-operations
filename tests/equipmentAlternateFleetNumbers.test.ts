import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    equipmentIdentifierSearchValues,
    normalizeAlternateFleetNumbers,
    parseAlternateFleetNumbers,
    preservePreviousFleetNumber,
} from '../src/alpha/equipment/identifiers/alternateFleetNumbers.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'

test('alternate Fleet Numbers normalize to distinct one-per-line values', () => {
    assert.deepEqual(parseAlternateFleetNumbers('FN2123\n Site-01 ; fn2123,Customer  01'), [
        'FN2123',
        'Site-01',
        'Customer 01',
    ])
    assert.equal(normalizeAlternateFleetNumbers('FN2123; site-01;fn2123', 'SITE-01'), 'FN2123')
})

test('changing the primary Fleet Number preserves the previous value as an alternate', () => {
    assert.equal(preservePreviousFleetNumber('SITE-01', 'FN2123', 'Customer01'), 'SITE-01\nFN2123')
    assert.equal(preservePreviousFleetNumber('customer01\nFN2123', 'FN2123', 'Customer01'), 'FN2123')
    assert.equal(preservePreviousFleetNumber('SITE-01', 'FN2123', 'fn2123'), 'SITE-01')
})

test('Equipment identifier search includes primary, alternate and serial values', () => {
    const equipment = {
        gr_equipmentid: 'equipment-1',
        gr_fleet: 'Customer01',
        gr_alternatefleetnumbers: 'FN2123\nSITE-01',
        gr_serial: 'SER-9',
        gr_make: null,
        gr_model: null,
    } satisfies Equipment
    assert.deepEqual(equipmentIdentifierSearchValues(equipment), ['Customer01', 'FN2123', 'SITE-01', 'SER-9'])
})

test('Equipment projections and canonical editor include the alternate Fleet Number field', () => {
    const equipmentApi = readFileSync(new URL('../src/alpha/jobs/services/equipmentApi.ts', import.meta.url), 'utf8')
    const jobsApi = readFileSync(new URL('../src/alpha/jobs/services/jobsApi.ts', import.meta.url), 'utf8')
    const jobBookApi = readFileSync(new URL('../src/alpha/job-book/jobBookEquipmentIndexApi.ts', import.meta.url), 'utf8')
    const managerApi = readFileSync(new URL('../src/alpha/equipment/services/equipmentManagerApi.ts', import.meta.url), 'utf8')
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')

    assert.match(equipmentApi, /gr_fleet,gr_alternatefleetnumbers,gr_serial/)
    assert.match(jobsApi, /gr_fleet,gr_alternatefleetnumbers,gr_make/)
    assert.match(jobBookApi, /gr_fleet,gr_alternatefleetnumbers,gr_serial/)
    assert.match(managerApi, /gr_alternatefleetnumbers: normalized\.alternateFleetNumbers \|\| null/)
    assert.match(drawer, /Alternate Fleet Numbers/)
    assert.match(drawer, /preservePreviousFleetNumber/)
})

test('alternate Fleet Number schema script validates without connecting to Dataverse', () => {
    const script = readFileSync(new URL('../scripts/manage-equipment-alternate-fleet-schema.ps1', import.meta.url), 'utf8')
    assert.match(script, /\[ValidateSet\('Inspect', 'Provision', 'Verify'\)\]/)
    assert.match(script, /\$logicalName = 'gr_alternatefleetnumbers'/)
    assert.match(script, /MemoAttributeMetadata/)
    assert.match(script, /if \(\$ValidateDefinition\)/)
})
