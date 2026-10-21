import assert from 'node:assert/strict'
import test from 'node:test'

import {
    canonicalizeWorkshopIdentifiers,
    normalizeWorkshopEquipmentQuery,
} from '../src/alpha/workshop-assistant/domain/workshopIdentifier.ts'

test('spoken rental fleet prefixes are presented as canonical FN identifiers', () => {
    assert.equal(canonicalizeWorkshopIdentifiers('ef en 2000'), 'FN2000')
    assert.equal(canonicalizeWorkshopIdentifiers('eff en 1000'), 'FN1000')
    assert.equal(canonicalizeWorkshopIdentifiers('Find F N 2450 please'), 'Find FN2450 please')
})

test('written rental fleet identifiers lose separator noise', () => {
    assert.equal(canonicalizeWorkshopIdentifiers('FN 3000'), 'FN3000')
    assert.equal(canonicalizeWorkshopIdentifiers('fn-3100'), 'FN3100')
})

test('Equipment searches extract a canonical rental fleet identifier from a spoken phrase', () => {
    assert.equal(normalizeWorkshopEquipmentQuery('find forklift ef en 2000 please'), 'FN2000')
    assert.equal(normalizeWorkshopEquipmentQuery('4582'), '4582')
})
