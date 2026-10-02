import assert from 'node:assert/strict'
import test from 'node:test'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import { JOB_CARD_STATUSES } from '../src/alpha/jobs/types/jobCardStatus.types.ts'
import { JOB_TYPES } from '../src/alpha/jobs/types/jobType.types.ts'
import { canRemoveAzureAssignment, usesAzureJobCards } from '../src/alpha/jobs/types/jobCardWorkflow.ts'
import { readFileSync } from 'node:fs'
import type { JobCardRequestSummary } from '../src/alpha/job-card-reviews/jobCardReview.types.ts'
import {
    formatTechnicianSubmissionHourMeter,
    formatTechnicianSubmissionTimestamp,
    hasTechnicianSubmission,
} from '../src/alpha/jobs/types/technicianSubmission.ts'

const job = (overrides: Partial<Job> = {}): Job => ({
    gr_jobid: 'job-1',
    createdon: '2026-07-25T00:00:00Z',
    gr_jobnumber: '145400',
    gr_status: 122830001,
    gr_ordernumber: null,
    gr_description: null,
    ...overrides,
})

test('recognises a completed technician submission', () => {
    assert.equal(hasTechnicianSubmission(job({
        gr_jobcardstatus: JOB_CARD_STATUSES.SUBMITTED,
        gr_techniciansubmissiontokenused: true,
        gr_techniciansubmissionsubmittedon: '2026-07-25T03:37:00Z',
    })), true)
})

test('recognises a Site Check submission without a single-Job token', () => {
    assert.equal(hasTechnicianSubmission(job({
        gr_jobcardstatus: JOB_CARD_STATUSES.SUBMITTED,
        gr_techniciansubmissiontokenused: false,
        gr_techniciansubmissionsubmittedon: '2026-07-25T03:37:00Z',
        gr_techniciansubmissionstory: 'Completed the machine checklist.',
        _gr_sitecheck_value: 'site-check-1',
    })), true)
})

test('does not treat token existence alone as a submission', () => {
    assert.equal(hasTechnicianSubmission(job({
        gr_jobcardstatus: JOB_CARD_STATUSES.SENT,
        gr_techniciansubmissiontokenhash: 'hash',
        gr_techniciansubmissiontokenused: false,
    })), false)
})

test('requires both the submitted status and authoritative timestamp', () => {
    assert.equal(hasTechnicianSubmission(job({
        gr_jobcardstatus: JOB_CARD_STATUSES.SUBMITTED,
        gr_techniciansubmissiontokenused: true,
    })), false)
})

test('formats submitted values for manager review', () => {
    assert.match(formatTechnicianSubmissionTimestamp('2026-07-25T03:37:00Z'), /25 Jul 2026/)
    assert.equal(formatTechnicianSubmissionHourMeter(4326), '4,326')
    assert.equal(formatTechnicianSubmissionHourMeter(null), 'Not supplied')
})

test('ordinary Jobs use Azure regardless of legacy card status while Site Checks retain their workflow', () => {
    for (const status of Object.values(JOB_CARD_STATUSES)) {
        assert.equal(usesAzureJobCards(job({ gr_jobcardstatus: status })), true)
    }
    assert.equal(usesAzureJobCards(job({ gr_jobtype: JOB_TYPES.SITE_CHECK })), false)
    assert.equal(usesAzureJobCards(job({ _gr_sitecheck_value: 'occurrence-1' })), false)
})

test('assignment removal fails closed when history is unknown, incomplete or references the assignment', () => {
    assert.equal(canRemoveAzureAssignment('assignment-1', undefined, []), false)
    assert.equal(canRemoveAzureAssignment('assignment-1', { items: [], truncated: true }, []), false)
    const item: JobCardRequestSummary = { reviewId: 'review-1', assignmentId: 'assignment-1', technicianName: 'Test', createdOn: '2026-10-02T00:00:00Z', expiresOn: '2026-10-03T00:00:00Z', status: 'reviewed', photoCount: 0 }
    assert.equal(canRemoveAzureAssignment('assignment-1', { items: [item], truncated: false }, []), false)
    assert.equal(canRemoveAzureAssignment('assignment-1', { items: [], truncated: false }, [{ _gr_jobassignment_value: 'assignment-1' }]), false)
    assert.equal(canRemoveAzureAssignment('assignment-2', { items: [item], truncated: false }, []), true)
})

test('normal Job controls no longer consume legacy workflow states', () => {
    const source = (path: string) => readFileSync(new URL(`../src/alpha/jobs/${path}`, import.meta.url), 'utf8')
    const fields = source('components/JobCardFields.tsx')
    assert.match(fields, /useJobCardHistory\(azure \? job.gr_jobid : undefined\)/)
    assert.match(fields, /Historical submissions · old system/)
    assert.match(fields, /\(azure \|\| !latestSubmissionIds/)
    assert.match(fields, /!azure && status !== JOB_CARD_STATUSES.NOT_SENT/)
    assert.match(fields, /status=\{azure \? undefined/)
    assert.match(source('components/JobEditDrawer.tsx'), /azureJobCards \|\| jobCardStatus === JOB_CARD_STATUSES.NOT_SENT/)
    assert.match(source('components/JobsTable.tsx'), /usesAzureJobCards\(job\) \? 'Job cards' : 'Submitted'/)
    const hook = source('hooks/useJobs.ts')
    assert.equal((hook.match(/if \(!usesAzureJobCards\(job\)\) await updateJobCardStatusApi/g) || []).length, 2)
    assert.match(hook, /if \(!usesAzureJobCards\(job\)\) await updateJobAssignmentStatusApi/)
})
