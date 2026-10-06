const assert = require('node:assert/strict')
const test = require('node:test')
const {
    OFFICE_STATUSES, OFFICE_ACTIVITY_LIMIT, deriveOfficeStatus, officeProjection, applyOfficeTransition,
} = require('../api/services/jobCardOfficeReview')

const actor = { userId: '00000000-0000-4000-8000-000000000001', displayName: 'Nargiza Example', email: 'nargiza@liftrucks.co.nz' }
const evidence = () => ({
    tokenHash: 'private-token-hash', reviewId: 'review-1', sourceJobId: 'job-1', assignmentId: 'assignment-1',
    status: 'pendingReview', officeStatus: 'pending', officeActivitiesJson: '[]', etag: 'W/"1"',
    jobNumber: '146001', technicianName: 'Technician', customerName: 'Customer', siteName: 'Site',
    equipmentDisplayName: 'Forklift', submittedOn: '2026-10-01T00:00:00Z', story: 'Immutable story',
    hourMeter: 1234, timeEntriesJson: '[{"hours":1}]', partsJson: '[{"description":"Hose","quantity":1}]',
    furtherWorkRequired: true, furtherWorkDetails: 'Further evidence', safetyIssueIdentified: true,
    safetyIssueDetails: 'Safety evidence', photosJson: '[{"id":"photo-1","blobName":"private"}]',
})
const at = '2026-10-02T01:02:03.000Z'

test('new and legacy lifecycle rows derive distinct office states', () => {
    assert.equal(deriveOfficeStatus({ status: 'pendingReview' }), OFFICE_STATUSES.PENDING)
    assert.equal(deriveOfficeStatus({ status: 'reviewed' }), OFFICE_STATUSES.LEGACY_REVIEWED)
    assert.equal(officeProjection({ status: 'reviewed' }).isTerminal, true)
})

test('start review records the verified administrator and server timestamp without changing evidence', () => {
    const before = evidence()
    const updated = applyOfficeTransition(before, { action: 'startReview' }, actor, at)
    assert.equal(updated.officeStatus, OFFICE_STATUSES.IN_REVIEW)
    assert.equal(updated.status, 'pendingReview')
    assert.equal(updated.reviewStartedOn, at)
    assert.equal(updated.reviewStartedByEmail, actor.email)
    assert.equal(updated.officeActionByName, actor.displayName)
    for (const key of ['story', 'hourMeter', 'timeEntriesJson', 'partsJson', 'photosJson', 'technicianName', 'customerName', 'siteName']) assert.deepEqual(updated[key], before[key], key)
    assert.deepEqual(JSON.parse(updated.officeActivitiesJson)[0], {
        action: 'startReview', fromStatus: 'pending', toStatus: 'inReview', occurredOn: at, actor,
    })
})

test('clarification and hold require bounded notes', () => {
    for (const action of ['setNeedsClarification', 'setOnHold']) {
        assert.throws(() => applyOfficeTransition(evidence(), { action, note: '   ' }, actor, at), /required/i)
    }
    assert.throws(() => applyOfficeTransition(evidence(), { action: 'setOnHold', note: 'x'.repeat(2001) }, actor, at), /too long/i)
})

test('retired no-invoice action is rejected while existing outcomes remain immutable history', () => {
    const before = evidence()
    const snapshot = structuredClone(before)
    assert.throws(() => applyOfficeTransition(before, { action: 'completeNoInvoiceRequired', note: 'Warranty repair' }, actor, at), /Unknown review action/)
    assert.deepEqual(before, snapshot)
    const historical = { ...before, status: 'reviewed', officeStatus: 'noInvoiceRequired', officeNote: 'Previously recorded reason', outcomeOn: at, outcomeByUserId: actor.userId }
    const projection = officeProjection(historical)
    assert.equal(projection.officeStatus, OFFICE_STATUSES.NO_INVOICE_REQUIRED)
    assert.equal(projection.isTerminal, true)
    assert.equal(projection.officeNote, historical.officeNote)
    assert.equal(projection.outcomeBy.userId, actor.userId)
    assert.throws(() => applyOfficeTransition(historical, { action: 'completeGreenTreeProcessing' }, actor, at), /final office outcome/i)
})

test('GreenTree completion accepts optional reference and records one atomic terminal activity', () => {
    const updated = applyOfficeTransition(evidence(), { action: 'completeGreenTreeProcessing', note: 'Checked totals', greentreeReference: 'GT-146001' }, actor, at)
    assert.equal(updated.officeStatus, OFFICE_STATUSES.PROCESSED_IN_GREENTREE)
    assert.equal(updated.status, 'reviewed')
    assert.equal(updated.greentreeReference, 'GT-146001')
    assert.equal(updated.reviewedByUserId, actor.userId)
    assert.equal(updated.outcomeByUserId, actor.userId)
    assert.equal(updated.outcomeOn, at)
    assert.equal(JSON.parse(updated.officeActivitiesJson).length, 1)
})

test('terminal rows, unsupported transitions, actor spoofing and activity overflow fail closed', () => {
    assert.throws(() => applyOfficeTransition({ ...evidence(), status: 'reviewed', officeStatus: 'processedInGreenTree' }, { action: 'setOnHold', note: 'Wait' }, actor, at), /final office outcome/i)
    assert.throws(() => applyOfficeTransition({ ...evidence(), officeStatus: 'inReview' }, { action: 'startReview' }, actor, at), /pending review/i)
    assert.throws(() => applyOfficeTransition(evidence(), { action: 'setOnHold', note: 'Wait', actor: { email: 'spoofed@example.test' } }, actor, at), /unsupported fields/i)
    assert.throws(() => applyOfficeTransition({ ...evidence(), officeActivitiesJson: JSON.stringify(Array.from({ length: OFFICE_ACTIVITY_LIMIT }, () => ({}))) }, { action: 'setOnHold', note: 'Wait' }, actor, at), /activity limit/i)
})
