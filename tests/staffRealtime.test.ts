import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isStaffRealtimeEvent } from '../src/alpha/mechanics/services/staffRealtime.ts'

test('Staff realtime accepts only bounded Dataverse change notifications', () => {
    assert.equal(isStaffRealtimeEvent({ staffId: '11111111-1111-4111-8111-111111111111', operation: 'update', changedAt: '2026-08-16T01:00:00.000Z' }), true)
    assert.equal(isStaffRealtimeEvent({ staffId: 'not-a-guid', operation: 'update', changedAt: 'now' }), false)
    assert.equal(isStaffRealtimeEvent({ staffId: '11111111-1111-4111-8111-111111111111', operation: 'read', changedAt: '2026-08-16T01:00:00.000Z' }), false)
})

test('Staff consumers receive both bounded changes and shared reconnect recovery', () => {
    const service = readFileSync('src/alpha/mechanics/services/staffRealtime.ts', 'utf8')
    assert.match(service, /subscribeToOperationalRealtimeRecovery/)
    assert.match(service, /unsubscribeRecovery\(\)/)
})
