import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_REVIEW_QUEUE_VIEW, REVIEW_STAGE_TABS, filterAndSortReviews, formatReviewDate, formatReviewTime, readReviewQueueView, readReviewStage, reviewFilterOptions, reviewQueueParams, queueItemId, queueItemDate, type ReviewQueueView } from '../src/alpha/job-card-reviews/jobCardReviewQueueModel.ts'
import type { JobCardReviewSummary, JobCardOpenJobSummary } from '../src/alpha/job-card-reviews/jobCardReview.types.ts'

const fixture = (overrides: Partial<JobCardReviewSummary> = {}): JobCardReviewSummary => ({
    reviewId: 'r1', jobNumber: '100', jobType: 122830001, customerName: 'Example Customer', siteName: 'North warehouse',
    technicianName: 'Alex', workRequired: 'Repair hydraulic hose', equipmentDisplayName: 'Still RX60', equipmentSerial: 'SER-12', fleetNumber: 'FN24',
    submittedOn: '2026-10-01T23:00:00Z', photoCount: 2, safetyIssueIdentified: false, furtherWorkRequired: false,
    officeStatus: 'pending', officeActivities: [], isTerminal: false, ...overrides,
})
const items = [fixture(), fixture({ reviewId: 'r2', jobNumber: '9', technicianName: 'Taylor', safetyIssueIdentified: true, submittedOn: '2026-10-02T01:00:00Z', photoCount: 4 }),
    fixture({ reviewId: 'r3', jobNumber: '20', jobType: 122830000, customerName: 'Other Customer', technicianName: undefined, furtherWorkRequired: true, submittedOn: '2026-09-01T01:00:00Z', photoCount: 0 })]
const view = (patch: Partial<ReviewQueueView> = {}): ReviewQueueView => ({ ...DEFAULT_REVIEW_QUEUE_VIEW, ...patch })
const ids = (patch: Partial<ReviewQueueView> = {}) => filterAndSortReviews(items, view(patch)).map((item) => item.reviewId)

test('queue defaults newest first and never mutates source rows', () => {
    assert.deepEqual(ids(), ['r2', 'r1', 'r3'])
    assert.deepEqual(items.map((item) => item.reviewId), ['r1', 'r2', 'r3'])
})

test('workflow stage links default to Submitted and preserve historical bookmarks', () => {
    assert.deepEqual(REVIEW_STAGE_TABS.map((tab) => tab.label), ['Open jobs', 'Submitted', 'Review', 'Completed'])
    for (const stage of ['open', 'submitted', 'review', 'completed']) assert.equal(readReviewStage(new URLSearchParams({ view: stage })), stage)
    for (const stage of ['', 'active', 'invalid']) assert.equal(readReviewStage(new URLSearchParams({ view: stage })), 'submitted')
    assert.equal(readReviewStage(new URLSearchParams('view=history')), 'completed')
})

test('Open job filtering uses dispatch identity and send date without inventing a submission', () => {
    const { reviewId, submittedOn, officeStatus, ...base } = fixture()
    void reviewId; void submittedOn; void officeStatus
    const open: JobCardOpenJobSummary = { ...base, dispatchId: 'd1', sourceJobId: 'job-1', sentOn: '2026-10-03T01:00:00Z' }
    assert.equal(queueItemId(open), 'd1')
    assert.equal(queueItemDate(open), open.sentOn)
    assert.equal(queueItemId(items[0]), 'r1')
    assert.deepEqual(filterAndSortReviews([open, ...items], view()).map(queueItemId), ['d1', 'r2', 'r1', 'r3'])
    assert.deepEqual(filterAndSortReviews([open], view({ search: '03/10/2026' })), [open])
    assert.deepEqual(filterAndSortReviews([open], view({ search: 'Awaiting submission' })), [open])
})
test('queue filters combine and reported flags have distinct meanings', () => {
    assert.deepEqual(ids({ attention: 'required' }), ['r2', 'r3'])
    assert.deepEqual(ids({ attention: 'safety' }), ['r2'])
    assert.deepEqual(ids({ attention: 'further' }), ['r3'])
    assert.deepEqual(ids({ attention: 'none' }), ['r1'])
    assert.deepEqual(ids({ jobType: 122830001, customer: 'Example Customer', technician: 'Taylor', attention: 'safety', search: 'hose' }), ['r2'])
    assert.deepEqual(ids({ jobType: 122830000, technician: 'Taylor' }), [])
})
test('search covers saved Job, customer/site, equipment, technician, type and NZ submission date', () => {
    for (const search of ['100', 'STILL rx60', 'ser-12', 'fn24', 'hydraulic', 'North warehouse', 'Example Customer', 'Alex', 'Service', '02/10/2026']) {
        assert.ok(ids({ search }).includes('r1'), search)
    }
    assert.deepEqual(ids({ search: 'does not exist' }), [])
    assert.deepEqual(ids({ search: '  ' }), ids())
    assert.equal(formatReviewDate('2026-10-01T23:00:00Z'), '02/10/2026')
    assert.equal(formatReviewDate('bad'), 'Not recorded')
    assert.equal(formatReviewTime('bad'), '')
})
test('numeric Job and photo sorts are reversible; missing names sort last', () => {
    assert.deepEqual(ids({ sort: { column: 'job', direction: 'ascending' } }), ['r2', 'r3', 'r1'])
    assert.deepEqual(ids({ sort: { column: 'job', direction: 'descending' } }), ['r1', 'r3', 'r2'])
    assert.deepEqual(ids({ sort: { column: 'photos', direction: 'descending' } }), ['r2', 'r1', 'r3'])
    assert.deepEqual(ids({ sort: { column: 'technician', direction: 'descending' } }), ['r2', 'r1', 'r3'])
})
test('query state round-trips all filters and sort; invalid and unsupported types reset safely', () => {
    assert.equal(reviewQueueParams(view()).size, 0)
    const state = view({ search: 'hose & lift', customer: 'Example Customer', technician: 'Alex', jobType: 122830001, attention: 'none', sort: { column: 'job', direction: 'ascending' } })
    assert.deepEqual(readReviewQueueView(reviewQueueParams(state)), state)
    for (const type of ['bad', '0', '122830004']) assert.deepEqual(readReviewQueueView(new URLSearchParams(`type=${type}&sort=bad&direction=bad&attention=bad`)), view())
})
test('older snapshots retain graceful All-jobs visibility and selector choices survive refresh', () => {
    const old = fixture({ jobType: undefined, workRequired: undefined, equipmentDisplayName: undefined, customerName: undefined })
    assert.equal(filterAndSortReviews([old], view()).length, 1)
    assert.equal(filterAndSortReviews([old], view({ jobType: 122830001 })).length, 0)
    assert.deepEqual(reviewFilterOptions(items, 'technicianName', 'Previous technician'), [
        { value: 'Alex', label: 'Alex' }, { value: 'Previous technician', label: 'Previous technician' }, { value: 'Taylor', label: 'Taylor' },
    ])
})
