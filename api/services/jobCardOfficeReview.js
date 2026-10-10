const { prepareMeterApproval } = require('./jobCardMeterApproval')
const OFFICE_STATUSES = Object.freeze({
    PENDING: 'pending',
    IN_REVIEW: 'inReview',
    NEEDS_CLARIFICATION: 'needsClarification',
    ON_HOLD: 'onHold',
    PROCESSED_IN_GREENTREE: 'processedInGreenTree',
    NO_INVOICE_REQUIRED: 'noInvoiceRequired', // Historical records only; no new transition.
    LEGACY_REVIEWED: 'legacyReviewed',
})

const ACTIVE_OFFICE_STATUSES = new Set([
    OFFICE_STATUSES.PENDING,
    OFFICE_STATUSES.IN_REVIEW,
    OFFICE_STATUSES.NEEDS_CLARIFICATION,
    OFFICE_STATUSES.ON_HOLD,
])
const TERMINAL_OFFICE_STATUSES = new Set([
    OFFICE_STATUSES.PROCESSED_IN_GREENTREE,
    OFFICE_STATUSES.NO_INVOICE_REQUIRED,
    OFFICE_STATUSES.LEGACY_REVIEWED,
])
const TRANSITIONS = Object.freeze({
    startReview: OFFICE_STATUSES.IN_REVIEW,
    resumeReview: OFFICE_STATUSES.IN_REVIEW,
    setNeedsClarification: OFFICE_STATUSES.NEEDS_CLARIFICATION,
    setOnHold: OFFICE_STATUSES.ON_HOLD,
    completeGreenTreeProcessing: OFFICE_STATUSES.PROCESSED_IN_GREENTREE,
})
const NOTE_REQUIRED_ACTIONS = new Set(['setNeedsClarification', 'setOnHold', 'recordCorrection'])
const OFFICE_NOTE_MAX_LENGTH = 2000
const GREENTREE_REFERENCE_MAX_LENGTH = 200
const OFFICE_ACTIVITY_LIMIT = 100
const OFFICE_ACTIVITY_JSON_MAX_LENGTH = 30000

function plainText(value, maximumLength, label, required = false) {
    if (value == null) value = ''
    if (typeof value !== 'string') throw reviewError(400, `${label} is invalid.`)
    const normalized = value.replace(/\r\n?/g, '\n').trim()
    if (required && !normalized) throw reviewError(400, `${label} is required.`)
    if (normalized.length > maximumLength) throw reviewError(400, `${label} is too long.`)
    if (/[^\P{C}\n\t]/u.test(normalized)) throw reviewError(400, `${label} contains unsupported characters.`)
    return normalized
}

function reviewError(statusCode, message, code = 'invalid') {
    const error = new Error(message)
    error.statusCode = statusCode
    error.code = code
    return error
}

function safeActivities(record) {
    if (!record.officeActivitiesJson) return []
    try {
        const value = JSON.parse(record.officeActivitiesJson)
        return Array.isArray(value) ? value : []
    } catch { return [] }
}

function deriveOfficeStatus(record) {
    if (Object.values(OFFICE_STATUSES).includes(record.officeStatus)) return record.officeStatus
    return record.status === 'reviewed' ? OFFICE_STATUSES.LEGACY_REVIEWED : OFFICE_STATUSES.PENDING
}

function safeActor(actor) {
    if (!actor || typeof actor.userId !== 'string' || !actor.userId.trim()) throw reviewError(403, 'Job Card reviewer access is required.', 'forbidden')
    return {
        userId: actor.userId.trim().slice(0, 100),
        displayName: plainText(actor.displayName || actor.email || 'Office administrator', 500, 'Administrator name'),
        email: plainText(String(actor.email || '').toLowerCase(), 500, 'Administrator email'),
    }
}

function actorFromFields(record, prefix) {
    const userId = record[`${prefix}UserId`]
    if (!userId) return undefined
    return {
        userId,
        displayName: record[`${prefix}Name`] || 'Office administrator',
        email: record[`${prefix}Email`] || undefined,
    }
}

function officeProjection(record) {
    const officeStatus = deriveOfficeStatus(record)
    return {
        officeStatus,
        officeNote: record.officeNote || undefined,
        greentreeReference: record.greentreeReference || undefined,
        reviewStartedOn: record.reviewStartedOn || undefined,
        reviewStartedBy: actorFromFields(record, 'reviewStartedBy'),
        officeActionOn: record.officeActionOn || undefined,
        officeActionBy: actorFromFields(record, 'officeActionBy'),
        outcomeOn: record.outcomeOn || undefined,
        outcomeBy: actorFromFields(record, 'outcomeBy'),
        officeActivities: safeActivities(record),
        officeCorrections: safeActivities(record).filter((activity) => activity.action === 'recordCorrection'),
        isTerminal: TERMINAL_OFFICE_STATUSES.has(officeStatus),
    }
}

function applyOfficeTransition(record, payload, actorValue, occurredOn = new Date().toISOString()) {
    const action = payload?.action
    const nextStatus = action === 'recordCorrection' ? deriveOfficeStatus(record) : TRANSITIONS[action]
    if (!nextStatus) throw reviewError(400, 'Unknown review action.')
    const allowedKeys = new Set(['action', 'etag', 'note', 'greentreeReference', 'meterApproval'])
    if (Object.keys(payload || {}).some((key) => !allowedKeys.has(key))) throw reviewError(400, 'The review action contains unsupported fields.')
    const currentStatus = deriveOfficeStatus(record)
    if (TERMINAL_OFFICE_STATUSES.has(currentStatus) && action !== 'recordCorrection') throw reviewError(409, 'This review already has a final office outcome.', 'terminal')
    if (!ACTIVE_OFFICE_STATUSES.has(currentStatus) && !TERMINAL_OFFICE_STATUSES.has(currentStatus)) throw reviewError(409, 'The current review state is invalid.', 'conflict')
    if (action === 'startReview' && currentStatus !== OFFICE_STATUSES.PENDING) throw reviewError(409, 'Only a pending review can be started.', 'conflict')
    if (action === 'resumeReview' && ![OFFICE_STATUSES.NEEDS_CLARIFICATION, OFFICE_STATUSES.ON_HOLD].includes(currentStatus)) throw reviewError(409, 'Only a card awaiting follow-up can be resumed.', 'conflict')

    const note = plainText(payload.note, OFFICE_NOTE_MAX_LENGTH, 'Office note', NOTE_REQUIRED_ACTIONS.has(action))
    const greentreeReference = plainText(payload.greentreeReference, GREENTREE_REFERENCE_MAX_LENGTH, 'GreenTree reference')
    if (action !== 'completeGreenTreeProcessing' && greentreeReference) throw reviewError(400, 'A GreenTree reference is only valid for GreenTree processing.')
    const actor = safeActor(actorValue)
    if (action !== 'completeGreenTreeProcessing' && payload.meterApproval != null) throw reviewError(400, 'Meter approval is only valid when completing office processing.')
    const meterFields = action === 'completeGreenTreeProcessing' ? prepareMeterApproval(record, payload.meterApproval, actor, occurredOn) : {}
    const activities = safeActivities(record)
    if (activities.length >= OFFICE_ACTIVITY_LIMIT) throw reviewError(409, 'The office activity limit has been reached.', 'activity-limit')
    const activity = {
        action,
        fromStatus: currentStatus,
        toStatus: nextStatus,
        occurredOn,
        actor,
        ...(note ? { note } : {}),
        ...(greentreeReference ? { greentreeReference } : {}),
    }
    const officeActivitiesJson = JSON.stringify([...activities, activity])
    if (officeActivitiesJson.length > OFFICE_ACTIVITY_JSON_MAX_LENGTH) throw reviewError(409, 'The office activity history is too large.', 'activity-limit')
    const terminal = TERMINAL_OFFICE_STATUSES.has(nextStatus)
    const actorFields = (prefix) => ({
        [`${prefix}UserId`]: actor.userId,
        [`${prefix}Name`]: actor.displayName,
        [`${prefix}Email`]: actor.email,
    })
    if (action === 'recordCorrection') return { ...record, officeActivitiesJson, officeActionOn: occurredOn, ...actorFields('officeActionBy') }
    return {
        ...record,
        ...meterFields,
        officeStatus: nextStatus,
        officeNote: note,
        greentreeReference: action === 'completeGreenTreeProcessing' ? greentreeReference : '',
        officeActionOn: occurredOn,
        ...actorFields('officeActionBy'),
        ...(action === 'startReview' && !record.reviewStartedOn ? { reviewStartedOn: occurredOn, ...actorFields('reviewStartedBy') } : {}),
        ...(terminal ? {
            status: 'reviewed', outcomeOn: occurredOn, ...actorFields('outcomeBy'),
            reviewedOn: occurredOn, reviewedByUserId: actor.userId,
        } : { status: 'pendingReview' }),
        officeActivitiesJson,
    }
}

module.exports = {
    OFFICE_STATUSES, ACTIVE_OFFICE_STATUSES, TERMINAL_OFFICE_STATUSES, TRANSITIONS,
    OFFICE_NOTE_MAX_LENGTH, GREENTREE_REFERENCE_MAX_LENGTH, OFFICE_ACTIVITY_LIMIT,
    deriveOfficeStatus, officeProjection, applyOfficeTransition, reviewError,
}
