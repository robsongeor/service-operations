import assert from 'node:assert/strict'
import test from 'node:test'
import {
    requestGreenTreeJobReconciliation,
    resetGreenTreeJobReconciliationCooldownForTests,
} from '../src/alpha/job-book/greenTreeJobSyncApi.ts'

const originalFetch = global.fetch

test.afterEach(() => {
    global.fetch = originalFetch
    resetGreenTreeJobReconciliationCooldownForTests()
})

test('requests one background reconciliation and applies the browser cooldown', async () => {
    let calls = 0
    global.fetch = async (_url, options) => {
        calls += 1
        assert.equal(options?.method, 'POST')
        assert.equal(new Headers(options?.headers).get('X-Dataverse-Authorization'), 'Bearer sample-token')
        const body = JSON.parse(String(options?.body))
        assert.deepEqual(body, { mode: 'scheduled' })
        return Response.json({
            checkedAt: new Date().toISOString(), mode: 'scheduled', due: 1, selected: 1,
            checked: 1, updatedRecords: 1, notEntered: 0, open: 1, closed: 0,
            finalised: 0, remaining: 0, conflicts: [], failed: [],
        })
    }
    const first = await requestGreenTreeJobReconciliation('sample-token')
    const second = await requestGreenTreeJobReconciliation('sample-token')
    assert.equal(first?.updatedRecords, 1)
    assert.equal(second, null)
    assert.equal(calls, 1)
})
