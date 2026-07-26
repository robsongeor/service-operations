import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'
import { JOB_TYPES } from '../src/alpha/jobs/types/jobType.types.ts'
import { jobIsSchedulerEligible } from '../src/alpha/jobs/types/jobSchedulerEligibility.ts'
import { APPLICATION_DEFAULT_JOBS_VIEW, getJobsDefaultViewKey, restoreJobsDefaultView } from '../src/alpha/jobs/types/jobsDefaultView.types.ts'
import { getJobsViewStateKey, restoreJobsViewState } from '../src/alpha/jobs/types/jobsViewState.types.ts'

class MemoryStorage {
    values = new Map<string, string>()
    getItem(key: string) { return this.values.get(key) ?? null }
    setItem(key: string, value: string) { this.values.set(key, value) }
    removeItem(key: string) { this.values.delete(key) }
}

test('application Jobs default is Operational rather than truly unfiltered All', () => {
    assert.equal(APPLICATION_DEFAULT_JOBS_VIEW.selectedJobType, 'operational')
})

test('v2 current view migrates legacy All to Operational and preserves preferences', () => {
    const storage = new MemoryStorage()
    Object.assign(globalThis, { sessionStorage: storage })
    storage.setItem('service-operations.jobs-view-state.v2.user-1', JSON.stringify({
        visibleStatuses: [JOB_STATUSES.ALLOCATED],
        selectedJobType: 'all',
        officeAttentionFilter: 'required',
        searchText: 'forklift',
        scheduledJobsVisibility: 'today',
        sort: { column: 'customer', direction: 'descending' },
    }))
    const restored = restoreJobsViewState(getJobsViewStateKey('user-1'), true)
    assert.equal(restored?.selectedJobType, 'operational')
    assert.equal(restored?.searchText, 'forklift')
    assert.equal(restored?.officeAttentionFilter, 'required')
    assert.deepEqual(restored?.sort, { column: 'customer', direction: 'descending' })
})

test('v1 saved default migrates All to Operational while preserving statuses', () => {
    const storage = new MemoryStorage()
    Object.assign(globalThis, { sessionStorage: storage })
    storage.setItem('service-operations.jobs-default-view.v1.user-2', JSON.stringify({
        selectedJobType: 'all',
        visibleStatuses: [JOB_STATUSES.ALLOCATED, JOB_STATUSES.COMPLETE],
        stickyThroughColumnId: null,
    }))
    const restored = restoreJobsDefaultView(getJobsDefaultViewKey('user-2'))
    assert.equal(restored?.selectedJobType, 'operational')
    assert.deepEqual(restored?.visibleStatuses, [JOB_STATUSES.ALLOCATED, JOB_STATUSES.COMPLETE])
})

test('Scheduler eligibility excludes Site Check and Unconfirmed Jobs', () => {
    assert.equal(jobIsSchedulerEligible({ gr_status: JOB_STATUSES.ALLOCATED, gr_jobtype: JOB_TYPES.SITE_CHECK }), false)
    assert.equal(jobIsSchedulerEligible({ gr_status: JOB_STATUSES.UNCONFIRMED, gr_jobtype: JOB_TYPES.BREAKDOWN }), false)
    assert.equal(jobIsSchedulerEligible({ gr_status: JOB_STATUSES.ALLOCATED, gr_jobtype: JOB_TYPES.BREAKDOWN }), true)
})

test('Jobs and Scheduler apply explicit Site Check integration contracts', () => {
    const jobsTable = readFileSync(new URL('../src/alpha/jobs/components/JobsTable.tsx', import.meta.url), 'utf8')
    const scheduler = readFileSync(new URL('../src/alpha/scheduling/SchedulingScreen.tsx', import.meta.url), 'utf8')
    const jobsHook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    assert.match(jobsTable, /selectedJobType === 'operational'.*JOB_TYPES\.SITE_CHECK/)
    assert.match(scheduler, /jobIsSchedulerEligible\(job\)/)
    assert.match(scheduler, /SCHEDULER_JOB_TYPE_OPTIONS/)
    assert.match(jobsHook, /assertJobSchedulerEligible/)
    assert.match(jobsHook, /SITE_CHECK_SCHEDULER_MESSAGE/)
})
