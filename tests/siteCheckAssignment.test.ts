import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { buildSiteCheckAssignmentMailto } from '../src/alpha/site-checks/services/siteCheckAssignmentApi.ts'

const require = createRequire(import.meta.url)
const service = require('../api/services/siteCheckAssignmentService.js')
const {
    generateToken,
    hashToken,
    publicProjection,
    validateDispatch,
    validateChecklistSubmission,
    checklistSubmissionBatch,
} = service.test

const technicianId = '11111111-1111-1111-1111-111111111111'
const occurrence = (overrides = {}) => ({
    gr_sitecheckid: '22222222-2222-2222-2222-222222222222',
    gr_name: 'Weekly checks for 20 July 2026',
    gr_status: 122830000,
    gr_expectedjobcount: 2,
    _gr_assignedtechnician_value: technicianId,
    gr_AssignedTechnician: {
        gr_mechanicid: technicianId,
        gr_name: 'George R',
        gr_email: 'george@example.com',
        statecode: 0,
    },
    gr_Site: { gr_name: 'Airport', gr_Customer: { gr_name: 'Air New Zealand' } },
    ...overrides,
})
const jobs = (overrides = {}) => [
    {
        gr_jobid: 'job-1',
        gr_jobnumber: '145410',
        _gr_mechanic_value: technicianId,
        gr_Equipment: { gr_equipmentid: 'equipment-1', gr_fleet: 'FN2219', gr_model: 'RX60' },
        ...overrides,
    },
    {
        gr_jobid: 'job-2',
        gr_jobnumber: '145411',
        _gr_mechanic_value: technicianId,
        gr_Equipment: { gr_equipmentid: 'equipment-2', gr_fleet: 'FN2220', gr_model: 'RX60' },
    },
]

test('generates opaque tokens and stable SHA-256 hashes', () => {
    const token = generateToken()
    assert.match(token, /^[A-Za-z0-9_-]{40,100}$/)
    assert.equal(hashToken(token), hashToken(token))
    assert.match(hashToken(token), /^[a-f0-9]{64}$/)
})

test('accepts an intact in-progress assignment with numbered Jobs', () => {
    assert.equal(validateDispatch(occurrence(), jobs()), '')
})

test('blocks missing Job numbers and mismatched technicians', () => {
    assert.match(validateDispatch(occurrence(), jobs({ gr_jobnumber: null })), /numeric Job Number/)
    assert.match(validateDispatch(
        occurrence(),
        jobs({ _gr_mechanic_value: '33333333-3333-3333-3333-333333333333' }),
    ), /assigned to the Site Check technician/)
})

test('blocks inactive technicians and generated Job integrity mismatches', () => {
    assert.match(validateDispatch(occurrence({
        gr_AssignedTechnician: {
            gr_mechanicid: technicianId,
            gr_name: 'George R',
            gr_email: 'george@example.com',
            statecode: 1,
        },
    }), jobs()), /active technician/)
    assert.match(validateDispatch(occurrence({ gr_expectedjobcount: 3 }), jobs()), /integrity/)
})

test('public projection excludes Jobs reassigned away from the occurrence technician', () => {
    const projection = publicProjection(occurrence(), [
        ...jobs(),
        {
            gr_jobid: 'job-3',
            gr_jobnumber: '145412',
            _gr_mechanic_value: '33333333-3333-3333-3333-333333333333',
        },
    ], [{
        gr_sitecheckchecklistsnapshotitemid: 'snapshot-1',
        _gr_job_value: 'job-1',
        gr_itemkey: 'visual.damage',
        gr_groupname: 'Visual',
        gr_prompt: 'Check for damage.',
        gr_responsetype: 122830000,
        gr_displayorder: 10,
        gr_required: true,
        gr_commentrequiredonnegative: true,
        gr_photorequiredonnegative: false,
    }, {
        gr_sitecheckchecklistsnapshotitemid: 'snapshot-hidden',
        _gr_job_value: 'job-3',
        gr_itemkey: 'hidden',
        gr_groupname: 'Visual',
        gr_prompt: 'Must not leak.',
        gr_responsetype: 122830000,
        gr_displayorder: 20,
        gr_required: true,
    }])
    assert.equal(projection.jobs.length, 2)
    assert.deepEqual(projection.jobs.map((job: { jobNumber: string }) => job.jobNumber), ['145410', '145411'])
    assert.equal(projection.customerName, 'Air New Zealand')
    assert.equal(projection.jobs[0].checklist.length, 1)
    assert.equal(projection.jobs[0].checklist[0].itemKey, 'visual.damage')
    assert.equal(projection.jobs[1].checklist.length, 0)
})

test('builds the approved Jobs-table-style mailto handoff', () => {
    const mailto = buildSiteCheckAssignmentMailto({
        recipientEmail: 'george@example.com',
        recipientName: 'George R',
        customerName: 'Air New Zealand',
        siteName: 'Auckland Airport',
        frequencyLabel: 'Weekly',
        dueDate: '2026-07-27',
        jobCount: 17,
        assignmentUrl: 'http://localhost:5173/portal/site-check/token',
    })
    assert.match(mailto, /^mailto:george%40example\.com\?/)
    assert.match(decodeURIComponent(mailto), /Weekly Site Check - Air New Zealand - Auckland Airport/)
    assert.match(decodeURIComponent(mailto), /Equipment Jobs: 17/)
    assert.match(decodeURIComponent(mailto), /http:\/\/localhost:5173\/portal\/site-check\/token/)
})

test('validates required checklist answers, failure comments, and numeric meter readings', () => {
    const job = { gr_jobid: '22222222-2222-2222-2222-222222222222', gr_jobcardstatus: 122830000 }
    const snapshots = [{
        gr_sitecheckchecklistsnapshotitemid: '33333333-3333-3333-3333-333333333333',
        gr_responsetype: 122830000,
        gr_commentrequiredonnegative: true,
    }, {
        gr_sitecheckchecklistsnapshotitemid: '44444444-4444-4444-4444-444444444444',
        gr_responsetype: 122830002,
    }]
    const submission = {
        story: 'Completed checks.',
        timeEntries: [],
        parts: [],
        photos: [],
        responses: [{
            snapshotItemId: snapshots[0].gr_sitecheckchecklistsnapshotitemid,
            choiceAnswer: 122830001,
            comment: '',
        }, {
            snapshotItemId: snapshots[1].gr_sitecheckchecklistsnapshotitemid,
            numericAnswer: 1234,
        }],
    }
    assert.match(validateChecklistSubmission(job, snapshots, submission), /comment/)
    submission.responses[0].comment = 'Fork damage found.'
    assert.equal(validateChecklistSubmission(job, snapshots, submission), '')
    submission.photos = [{
        fileName: 'damage.exe',
        mimeType: 'application/octet-stream',
        size: 1,
        data: 'AA==',
    }]
    assert.match(validateChecklistSubmission(job, snapshots, submission), /photos are invalid/)
})

test('builds one atomic response and Job Card Status transaction without operational completion', () => {
    const job = {
        gr_jobid: '22222222-2222-2222-2222-222222222222',
        gr_jobnumber: '145410',
        '@odata.etag': 'W/"4"',
    }
    const snapshots = [{
        gr_sitecheckchecklistsnapshotitemid: '33333333-3333-3333-3333-333333333333',
        gr_itemkey: 'visual.damage',
    }]
    const batch = checklistSubmissionBatch(job, snapshots, [{
        snapshotItemId: snapshots[0].gr_sitecheckchecklistsnapshotitemid,
        choiceAnswer: 122830000,
    }], technicianId, 'Completed checks.', '2026-07-26T04:00:00.000Z', [{
        date: '2026-07-26',
        hours: 1.5,
        kilometres: 12,
    }], ['Cable tie'])
    assert.equal(batch.operationCount, 4)
    assert.match(batch.payload, /POST gr_sitecheckchecklistresponses/)
    assert.match(batch.payload, /POST gr_jobcardsubmissiontimeentries/)
    assert.match(batch.payload, /POST gr_jobmaterials/)
    assert.match(batch.payload, /PATCH gr_jobs/)
    assert.match(batch.payload, /"gr_jobcardstatus":122830002/)
    assert.doesNotMatch(batch.payload, /"gr_status"/)
    assert.match(batch.payload, /If-Match: W\/"4"/)
})
