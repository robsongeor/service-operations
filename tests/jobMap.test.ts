import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { groupJobsBySite, jobsWithoutSite } from '../src/alpha/job-map/jobMap.ts'
import { fetchJobMapJobs } from '../src/alpha/job-map/jobMapApi.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'

function job(id: string, status: Job['gr_status'], siteId?: string): Job {
    return {
        gr_jobid: id,
        createdon: '2026-08-17T00:00:00Z',
        gr_jobnumber: id,
        gr_status: status,
        gr_ordernumber: null,
        gr_description: null,
        ...(siteId ? { gr_Site: { gr_siteid: siteId, gr_name: 'Workshop', gr_address: '1 Test Road', gr_Customer: { gr_customerid: 'customer-1', gr_name: 'Example' } } } : {}),
    }
}

test('groups the three operational map statuses by Site and excludes completed Jobs', () => {
    const sites = groupJobsBySite([
        job('1', JOB_STATUSES.ALLOCATED, 'site-1'),
        job('2', JOB_STATUSES.UNALLOCATED, 'site-1'),
        job('3', JOB_STATUSES.WAITING_FOR_PARTS, 'site-2'),
        job('4', JOB_STATUSES.COMPLETE, 'site-2'),
    ])
    assert.equal(sites.length, 2)
    assert.deepEqual(sites.find((site) => site.siteId === 'site-1')?.jobs.map((item) => item.gr_jobid), ['1', '2'])
    assert.equal(sites.find((site) => site.siteId === 'site-1')?.markerTone, 'mixed')
    assert.equal(sites.find((site) => site.siteId === 'site-2')?.markerTone, 'waiting')
})

test('keeps target-status Jobs without a Site visible in the unmapped count', () => {
    const missing = jobsWithoutSite([
        job('1', JOB_STATUSES.ALLOCATED),
        job('2', JOB_STATUSES.UNALLOCATED, 'site-1'),
        job('3', JOB_STATUSES.COMPLETE),
    ])
    assert.deepEqual(missing.map((item) => item.gr_jobid), ['1'])
})

test('Job Map reads only selected statuses with its minimal location projection and follows paging', async () => {
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input)
        requests.push(url)
        if (requests.length === 1) {
            return Response.json({
                value: [{ gr_jobid: 'job-1' }],
                '@odata.nextLink': 'https://example.invalid/job-map?page=2',
            })
        }
        return Response.json({ value: [{ gr_jobid: 'job-2' }] })
    }) as typeof fetch

    try {
        const rows = await fetchJobMapJobs('token', [
            JOB_STATUSES.ALLOCATED,
            JOB_STATUSES.WAITING_FOR_PARTS,
        ])
        assert.deepEqual(rows.map((row) => row.gr_jobid), ['job-1', 'job-2'])
        assert.equal(requests.length, 2)
        const decoded = decodeURIComponent(requests[0])
        assert.match(decoded, /gr_status eq 122830000/)
        assert.match(decoded, /gr_status eq 122830002/)
        assert.doesNotMatch(decoded, /gr_status eq 122830001/)
        assert.match(decoded, /gr_geocodelatitude/)
        assert.match(decoded, /gr_geocoderesolvedon/)
        assert.doesNotMatch(decoded, /gr_techniciansubmissionstory/)
        assert.equal(requests[1], 'https://example.invalid/job-map?page=2')
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Job Map does not issue a Dataverse request when every status is disabled', async () => {
    const originalFetch = globalThis.fetch
    let requestCount = 0
    globalThis.fetch = (async () => {
        requestCount += 1
        return Response.json({ value: [] })
    }) as typeof fetch

    try {
        assert.deepEqual(await fetchJobMapJobs('token', []), [])
        assert.equal(requestCount, 0)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Job Map screen uses the shared status-scoped loader without global Job or Site collections', () => {
    const screen = readFileSync(new URL('../src/alpha/job-map/JobMapScreen.tsx', import.meta.url), 'utf8')
    const hook = readFileSync(new URL('../src/alpha/job-map/useJobMapData.ts', import.meta.url), 'utf8')

    assert.match(screen, /useJobMapData\(requestedStatuses\)/)
    assert.doesNotMatch(screen, /useJobs\(/)
    assert.doesNotMatch(screen, /fetchSites/)
    assert.match(hook, /jobMapJobsQueryKey\(statuses\)/)
    assert.match(hook, /startJobsRealtime/)
    assert.match(hook, /queryKey\[0\] === 'job-map'/)
})
