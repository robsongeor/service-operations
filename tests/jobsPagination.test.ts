import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchJobs, fetchJobForDrawer, fetchHistoricalJobCardEvidence } from '../src/alpha/jobs/services/jobsApi.ts'

const useJobsSource = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')

const token = `header.${Buffer.from(JSON.stringify({ aud: 'org-jobs-pagination', tid: 'tenant', oid: 'user' })).toString('base64url')}.signature`

test('ordinary drawer defers historical tables while Site Checks retain eager evidence', async () => {
    const original = globalThis.fetch
    const requests: string[] = []
    let siteCheck = false
    globalThis.fetch = (async (input) => {
        const url = String(input)
        requests.push(url)
        return Response.json({ value: url.includes('/gr_jobs?') ? [{ gr_jobid: 'job-1', gr_jobtype: siteCheck ? 122830004 : 122830000 }] : [] })
    }) as typeof fetch
    try {
        const job = await fetchJobForDrawer(token, 'job-1')
        assert.equal(requests.length, 1)
        assert.equal(job?.jobCardSubmissions, undefined)
        const archive = await fetchHistoricalJobCardEvidence(token, 'job-1')
        assert.deepEqual(archive.jobCardSubmissions, [])
        assert.ok(requests.some((url) => url.includes('/gr_jobphotos?')))
        requests.length = 0
        siteCheck = true
        assert.deepEqual((await fetchJobForDrawer(token, 'job-1'))?.jobCardSubmissions, [])
        assert.equal(requests.length, 5)
    } finally { globalThis.fetch = original }
})

test('historical evidence errors and unverified paging are not silently treated as empty', async () => {
    const original = globalThis.fetch
    try {
        for (const failingTable of ['gr_jobmaterials', 'gr_jobphotos', 'gr_jobcardsubmissions', 'gr_jobcardsubmissiontimeentries']) {
            globalThis.fetch = (async (input) => String(input).includes(`/${failingTable}?`) ? new Response('', { status: 403 }) : Response.json({ value: [] })) as typeof fetch
            await assert.rejects(fetchHistoricalJobCardEvidence(token, 'job-1'))
        }
        globalThis.fetch = (async () => Response.json({ value: [], '@odata.nextLink': 'https://untrusted.invalid/page' })) as typeof fetch
        await assert.rejects(fetchHistoricalJobCardEvidence(token, 'job-1'), /paging/)
    } finally { globalThis.fetch = original }
})

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
