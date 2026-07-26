import assert from 'node:assert/strict'
import test from 'node:test'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import { JOB_CARD_STATUSES } from '../src/alpha/jobs/types/jobCardStatus.types.ts'
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
