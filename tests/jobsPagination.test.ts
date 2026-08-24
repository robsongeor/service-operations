import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchJobCardDetails, fetchJobCore, fetchJobs } from '../src/alpha/jobs/services/jobsApi.ts'
import { fetchJobAssignmentsForJob } from '../src/alpha/jobs/services/jobAssignmentsApi.ts'

const useJobsSource = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
const jobDrawerSource = readFileSync(new URL('../src/alpha/jobs/components/JobEditDrawer.tsx', import.meta.url), 'utf8')
const jobCardSource = readFileSync(new URL('../src/alpha/jobs/components/JobCardFields.tsx', import.meta.url), 'utf8')

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

test('Jobs startup defers drawer-only reference tables and focused records', () => {
    const initialLoadStart = useJobsSource.indexOf('const loadInitialData = async () =>')
    const initialLoadEnd = useJobsSource.indexOf('void loadInitialData()', initialLoadStart)
    const initialLoad = useJobsSource.slice(initialLoadStart, initialLoadEnd)

    assert.notEqual(initialLoadStart, -1)
    assert.notEqual(initialLoadEnd, -1)
    assert.match(initialLoad, /fetchJobsApi\(/)
    assert.doesNotMatch(initialLoad, /fetchStaffDirectory\(token\)/)
    assert.match(useJobsSource, /STAFF_DIRECTORY_QUERY_KEY/)
    assert.match(useJobsSource, /useOperationalQuery<Mechanic\[\]>/)
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
    const editorPreparationStart = useJobsSource.indexOf('const prepareJobEditorReferenceData = useCallback')
    const editorPreparationEnd = useJobsSource.indexOf('const searchEquipmentForEditor', editorPreparationStart)
    const editorPreparation = useJobsSource.slice(editorPreparationStart, editorPreparationEnd)
    assert.doesNotMatch(editorPreparation, /fetchEquipmentApi\(/)
    assert.doesNotMatch(editorPreparation, /fetchSitesApi\(/)
    assert.doesNotMatch(editorPreparation, /fetchCustomersApi\(/)
    assert.doesNotMatch(editorPreparation, /fetchSiteContactsApi\(/)
    assert.doesNotMatch(editorPreparation, /fetchEquipmentServicePlans\(/)
    assert.match(useJobsSource, /searchEquipmentApi\(/)
    assert.match(useJobsSource, /searchCustomersApi\(/)
    assert.match(useJobsSource, /fetchCustomerSitesApi\(/)
    assert.match(useJobsSource, /fetchSiteContactsForSiteApi\(/)
    assert.match(useJobsSource, /fetchEquipmentServicePlansForEquipment\(/)
    assert.match(useJobsSource, /fetchJobCoreApi\(token, jobId, signal\)/)
    assert.doesNotMatch(useJobsSource, /prepareJobReferenceData\(\),\s*getAccessToken\(\)/)
    assert.match(useJobsSource, /fetchJobCardDetailsApi\(token, jobId, signal\)/)
    assert.match(useJobsSource, /fetchQuotesForJobApi\(await getAccessToken\(\), jobId, signal\)/)
    assert.match(useJobsSource, /fetchJobAssignmentsForJobApi\(await getAccessToken\(\), jobId, signal\)/)
    assert.match(jobDrawerSource, /useOperationalQuery<Job>\(/)
    assert.match(jobDrawerSource, /focusedJobCoreQueryKey\(normalizedJobId\)/)
    assert.match(jobDrawerSource, /focusedJobCardMetadataQueryKey\(normalizedJobId\)/)
    assert.match(jobDrawerSource, /focusedJobQuotesQueryKey\(normalizedJobId\)/)
    assert.match(jobDrawerSource, /focusedJobAssignmentsQueryKey\(normalizedJobId\)/)
    assert.match(jobCardSource, /jobPhotoBodyQueryKey\(previewPhotoId \|\| 'none'\)/)
})

test('focused Job assignments request is bounded to the opened Job', async () => {
    const originalFetch = globalThis.fetch
    let requestedUrl = ''
    globalThis.fetch = async (input) => {
        requestedUrl = String(input)
        return Response.json({ value: [{ gr_jobassignmentid: 'assignment-id' }] })
    }
    try {
        const assignments = await fetchJobAssignmentsForJob(token, 'job-id')
        const url = new URL(requestedUrl)
        assert.equal(assignments.length, 1)
        assert.equal(url.searchParams.get('$filter'), '_gr_job_value eq job-id')
        assert.equal(url.searchParams.get('$top'), '51')
        assert.equal(url.searchParams.get('$orderby'), 'gr_assignedon desc')
        assert.match(url.searchParams.get('$expand') ?? '', /gr_Mechanic/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('focused Job core and Job Card detail use independent requests', async () => {
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input)
        requests.push(url)
        if (url.includes('/gr_jobs?')) {
            return new Response(JSON.stringify({ value: [{ gr_jobid: '11111111-1111-4111-8111-111111111111' }] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        }
        if (url.includes('/gr_jobphotos?')) {
            return new Response(JSON.stringify({ value: [{
                gr_jobphotoid: '33333333-3333-4333-8333-333333333333',
                gr_filename: 'evidence.jpg',
                gr_displayorder: 1,
            }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({ value: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    }) as typeof fetch

    try {
        await fetchJobCore(token, '11111111-1111-4111-8111-111111111111')
        assert.equal(requests.length, 1)
        assert.match(requests[0], /\/gr_jobs\?/)
        assert.equal(requests[0].includes('gr_jobphotos'), false)
        assert.equal(requests[0].includes('gr_jobcardsubmissions'), false)

        requests.length = 0
        const details = await fetchJobCardDetails(token, '11111111-1111-4111-8111-111111111111')
        assert.equal(requests.some((url) => url.includes('gr_jobmaterials')), true)
        assert.equal(requests.some((url) => url.includes('gr_jobcardsubmissiontimeentries')), true)
        assert.equal(requests.some((url) => url.includes('gr_jobphotos')), true)
        assert.equal(requests.some((url) => url.includes('gr_jobcardsubmissions')), true)
        assert.equal(requests.some((url) => url.includes('/gr_jobs?')), false)
        assert.equal(requests.some((url) => url.includes('/gr_photo/$value')), false)
        assert.deepEqual(details.jobPhotos, [{
            id: '33333333-3333-4333-8333-333333333333',
            fileName: 'evidence.jpg',
            uploadedOn: '',
            displayOrder: 1,
        }])
    } finally {
        globalThis.fetch = originalFetch
    }
})
