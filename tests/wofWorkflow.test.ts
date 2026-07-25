import assert from 'node:assert/strict'
import test from 'node:test'

import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'
import { JOB_TYPES } from '../src/alpha/jobs/types/jobType.types.ts'
import { getJobCompletionKind, runWofCompletion, validateWofCompletionExpiry } from '../src/alpha/jobs/completion/jobCompletion.ts'
import {
    addCalendarYearsDateOnly,
    defaultWofExpiryDate,
    newZealandDateOnly,
} from '../src/alpha/shared/dates/dateOnly.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'
import { WOF_RESULTS, type WofInspection } from '../src/alpha/wof/types/wof.types.ts'
import {
    formatWofDateOnly,
    getLatestWofInspection,
    getWofWorkflowStatus,
    verifyWofExpiryWithRetry,
    wofDatesMatch,
    wofNeedsAdministration,
} from '../src/alpha/wof/utils/wofRules.ts'

const equipment = {
    gr_equipmentid: 'equipment-1',
    gr_currentwofexpiry: '2026-07-01',
} as Equipment

function inspection(overrides: Partial<WofInspection> = {}): WofInspection {
    return {
        gr_wofinspectionid: 'inspection-1',
        createdon: '2026-07-24T00:00:00Z',
        linkedJobId: 'job-1',
        equipmentId: equipment.gr_equipmentid,
        gr_name: 'WOF',
        gr_wofresult: WOF_RESULTS.PLANNED,
        gr_Job: {
            gr_jobid: 'job-1',
            createdon: '2026-07-24T00:00:00Z',
            gr_jobnumber: 'WOF-1',
            gr_status: JOB_STATUSES.UNALLOCATED,
            gr_ordernumber: null,
            gr_description: 'WOF',
        },
        ...overrides,
    }
}

test('WOF workflow progresses from Job creation through scheduling and inspection completion', () => {
    const planned = inspection()
    assert.equal(getWofWorkflowStatus(equipment, planned, undefined), 'job-created')
    assert.equal(getWofWorkflowStatus(equipment, planned, {
        gr_jobscheduleoptionid: 'schedule-1',
        _gr_job_value: 'job-1',
        gr_scheduletype: 122830000,
        gr_scheduledate: '2026-07-25',
        gr_confirmed: true,
    }), 'scheduled')
    assert.equal(getWofWorkflowStatus(equipment, inspection({
        gr_Job: { ...planned.gr_Job!, gr_status: JOB_STATUSES.COMPLETE },
    }), undefined), 'inspection-complete')
})

test('a recorded result waits for expiry administration, then returns to monitoring', () => {
    const passed = inspection({
        gr_wofresult: WOF_RESULTS.PASSED,
        gr_inspectiondate: '2026-07-24',
        gr_newwofexpiry: '2027-07-01',
        gr_Job: { ...inspection().gr_Job!, gr_status: JOB_STATUSES.COMPLETE },
    })
    assert.equal(getWofWorkflowStatus(equipment, passed, undefined), 'ready-to-issue')
    assert.equal(getWofWorkflowStatus({ ...equipment, gr_currentwofexpiry: '2027-07-01' }, passed, undefined), 'current')
})

test('completed WOF with equivalent Dataverse expiry returns to Current', () => {
    const passed = inspection({
        gr_wofresult: WOF_RESULTS.PASSED,
        gr_inspectiondate: '2026-07-24T00:00:00Z',
        gr_newwofexpiry: '2027-07-01',
        gr_Job: { ...inspection().gr_Job!, gr_status: JOB_STATUSES.COMPLETE },
    })
    assert.equal(
        getWofWorkflowStatus({ ...equipment, gr_currentwofexpiry: '2027-07-01T00:00:00Z' }, passed, undefined),
        'current',
    )
})

test('Completion Review with fully administered inspection is Current', () => {
    const passed = inspection({
        gr_wofresult: WOF_RESULTS.PASSED,
        gr_inspectiondate: '2026-07-24',
        gr_newwofexpiry: '2027-07-01T00:00:00Z',
        gr_Job: { ...inspection().gr_Job!, gr_status: JOB_STATUSES.COMPLETION_REVIEW },
    })
    assert.equal(
        getWofWorkflowStatus({ ...equipment, gr_currentwofexpiry: '2027-07-01' }, passed, undefined),
        'current',
    )
})

test('completed inspection without a new expiry remains ready for administration', () => {
    const status = getWofWorkflowStatus(equipment, inspection({
        gr_wofresult: WOF_RESULTS.PASSED,
        gr_inspectiondate: '2026-07-24',
        gr_Job: { ...inspection().gr_Job!, gr_status: JOB_STATUSES.COMPLETE },
    }), undefined)
    assert.equal(status, 'ready-to-issue')
    assert.equal(wofNeedsAdministration(status), true)
})

test('expired WOF without a Job remains Expired', () => {
    assert.equal(getWofWorkflowStatus(equipment, undefined, undefined), 'expired')
})

test('fully administered WOF does not expose the expiry administration action', () => {
    assert.equal(wofNeedsAdministration('current'), false)
})

test('latest WOF inspection is selected by Dataverse created date', () => {
    const older = inspection({ gr_wofinspectionid: 'older', createdon: '2026-06-01T00:00:00Z' })
    const newer = inspection({ gr_wofinspectionid: 'newer', createdon: '2026-07-01T00:00:00Z' })
    assert.equal(getLatestWofInspection([older, newer], equipment.gr_equipmentid)?.gr_wofinspectionid, 'newer')
})

test('WOF completion requires a valid new expiry', () => {
    assert.equal(getJobCompletionKind(JOB_TYPES.WOF), 'wof')
    assert.equal(
        validateWofCompletionExpiry('', '2026-07-01', '2026-07-24T10:00:00Z'),
        'Enter the new WOF expiry before completing this Job.',
    )
    assert.equal(
        validateWofCompletionExpiry('2026-02-30', '2026-01-01', '2026-01-24T10:00:00Z'),
        'Enter a valid new WOF expiry.',
    )
})

test('WOF completion expiry must advance the current expiry and cover completion', () => {
    assert.equal(validateWofCompletionExpiry('2026-07-01', '2026-07-01', '2026-06-24T10:00:00Z'), '')
    assert.equal(
        validateWofCompletionExpiry('2026-06-30', '2026-07-01', '2026-06-24T10:00:00Z'),
        'The new WOF expiry must be later than the current expiry.',
    )
    assert.equal(
        validateWofCompletionExpiry('2026-07-23', '2026-06-01', '2026-07-24T10:00:00Z'),
        'The new WOF expiry cannot be before today (24/07/2026).',
    )
    assert.equal(validateWofCompletionExpiry('2027-07-24', '2026-07-01', '2026-07-24T10:00:00Z'), '')
})

test('WOF completion compares against the New Zealand local completion date', () => {
    assert.equal(newZealandDateOnly('2026-06-11T12:30:00Z'), '2026-06-12')
    assert.equal(validateWofCompletionExpiry('2026-06-12', '2026-06-01', '2026-06-11T12:30:00Z'), '')
    assert.equal(
        validateWofCompletionExpiry('2026-06-11', '2026-06-01', '2026-06-11T12:30:00Z'),
        'The new WOF expiry cannot be before today (12/06/2026).',
    )
    assert.equal(validateWofCompletionExpiry('2026-06-13', '2026-06-01', '2026-06-11T12:30:00Z'), '')
})

test('WOF completion uses Pacific Auckland daylight saving rather than a fixed offset', () => {
    assert.equal(newZealandDateOnly('2026-01-01T10:30:00Z'), '2026-01-01')
    assert.equal(newZealandDateOnly('2026-01-01T11:30:00Z'), '2026-01-02')
    assert.equal(validateWofCompletionExpiry('2026-01-02', '2025-12-01', '2026-01-01T11:30:00Z'), '')
})

test('WOF completion defaults to NZ today plus one calendar year', () => {
    assert.equal(defaultWofExpiryDate(new Date('2026-07-24T12:30:00Z')), '2027-07-25')
    assert.equal(defaultWofExpiryDate(new Date('2026-03-01T00:00:00Z')), '2027-03-01')
})

test('calendar-year addition clamps leap day safely', () => {
    assert.equal(addCalendarYearsDateOnly('2024-02-29', 1), '2025-02-28')
    assert.equal(addCalendarYearsDateOnly('2024-02-29', 4), '2028-02-29')
})

test('non-WOF completion kinds remain unchanged', () => {
    assert.equal(getJobCompletionKind(JOB_TYPES.SERVICE), 'service')
    assert.equal(getJobCompletionKind(JOB_TYPES.BREAKDOWN), 'standard')
})

test('WOF expiry is saved before the Job is completed', async () => {
    const operations: string[] = []
    await runWofCompletion(
        async () => { operations.push('expiry') },
        async () => { operations.push('job') },
    )
    assert.deepEqual(operations, ['expiry', 'job'])
})

test('failed WOF expiry update prevents Job completion', async () => {
    let completed = false
    await assert.rejects(() => runWofCompletion(
        async () => { throw new Error('expiry failed') },
        async () => { completed = true },
    ), /expiry failed/)
    assert.equal(completed, false)
})

test('WOF expiry comparison normalizes Dataverse and display date formats without timezone conversion', () => {
    assert.equal(wofDatesMatch('2027-07-25T00:00:00Z', '2027-07-25'), true)
    assert.equal(wofDatesMatch('25/07/2027', '2027-07-25T23:00:00-12:00'), true)
    assert.equal(formatWofDateOnly('2027-07-25T00:00:00Z'), '25/07/2027')
    assert.equal(wofDatesMatch('2027-07-24T23:00:00Z', '2027-07-25'), false)
})

test('WOF expiry verification retries a stale read and accepts the corrected value', async () => {
    let reads = 0
    await verifyWofExpiryWithRetry(async () => {
        reads += 1
        return reads === 1
            ? ['2026-07-25T00:00:00Z', '2026-07-25T00:00:00Z']
            : ['2027-07-25T00:00:00Z', '2027-07-25T00:00:00Z']
    }, '2027-07-25', 3, async () => undefined)
    assert.equal(reads, 2)
})

test('WOF expiry verification rejects a genuinely different saved date', async () => {
    await assert.rejects(
        () => verifyWofExpiryWithRetry(
            async () => ['2027-07-24T00:00:00Z', '2027-07-24T00:00:00Z'],
            '2027-07-25',
            2,
            async () => undefined,
        ),
        /did not confirm/,
    )
})
