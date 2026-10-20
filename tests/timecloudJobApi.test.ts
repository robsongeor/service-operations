import assert from 'node:assert/strict'
import test from 'node:test'
import { syncJobBookJobToTimecloud } from '../src/alpha/job-book/timecloudJobApi.ts'

const originalFetch = globalThis.fetch
const input = {
    book: 'auckland' as const,
    jobId: '00000000-0000-4000-8000-000000000001',
    ledgerId: '00000000-0000-4000-8000-000000000002',
    trigger: 'manual' as const,
}

test.afterEach(() => { globalThis.fetch = originalFetch })

test('TimeCloud client sends only the registered pair and Dataverse token', async () => {
    globalThis.fetch = async (url, init) => {
        assert.equal(url, '/api/timecloudjobs')
        assert.equal(init?.method, 'POST')
        assert.equal((init?.headers as Record<string, string>)['X-Dataverse-Authorization'], 'Bearer dataverse-token')
        assert.equal((init?.headers as Record<string, string>).Authorization, undefined)
        assert.deepEqual(JSON.parse(String(init?.body)), input)
        return Response.json({
            jobId: input.jobId,
            jobNumber: '146781',
            timecloudJobItemId: '6aab1673160d0477d2e3e07d',
            timecloudCode: '26958',
            timecloudEntered: true,
            created: true,
            etag: 'W/"8"',
        }, { status: 201 })
    }
    const result = await syncJobBookJobToTimecloud('dataverse-token', input)
    assert.equal(result.created, true)
    assert.equal(result.timecloudCode, '26958')
})

test('TimeCloud client preserves a safe server error for retry guidance', async () => {
    globalThis.fetch = async () => Response.json({ error: 'TimeCloud already contains Job 146781 with different details. Review it before retrying.' }, { status: 409 })
    await assert.rejects(syncJobBookJobToTimecloud('dataverse-token', input), /different details/)
})

test('TimeCloud client rejects an unverified response', async () => {
    globalThis.fetch = async () => Response.json({ jobId: input.jobId, timecloudEntered: true })
    await assert.rejects(syncJobBookJobToTimecloud('dataverse-token', input), /invalid confirmation/)
})

test('TimeCloud client accepts a verified disabled skip', async () => {
    globalThis.fetch = async () => Response.json({
        jobId: input.jobId, jobNumber: '146781', timecloudEntered: false, created: false,
        skipped: true, reason: 'disabled',
    })
    const result = await syncJobBookJobToTimecloud('dataverse-token', { ...input, trigger: 'automatic' })
    assert.equal(result.timecloudEntered, false)
})
