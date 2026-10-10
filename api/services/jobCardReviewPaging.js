const { deriveOfficeStatus } = require('./jobCardOfficeReview')
function statusForView(view) { return ['completed', 'history'].includes(view) ? 'reviewed' : 'pendingReview' }
function matchesView(record, view) {
    const status = deriveOfficeStatus(record)
    return view === 'submitted' ? status === 'pending' : view === 'review' ? ['inReview', 'needsClarification', 'onHold'].includes(status) : true
}
function decodeCursor(value, view, jobNumber) {
    if (!value) return undefined
    try {
        if (typeof value !== 'string' || value.length > 8192) throw new Error()
        const decoded = JSON.parse(Buffer.from(value, 'base64url').toString())
        if (decoded.version !== 1 || decoded.view !== view || decoded.jobNumber !== jobNumber || typeof decoded.next !== 'string' || !decoded.next || decoded.next.length > 6000) throw new Error()
        return decoded.next
    } catch {
        const error = new Error('The queue cursor is invalid or belongs to another search. Refresh the queue.')
        error.statusCode = 400
        throw error
    }
}
async function reviewPage(store, { view, limit, cursor, jobNumber = '' }) {
    const next = decodeCursor(cursor, view, jobNumber)
    const page = await store.listReviewPage(statusForView(view), limit, next, jobNumber)
    return { records: page.records.filter((record) => matchesView(record, view)), nextCursor: page.next ? Buffer.from(JSON.stringify({ version: 1, view, jobNumber, next: page.next })).toString('base64url') : undefined }
}
module.exports = { reviewPage }
