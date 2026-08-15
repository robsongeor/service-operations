import assert from 'node:assert/strict'
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
