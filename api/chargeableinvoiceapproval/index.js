const service = require('../services/chargeableInvoiceApprovalService')

module.exports = async function chargeableInvoiceApproval(context, request) {
    try {
        context.res = await service.generate(request)
    } catch (error) {
        context.log?.error('Chargeable Invoice approval PDF failed.', error)
        context.res = {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ error: 'Approval PDF generation is temporarily unavailable.' }),
        }
    }
}

module.exports._test = service.test
