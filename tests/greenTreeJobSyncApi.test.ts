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
        const age = Date.now() - Date.parse(body.modifiedSince)
        assert.ok(age > 22 * 60 * 60_000 && age < 24 * 60 * 60_000)
        return Response.json({
            checkedAt: new Date().toISOString(), received: 1, matched: 1, updated: 1,
            markedEntered: 1, movedToCompletionReview: 0, alreadyComplete: 0,
            unmatched: [], conflicts: [],
        })
    }
    const first = await requestGreenTreeJobReconciliation('sample-token')
    const second = await requestGreenTreeJobReconciliation('sample-token')
    assert.equal(first?.updated, 1)
    assert.equal(second, null)
    assert.equal(calls, 1)
})
