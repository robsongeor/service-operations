import assert from 'node:assert/strict'
import test from 'node:test'
import { EQUIPMENT_PAGE_SIZE, paginateEquipmentRows } from '../src/alpha/equipment/equipmentPagination.ts'

test('large Equipment results render only one bounded page', () => {
    const equipment = Array.from({ length: 4_730 }, (_, index) => index + 1)
    const first = paginateEquipmentRows(equipment, 1)
    const last = paginateEquipmentRows(equipment, 48)

    assert.equal(EQUIPMENT_PAGE_SIZE, 100)
    assert.equal(first.rows.length, 100)
    assert.deepEqual(first.rows.slice(0, 2), [1, 2])
    assert.equal(last.totalPages, 48)
    assert.equal(last.rows.length, 30)
    assert.deepEqual(last.rows.slice(-2), [4_729, 4_730])
})

test('Equipment page requests are clamped after filtering changes the result count', () => {
    assert.equal(paginateEquipmentRows([1, 2, 3], 99).page, 1)
    assert.equal(paginateEquipmentRows([], -4).page, 1)
})
