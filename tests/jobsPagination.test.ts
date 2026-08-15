import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchJobs } from '../src/alpha/jobs/services/jobsApi.ts'

const token = `header.${Buffer.from(JSON.stringify({ aud: 'org-jobs-pagination', tid: 'tenant', oid: 'user' })).toString('base64url')}.signature`

test('Jobs list follows every Dataverse page without loading drawer-only child tables', async () => {
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input)
        requests.push(url)
        if (requests.length === 1) {
            return new Response(JSON.stringify({
                value: [{ gr_jobid: '11111111-1111-4111-8111-111111111111' }],
                '@odata.nextLink': 'https://example.invalid/jobs?page=2',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({
            value: [{ gr_jobid: '22222222-2222-4222-8222-222222222222' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch

    try {
        const rows = await fetchJobs(token, { forceRefresh: true })
        assert.deepEqual(rows.map((row) => row.gr_jobid), [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
        ])
        assert.equal(requests.length, 2)
        assert.equal(requests[1], 'https://example.invalid/jobs?page=2')
        assert.equal(requests.some((url) => url.includes('gr_jobmaterials')), false)
        assert.equal(requests.some((url) => url.includes('gr_jobcardsubmissiontimeentries')), false)
    } finally {
        globalThis.fetch = originalFetch
    }
})
