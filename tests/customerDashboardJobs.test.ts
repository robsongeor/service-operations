import assert from 'node:assert/strict'
import test from 'node:test'
import {
    customerJobsCsv,
    filterCustomerJobs,
    previousCalendarMonth,
    type CustomerJobFilters,
} from '../src/alpha/customers/customerJobs.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'

const jobs: Job[] = [
    {
        gr_jobid: 'closed-february', createdon: '2026-01-30T23:30:00Z', gr_jobnumber: '1001',
        gr_status: JOB_STATUSES.COMPLETE, gr_completeddate: '2026-02-14', gr_ordernumber: '=unsafe',
        gr_description: 'Replace hose', gr_Mechanic: { gr_mechanicid: 'm1', gr_name: 'Alex' },
        gr_Site: { gr_siteid: 's1', gr_name: 'Main depot', gr_address: '1 Test Street' },
    },
    {
        gr_jobid: 'open-february', createdon: '2026-02-20T01:00:00Z', gr_jobnumber: '1002',
        gr_status: JOB_STATUSES.ALLOCATED, gr_completeddate: null, gr_ordernumber: null,
        gr_description: 'Inspect brakes', gr_Mechanic: { gr_mechanicid: 'm2', gr_name: 'Blair' },
    },
    {
        gr_jobid: 'closed-march', createdon: '2026-03-03T01:00:00Z', gr_jobnumber: '1003',
        gr_status: JOB_STATUSES.COMPLETE, gr_completeddate: '2026-03-05', gr_ordernumber: null,
        gr_description: 'Service',
    },
]

function filters(overrides: Partial<CustomerJobFilters>): CustomerJobFilters {
    return { status: 'all', dateField: 'created', from: '', to: '', search: '', ...overrides }
}

test('previous calendar month handles ordinary months and year boundaries', () => {
    assert.deepEqual(previousCalendarMonth('2026-03-20'), { from: '2026-02-01', to: '2026-02-28' })
    assert.deepEqual(previousCalendarMonth('2026-01-10'), { from: '2025-12-01', to: '2025-12-31' })
})

test('closed last month filters on completed date inclusively', () => {
    const result = filterCustomerJobs(jobs, filters({
        status: 'closed', dateField: 'completed', from: '2026-02-01', to: '2026-02-28',
    }))
    assert.deepEqual(result.map((job) => job.gr_jobid), ['closed-february'])
})

test('Customer Job search and open filter use the visible Job fields', () => {
    assert.deepEqual(
        filterCustomerJobs(jobs, filters({ status: 'open', search: 'Blair' })).map((job) => job.gr_jobid),
        ['open-february'],
    )
})

test('Customer Job CSV is Excel-friendly, includes completed dates, and neutralises formulas', () => {
    const csv = customerJobsCsv([jobs[0]])
    assert.ok(csv.startsWith('\uFEFF'))
    assert.match(csv, /"Completed Date"/)
    assert.match(csv, /"2026-02-14"/)
    assert.match(csv, /"'=unsafe"/)
    assert.match(csv, /"Replace hose"/)
})
