import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'
import { JOB_TYPES } from '../src/alpha/jobs/types/jobType.types.ts'
import { jobIsSchedulerEligible } from '../src/alpha/jobs/types/jobSchedulerEligibility.ts'
import { APPLICATION_DEFAULT_JOBS_VIEW, getJobsDefaultViewKey, restoreJobsDefaultView } from '../src/alpha/jobs/types/jobsDefaultView.types.ts'
import { getJobsViewStateKey, restoreJobsViewState } from '../src/alpha/jobs/types/jobsViewState.types.ts'
import { allocateJobNumbers, assertJobNumberAvailable } from '../src/alpha/jobs/services/jobsApi.ts'
import { findDuplicateJobNumber, normalizeJobNumber } from '../src/alpha/jobs/utils/jobNumber.ts'

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

test('every Job completion refresh bypasses stale cached Jobs', () => {
    const jobsHook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    assert.match(jobsHook, /const refreshCompletionDataAndServiceDates = async/)
    assert.match(jobsHook, /fetchJobsApi\(token, \{ forceRefresh: true \}\)/)
    assert.equal(jobsHook.match(/await refreshCompletionDataAndServiceDates\(token, equipment\.gr_equipmentid\)/g)?.length, 3)
    assert.match(jobsHook, /setCompletionRequest\(null\)/)
})

test('Scheduler opens the authoritative Job editor workflow with Office actions', () => {
    const scheduler = readFileSync(new URL('../src/alpha/scheduling/SchedulingScreen.tsx', import.meta.url), 'utf8')
    assert.match(scheduler, /const openJob = async \(job: Job\)/)
    assert.match(scheduler, /await prepareJobReferenceData\(\)/)
    assert.match(scheduler, /await fetchJobForDrawer\(job\.gr_jobid\)/)
    assert.match(scheduler, /officeUpdates=\{officeUpdates\.filter/)
    assert.match(scheduler, /onCreateOfficeUpdate=\{createJobOfficeUpdate\}/)
    assert.match(scheduler, /onSaveOfficeAttention=\{updateJobOfficeAttention\}/)
})

test('Jobs table supports copying selected visible Job Book rows in sorted order', () => {
    const jobsTable = readFileSync(new URL('../src/alpha/jobs/components/JobsTable.tsx', import.meta.url), 'utf8')
    assert.match(jobsTable, /jobBookFleetCell[\s\S]*formatFleetNumbers/)
    assert.match(jobsTable, /jobBookFleetCell\(job\)/)
    assert.match(jobsTable, /JOBS_FEEDBACK_TIMEOUT_MS = 5000/)
    assert.match(jobsTable, /aria-label="Dismiss notification"/)
    assert.match(jobsTable, /selectedShownJobs\.map\(buildJobBookSpreadsheetRow\)\.join\('\\n'\)/)
    assert.match(jobsTable, /Select all shown/)
    assert.match(jobsTable, /Select Job \$\{job\.gr_jobnumber \|\| 'row'\} for job book export/)
})

test('Job number paste uses one atomic change set in selected-row order', async () => {
    const originalFetch = globalThis.fetch
    let request: RequestInit | undefined
    let requestUrl = ''
    globalThis.fetch = async (url, init) => {
        requestUrl = String(url)
        request = init
        return new Response('HTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content', { status: 200 })
    }
    try {
        await allocateJobNumbers('token', [
            { job: { gr_jobid: 'job-1', '@odata.etag': 'W/"1"' } as never, jobNumber: '145850' },
            { job: { gr_jobid: 'job-2', '@odata.etag': 'W/"2"' } as never, jobNumber: '145851' },
        ])
        assert.match(requestUrl, /\/api\/data\/v9\.2\/\$batch$/)
        assert.match(String(request?.body), /PATCH \/api\/data\/v9\.2\/gr_jobs\(job-1\)/)
        assert.match(String(request?.body), /If-Match: W\/"1"/)
        assert.match(String(request?.body), /\{"gr_jobnumber":"145850"\}/)
        assert.match(String(request?.body), /\{"gr_jobnumber":"145851"\}/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Job creation rejects duplicate numbers in loaded state and authoritative Dataverse', async () => {
    assert.equal(normalizeJobNumber('  ab-123  '), 'AB-123')
    assert.equal(findDuplicateJobNumber([
        { gr_jobid: 'existing', gr_jobnumber: 'Ab-123' } as never,
    ], ' ab-123 ')?.gr_jobid, 'existing')

    const originalFetch = globalThis.fetch
    let requestUrl = ''
    globalThis.fetch = async (url) => {
        requestUrl = String(url)
        return Response.json({ value: [{ gr_jobid: 'existing' }] })
    }
    try {
        await assert.rejects(
            assertJobNumberAvailable('token', "AB'123"),
            /Job Number AB'123 already exists/,
        )
        assert.match(decodeURIComponent(requestUrl), /\$filter=gr_jobnumber\+eq\+%?['"]?AB''123/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('every Job creation performs the Dataverse duplicate preflight before POST', () => {
    const api = readFileSync(new URL('../src/alpha/jobs/services/jobsApi.ts', import.meta.url), 'utf8')
    const drawer = readFileSync(new URL('../src/alpha/jobs/components/JobCreateDrawer.tsx', import.meta.url), 'utf8')
    assert.match(api, /await assertJobNumberAvailable\(accessToken, job\.jobNumber\)/)
    assert.match(drawer, /findDuplicateJobNumber\(existingJobs, draft\.jobNumber\)/)
    assert.match(drawer, /already exists\. Open the existing Job or enter a different number/)
})
