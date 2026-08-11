const service = require('../services/chargeableInvoicePreviewService')

module.exports = async function chargeableInvoicePreview(context, request) {
    try {
        context.res = await service.preview(request)
    } catch (error) {
        context.log?.error('Chargeable Invoice preview failed.', error)
        context.res = service.jsonResponse(503, { error: 'Invoice preview is temporarily unavailable.' })
    }
}

module.exports._test = service.test
