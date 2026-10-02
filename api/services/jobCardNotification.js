const { EmailClient } = require('@azure/communication-email')
const { isHosted, isLocalDevelopment } = require('./jobCardEnvironment')

function reviewUrl(reviewId) {
    try {
        const url = new URL(process.env.APP_PUBLIC_URL || '')
        if (url.protocol !== 'https:' || url.username || url.password) return ''
        return `${url.origin}/job-card-reviews/${encodeURIComponent(reviewId)}`
    } catch { return '' }
}

function recipients() {
    return (process.env.JOB_CARD_REVIEW_EMAIL_TO || '').split(',').map((value) => value.trim()).filter(Boolean)
}

async function sendReviewNotification(record) {
    const fallbackMode = !isHosted() && (process.env.NODE_ENV === 'test' || isLocalDevelopment()) ? 'console' : 'acs'
    const mode = (process.env.JOB_CARD_NOTIFICATION_MODE || fallbackMode).trim().toLowerCase()
    if (mode === 'disabled' || mode === 'console') {
        if (mode === 'console' && isHosted()) throw new Error('Console notifications are forbidden in production.')
        return { status: mode === 'disabled' ? 'disabled' : 'local', sentOn: null }
    }
    if (mode !== 'acs') throw new Error('The Job Card notification mode is invalid.')
    const connectionString = (process.env.ACS_EMAIL_CONNECTION_STRING || '').trim()
    const senderAddress = (process.env.ACS_EMAIL_SENDER || '').trim()
    const to = recipients()
    const url = reviewUrl(record.reviewId)
    if (!connectionString || !senderAddress || to.length === 0 || !url) {
        throw new Error('Job Card review email is not configured.')
    }
    if (to.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Invalid notification recipient.')
    const client = new EmailClient(connectionString, { retryOptions: { maxRetries: 1 } })
    const abortSignal = AbortSignal.timeout(20000)
    const poller = await client.beginSend({
        senderAddress,
        recipients: { to: to.map((address) => ({ address })) },
        content: {
            subject: `Job Card ${record.jobNumber} is ready for review`,
            plainText: `A technician submitted Job Card ${record.jobNumber}. Review it at ${url}`,
            html: `<p>A technician submitted Job Card <strong>${escapeHtml(record.jobNumber)}</strong>.</p><p><a href="${escapeHtml(url)}">Review the submission</a></p>`,
        },
    }, { abortSignal, updateIntervalInMs: 1000, operationId: record.reviewId })
    const result = await poller.pollUntilDone({ abortSignal })
    if (String(result.status).toLowerCase() !== 'succeeded') throw new Error('Job Card review email was not accepted.')
    return { status: 'sent', sentOn: new Date().toISOString() }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
}

module.exports = { sendReviewNotification, reviewUrl }
