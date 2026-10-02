const { EmailClient } = require('@azure/communication-email')

function reviewUrl(reviewId) {
    const origin = (process.env.APP_PUBLIC_URL || '').trim().replace(/\/$/, '')
    return origin ? `${origin}/job-card-reviews/${encodeURIComponent(reviewId)}` : ''
}

function recipients() {
    return (process.env.JOB_CARD_REVIEW_EMAIL_TO || '').split(',').map((value) => value.trim()).filter(Boolean)
}

async function sendReviewNotification(record) {
    const fallbackMode = process.env.NODE_ENV === 'test' || process.env.JOB_CARD_LOCAL_DEVELOPMENT === 'true' ? 'console' : 'acs'
    const mode = (process.env.JOB_CARD_NOTIFICATION_MODE || fallbackMode).trim().toLowerCase()
    if (mode === 'disabled' || mode === 'console') {
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
    const client = new EmailClient(connectionString)
    const poller = await client.beginSend({
        senderAddress,
        recipients: { to: to.map((address) => ({ address })) },
        content: {
            subject: `Job Card ${record.jobNumber} is ready for review`,
            plainText: `A technician submitted Job Card ${record.jobNumber}. Review it at ${url}`,
            html: `<p>A technician submitted Job Card <strong>${escapeHtml(record.jobNumber)}</strong>.</p><p><a href="${escapeHtml(url)}">Review the submission</a></p>`,
        },
    })
    const result = await poller.pollUntilDone()
    if (String(result.status).toLowerCase() !== 'succeeded') throw new Error('Job Card review email was not accepted.')
    return { status: 'sent', sentOn: new Date().toISOString() }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
}

module.exports = { sendReviewNotification, reviewUrl }
