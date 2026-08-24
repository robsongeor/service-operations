import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isEquipmentRealtimeEvent } from '../src/alpha/equipment/services/equipmentRealtime.ts'

test('Equipment realtime accepts only bounded Dataverse change notifications', () => {
    assert.equal(isEquipmentRealtimeEvent({
        equipmentId: '11111111-1111-4111-8111-111111111111',
        operation: 'update',
        changedAt: '2026-08-15T01:00:00.000Z',
    }), true)
    assert.equal(isEquipmentRealtimeEvent({ equipmentId: 'not-a-guid', operation: 'update', changedAt: 'now' }), false)
    assert.equal(isEquipmentRealtimeEvent({
        equipmentId: '11111111-1111-4111-8111-111111111111',
        operation: 'read',
        changedAt: '2026-08-15T01:00:00.000Z',
    }), false)
})

test('Equipment uses the shared app-shell realtime status and event dispatcher', () => {
    const hook = readFileSync('src/alpha/equipment/hooks/useEquipmentManager.ts', 'utf8')
    assert.match(hook, /useOperationalRealtimeStatus\(\)/)
    assert.match(hook, /subscribeToEquipmentChanges\(refreshEquipment\)/)
    assert.match(hook, /operationalDataClient\.fetchQuery\([\s\S]*?EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY/)
    assert.doesNotMatch(hook, /subscribeToEquipmentData/)
    assert.doesNotMatch(hook, /new HubConnectionBuilder/)
})
