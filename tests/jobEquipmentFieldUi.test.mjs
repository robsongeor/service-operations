import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let JobEquipmentField
const originalFetch = globalThis.fetch
test.before(async () => {
    globalThis.fetch = async () => { throw new Error('UI fixture must not call a backend.') }
    server = await createServer({ configFile: false, envDir: false, server: { middlewareMode: true, watch: null }, appType: 'custom' })
    JobEquipmentField = (await server.ssrLoadModule('/src/alpha/jobs/components/JobEquipmentField.tsx')).default
})
test.after(async () => { globalThis.fetch = originalFetch; await server?.close() })

const noChange = () => { throw new Error('Opening the drawer must not change equipment.') }
const snapshot = { gr_equipmentid: '', gr_fleet: '123', gr_serial: 'SERIAL-123', gr_make: 'Saved make', gr_model: 'Saved model' }
const render = (props = {}) => renderToStaticMarkup(createElement(JobEquipmentField, {
    value: '', equipmentList: [], onChange: noChange, onCreateEquipment: noChange, ...props,
}))

test('saved unlinked machine details render as the normal selected tile on reopening', () => {
    const html = render({ selectedEquipmentFallback: snapshot })
    assert.match(html, /<strong>123<\/strong>/)
    assert.match(html, /Saved make · Saved model/)
    assert.match(html, /Change selected equipment/)
    assert.doesNotMatch(html, /role="combobox"|New equipment|role="listbox"/)
})

test('serial-only snapshots and linked machines absent from the directory are not blank', () => {
    assert.match(render({ selectedEquipmentFallback: { ...snapshot, gr_fleet: null } }), /Serial SERIAL-123/)
    assert.match(render({ value: 'saved-id', selectedEquipmentFallback: { ...snapshot, gr_equipmentid: 'saved-id' } }), /<strong>123<\/strong>/)
})

test('a directory machine with the same fleet cannot silently replace a snapshot-only selection', () => {
    const html = render({ selectedEquipmentFallback: snapshot, equipmentList: [{ ...snapshot, gr_equipmentid: 'other-id', gr_make: 'Wrong machine' }] })
    assert.match(html, /Saved make/)
    assert.doesNotMatch(html, /Wrong machine/)
})

test('fallback cannot override an exact directory selection or a newly selected ID', () => {
    const html = render({ value: 'selected-id', equipmentList: [{ ...snapshot, gr_equipmentid: 'selected-id', gr_fleet: 'CURRENT' }], selectedEquipmentFallback: { ...snapshot, gr_equipmentid: 'selected-id' } })
    assert.match(html, /<strong>CURRENT<\/strong>/)
    assert.doesNotMatch(html, /<strong>123<\/strong>/)
    assert.match(render({ value: 'different-id', selectedEquipmentFallback: snapshot }), /role="combobox"/)
})

test('cleared selection and explicit unknown equipment keep their existing presentation', () => {
    assert.match(render(), /role="combobox"/)
    const html = render({ unknownEquipmentOption: { selected: true, label: 'Equipment not known yet', description: 'Match later', onChange: noChange } })
    assert.match(html, /Equipment not known yet/)
    assert.match(html, /Change unknown equipment selection/)
    assert.doesNotMatch(html, /role="combobox"/)
})
