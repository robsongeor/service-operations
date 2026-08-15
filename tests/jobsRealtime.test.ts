import assert from 'node:assert/strict'
import test from 'node:test'
import { isJobsRealtimeEvent } from '../src/alpha/jobs/services/jobsRealtime.ts'

test('Jobs realtime accepts only bounded Dataverse change notifications', () => {
    assert.equal(isJobsRealtimeEvent({ jobId: '11111111-1111-4111-8111-111111111111', operation: 'update', changedAt: '2026-08-16T01:00:00.000Z' }), true)
    assert.equal(isJobsRealtimeEvent({ jobId: 'not-a-guid', operation: 'update', changedAt: 'now' }), false)
    assert.equal(isJobsRealtimeEvent({ jobId: '11111111-1111-4111-8111-111111111111', operation: 'read', changedAt: '2026-08-16T01:00:00.000Z' }), false)
})
