import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchJobs } from '../src/alpha/jobs/services/jobsApi.ts'

const useJobsSource = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')

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

test('Jobs startup defers drawer-only reference tables behind one shared request', () => {
    const initialLoadStart = useJobsSource.indexOf('const loadInitialData = async () =>')
    const initialLoadEnd = useJobsSource.indexOf('void loadInitialData()', initialLoadStart)
    const initialLoad = useJobsSource.slice(initialLoadStart, initialLoadEnd)

    assert.notEqual(initialLoadStart, -1)
    assert.notEqual(initialLoadEnd, -1)
    assert.match(initialLoad, /fetchJobsApi\(/)
    assert.match(initialLoad, /fetchStaffDirectory\(token\)/)
    assert.match(initialLoad, /fetchJobScheduleOptionsApi\(token\)/)
    assert.match(initialLoad, /fetchJobOfficeUpdatesApi\(token\)/)
    assert.doesNotMatch(initialLoad, /fetchEquipmentApi\(token\)/)
    assert.doesNotMatch(initialLoad, /fetchSitesApi\(token\)/)
    assert.doesNotMatch(initialLoad, /fetchCustomersApi\(token\)/)
    assert.doesNotMatch(initialLoad, /fetchSiteContactsApi\(token\)/)
    assert.doesNotMatch(initialLoad, /fetchQuotesApi\(token\)/)
    assert.doesNotMatch(initialLoad, /fetchJobAssignmentsApi\(token\)/)
    assert.doesNotMatch(initialLoad, /fetchEquipmentServicePlans\(token\)/)

    assert.match(useJobsSource, /if \(referenceDataRequestRef\.current\) return referenceDataRequestRef\.current/)
    assert.match(useJobsSource, /const prepareJobReferenceData = useCallback/)
    assert.match(useJobsSource, /prepareJobReferenceData\(\),\s*getAccessToken\(\)/)
})
