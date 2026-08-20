import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchJobOfficeUpdatesForJobs } from '../src/alpha/jobs/services/jobOfficeUpdatesApi.ts'
import { fetchJobScheduleOptionsForJobs } from '../src/alpha/jobs/services/jobScheduleApi.ts'

const useJobsSource = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
const customerDataSource = readFileSync(new URL('../src/alpha/customers/useCustomerDashboardData.ts', import.meta.url), 'utf8')
const schedulerDataSource = readFileSync(new URL('../src/alpha/scheduling/useSchedulerWindowData.ts', import.meta.url), 'utf8')

test('scoped Job supporting-data requests filter Schedule Options and Office Updates by Job IDs', async () => {
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = async (input) => {
        requests.push(String(input))
        return Response.json({ value: [] })
    }

    try {
        await fetchJobScheduleOptionsForJobs('token', ['job-one', 'job-two'])
        await fetchJobOfficeUpdatesForJobs('token', ['job-one', 'job-two'])

        assert.equal(requests.length, 2)
        for (const request of requests) {
            const filter = new URL(request, 'http://localhost').searchParams.get('$filter') ?? ''
            assert.match(filter, /_gr_job_value eq job-one/)
            assert.match(filter, /_gr_job_value eq job-two/)
        }
        assert.match(requests[0], /gr_jobscheduleoptions/)
        assert.match(requests[1], /gr_jobofficeupdates/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('scoped useJobs consumers supply bounded supporting data instead of triggering global reads', () => {
    const initialLoadStart = useJobsSource.indexOf('const loadInitialData = async () =>')
    const initialLoadEnd = useJobsSource.indexOf('void loadInitialData()', initialLoadStart)
    const initialLoad = useJobsSource.slice(initialLoadStart, initialLoadEnd)

    assert.match(initialLoad, /hasScopedScheduleOptions/)
    assert.match(initialLoad, /hasScopedOfficeUpdates/)
    assert.match(initialLoad, /loadGlobalOperationalData\s*\?\s*fetchJobScheduleOptionsApi\(token\)\s*:\s*Promise\.resolve\(\[\]\)/)
    assert.match(initialLoad, /loadGlobalOperationalData\s*\?\s*fetchJobOfficeUpdatesApi\(token\)\s*:\s*Promise\.resolve\(\[\]\)/)
    assert.match(customerDataSource, /fetchJobScheduleOptionsForJobs/)
    assert.match(customerDataSource, /fetchJobOfficeUpdatesForJobs/)
    assert.match(schedulerDataSource, /fetchJobOfficeUpdatesForJobs/)
})
