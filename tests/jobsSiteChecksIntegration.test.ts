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

test('every Job completion reconciles bounded authoritative records', () => {
    const jobsHook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    assert.match(jobsHook, /const refreshCompletionDataAndServiceDates = async/)
    assert.match(jobsHook, /const recoverCompletionData = async/)
    assert.match(jobsHook, /fetchEquipmentJobsApi\(token, equipmentId\)/)
    assert.match(jobsHook, /fetchJobCoreApi\(token, jobId\)/)
    assert.equal(jobsHook.match(/await refreshCompletionDataAndServiceDates\(token, equipment\.gr_equipmentid, request\.job\.gr_jobid\)/g)?.length, 3)
    assert.doesNotMatch(jobsHook, /fetchEquipmentServicePlans\(token\)/)
    assert.match(jobsHook, /setCompletionRequest\(null\)/)
})

test('focused Job hydration appends an absent Job and loads only its office updates', () => {
    const jobsHook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    assert.match(jobsHook, /const fetchJobForDrawer = useCallback/)
    assert.match(jobsHook, /:\s*\[\.\.\.current, refreshed\]/)
    assert.match(jobsHook, /fetchJobOfficeUpdatesForJobsApi\(await getAccessToken\(\), \[jobId\], signal\)/)
    assert.match(jobsHook, /loadJobOfficeUpdatesForEditor/)
})

test('Scheduler opens the Job drawer immediately and progressively refreshes its data', () => {
    const scheduler = readFileSync(new URL('../src/alpha/scheduling/SchedulingScreen.tsx', import.meta.url), 'utf8')
    assert.match(scheduler, /const openJob = \(job: Job\)/)
    assert.match(scheduler, /setEditingJob\(job\)/)
    assert.match(scheduler, /onPrepareReferenceData=\{prepareJobReferenceData\}/)
    assert.match(scheduler, /onRefreshJob=\{fetchJobForDrawer\}/)
    assert.match(scheduler, /onLoadJobCardDetails=\{fetchJobCardDetails\}/)
    assert.match(scheduler, /officeUpdates=\{officeUpdates\.filter/)
    assert.match(scheduler, /onCreateOfficeUpdate=\{createJobOfficeUpdate\}/)
    assert.match(scheduler, /onSaveOfficeAttention=\{updateJobOfficeAttention\}/)
})

test('Jobs table supports copying selected visible Job Book rows in sorted order', () => {
    const jobsTable = readFileSync(new URL('../src/alpha/jobs/components/JobsTable.tsx', import.meta.url), 'utf8')
    const clipboard = readFileSync(new URL('../src/alpha/jobs/utils/jobBookClipboard.ts', import.meta.url), 'utf8')
    assert.match(jobsTable, /from '\.\.\/utils\/jobBookClipboard'/)
    assert.match(clipboard, /jobBookFleetCell[\s\S]*formatFleetNumbers/)
    assert.match(clipboard, /jobBookFleetCell\(job\)/)
    assert.match(jobsTable, /JOBS_FEEDBACK_TIMEOUT_MS = 5000/)
    assert.match(jobsTable, /aria-label="Dismiss notification"/)
    assert.match(jobsTable, /selectedShownJobs\.map\(buildJobBookSpreadsheetRow\)\.join\('\\n'\)/)
    assert.match(jobsTable, /Select all shown/)
    assert.match(jobsTable, /Select Job \$\{job\.gr_jobnumber \|\| 'row'\} for job book export/)
})

test('Job drawer omits Job number controls and clipboard allocation actions', () => {
    const coreFields = readFileSync(new URL('../src/alpha/jobs/components/JobCoreFields.tsx', import.meta.url), 'utf8')
    const editDrawer = readFileSync(new URL('../src/alpha/jobs/components/JobEditDrawer.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(coreFields, /draft\.jobNumber|<span>Job number<\/span>/)
    assert.doesNotMatch(coreFields, /copyJobBookSpreadsheetRow|Copy for Job Book/)
    assert.match(editDrawer, /jobBookJob=\{job\}/)
})

test('Service Coordination and Job Book creation both expose the shared scheduler', () => {
    const jobsScreen = readFileSync(new URL('../src/alpha/jobs/JobsScreen.tsx', import.meta.url), 'utf8')
    const jobBook = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(jobsScreen, /<JobCreateDrawer\s+stagingOnly=/)
    assert.match(jobBook, /<JobScheduleFields draftOptions=\{scheduleDrafts\} onDraftOptionsChange=\{setScheduleDrafts\}/)
    assert.match(jobBook, /createJobScheduleOption\(token/)
})

test('Job number paste is rejected before any network request', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { assert.fail('No request should occur') }
    try {
        await assert.rejects(() => allocateJobNumbers('token', [
            { job: { gr_jobid: '00000000-0000-4000-8000-000000000001', '@odata.etag': 'W/"1"' } as never, jobNumber: '145850' },
            { job: { gr_jobid: '00000000-0000-4000-8000-000000000002', '@odata.etag': 'W/"2"' } as never, jobNumber: '145851' },
        ]), /regional allocation system/)
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

test('ordinary Job creation rejects manual numbers before POST', () => {
    const api = readFileSync(new URL('../src/alpha/jobs/services/jobsApi.ts', import.meta.url), 'utf8')
    const drawer = readFileSync(new URL('../src/alpha/jobs/components/JobCreateDrawer.tsx', import.meta.url), 'utf8')
    assert.match(api, /if \(job\.jobNumber\.trim\(\)\)/)
    assert.match(api, /Manual Job number entry is disabled/)
    assert.doesNotMatch(drawer, /findDuplicateJobNumber|enter a different number/)
})
