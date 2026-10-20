import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    resolveJobCardProgress,
    statusAfterLifecycleSignal,
    withPersonalWatch,
} from '../src/alpha/jobs/domain/jobLifecycle.ts'
import {
    getJobStatusLabel,
    jobStatusIsVisible,
    JOB_STATUSES,
    JOB_STATUS_OPTIONS,
} from '../src/alpha/jobs/types/jobStatus.types.ts'
import { jobMapStatusLabel } from '../src/alpha/job-map/jobMap.ts'

test('Job Status persistence values remain unchanged while coordinator labels use the new vocabulary', () => {
    assert.deepEqual(JOB_STATUSES, {
        ALLOCATED: 122830000,
        UNALLOCATED: 122830001,
        WAITING_FOR_PARTS: 122830002,
        COMPLETE: 122830003,
        COMPLETION_REVIEW: 122830004,
        UNCONFIRMED: 122830005,
    })
    assert.equal(getJobStatusLabel(JOB_STATUSES.UNALLOCATED), 'Staging')
    assert.equal(getJobStatusLabel(JOB_STATUSES.ALLOCATED), 'With Technician')
    assert.equal(getJobStatusLabel(JOB_STATUSES.UNCONFIRMED), 'Staging')
    assert.equal(jobMapStatusLabel(JOB_STATUSES.UNALLOCATED), 'Staging')
    assert.equal(jobMapStatusLabel(JOB_STATUSES.ALLOCATED), 'With Technician')
    assert.deepEqual(JOB_STATUS_OPTIONS.map(({ value }) => value), [
        122830001, 122830000, 122830002, 122830003, 122830004,
    ])
    assert.equal(jobStatusIsVisible(JOB_STATUSES.UNCONFIRMED, [JOB_STATUSES.UNALLOCATED]), true)
    assert.equal(jobStatusIsVisible(JOB_STATUSES.UNCONFIRMED, [JOB_STATUSES.ALLOCATED]), false)
})

test('only confirmed dispatch can automatically move Staging to With Technician', () => {
    assert.equal(statusAfterLifecycleSignal(JOB_STATUSES.UNALLOCATED, 'mechanicSelected'), JOB_STATUSES.UNALLOCATED)
    assert.equal(statusAfterLifecycleSignal(JOB_STATUSES.UNALLOCATED, 'dispatchConfirmed'), JOB_STATUSES.ALLOCATED)
    for (const protectedStatus of [
        JOB_STATUSES.ALLOCATED,
        JOB_STATUSES.WAITING_FOR_PARTS,
        JOB_STATUSES.COMPLETION_REVIEW,
        JOB_STATUSES.COMPLETE,
    ]) assert.equal(statusAfterLifecycleSignal(protectedStatus, 'dispatchConfirmed'), protectedStatus)
    assert.equal(statusAfterLifecycleSignal(JOB_STATUSES.UNCONFIRMED, 'dispatchConfirmed'), JOB_STATUSES.ALLOCATED)
})

test('return automation changes only eligible With Technician Jobs', () => {
    assert.equal(statusAfterLifecycleSignal(JOB_STATUSES.ALLOCATED, 'allRequiredCardsReturned'), JOB_STATUSES.COMPLETION_REVIEW)
    assert.equal(statusAfterLifecycleSignal(JOB_STATUSES.ALLOCATED, 'finalTechnicianWithdrawal'), JOB_STATUSES.UNALLOCATED)
    for (const protectedStatus of [
        JOB_STATUSES.UNALLOCATED,
        JOB_STATUSES.WAITING_FOR_PARTS,
        JOB_STATUSES.COMPLETION_REVIEW,
        JOB_STATUSES.COMPLETE,
    ]) {
        assert.equal(statusAfterLifecycleSignal(protectedStatus, 'allRequiredCardsReturned'), protectedStatus)
        assert.equal(statusAfterLifecycleSignal(protectedStatus, 'finalTechnicianWithdrawal'), protectedStatus)
    }
    assert.equal(statusAfterLifecycleSignal(JOB_STATUSES.UNCONFIRMED, 'mechanicSelected'), JOB_STATUSES.UNALLOCATED)
})

test('card progress fails closed for incomplete or contradictory evidence', () => {
    const base = { evidenceComplete: true, expectedReturns: ['received'] as const }
    assert.equal(resolveJobCardProgress(base), 'readyForReview')
    assert.equal(resolveJobCardProgress({ ...base, evidenceComplete: false }), 'unknown')
    assert.equal(resolveJobCardProgress({ ...base, historyTruncated: true }), 'unknown')
    assert.equal(resolveJobCardProgress({ ...base, replacementConflict: true }), 'unknown')
    assert.equal(resolveJobCardProgress({ ...base, contradictory: true }), 'unknown')
    assert.equal(resolveJobCardProgress({ evidenceComplete: true }), 'unknown')
    assert.equal(resolveJobCardProgress({ evidenceComplete: true, expectedReturns: ['expired'] }), 'attentionRequired')
    assert.equal(resolveJobCardProgress({ evidenceComplete: true, expectedReturns: ['received', 'awaiting'] }), 'partiallyReturned')
    assert.equal(resolveJobCardProgress({ evidenceComplete: true, expectedReturns: ['awaiting'] }), 'awaiting')
    assert.equal(resolveJobCardProgress({ evidenceComplete: true, expectedReturns: ['notSent'] }), 'notSent')
})

test('personal watch is independent of shared Job status', () => {
    const current = { status: JOB_STATUSES.WAITING_FOR_PARTS, watched: false }
    assert.deepEqual(withPersonalWatch(current, true), { status: JOB_STATUSES.WAITING_FOR_PARTS, watched: true })
    assert.deepEqual(current, { status: JOB_STATUSES.WAITING_FOR_PARTS, watched: false })
})

test('Job Map obtains coordinator labels from the shared owner instead of defining a competing mapping', () => {
    const mapSource = readFileSync(new URL('../src/alpha/job-map/jobMap.ts', import.meta.url), 'utf8')
    const screenSource = readFileSync(new URL('../src/alpha/job-map/JobMapScreen.tsx', import.meta.url), 'utf8')
    assert.match(mapSource, /getJobStatusLabel/)
    assert.match(screenSource, /getJobStatusLabel/)
    assert.doesNotMatch(`${mapSource}\n${screenSource}`, /['"](?:Allocated|Unallocated)['"]/)
})
