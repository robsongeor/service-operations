import assert from 'node:assert/strict'
import test from 'node:test'
import { groupJobsBySite, jobsWithoutSite } from '../src/alpha/job-map/jobMap.ts'
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
