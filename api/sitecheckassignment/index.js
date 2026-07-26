const service = require('../services/siteCheckAssignmentService')

module.exports = async function siteCheckAssignment(context, request) {
    try {
        if (request.method === 'GET') {
            context.res = await service.handlePublicGet(request)
        } else if (request.method === 'POST' && request.body?.action === 'generate') {
            context.res = await service.generate(request)
        } else if (request.method === 'POST' && request.body?.action === 'revoke') {
            context.res = await service.revoke(request)
        } else if (request.method === 'POST' && request.body?.action === 'submitJob') {
            context.res = await service.submitJob(request)
        } else {
            context.res = service.jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' })
        }
    } catch (error) {
        context.log?.error('Site Check assignment request failed.', error)
        context.res = service.jsonResponse(503, {
            code: 'temporary',
            error: 'The Site Check assignment service is temporarily unavailable.',
        })
    }
}

module.exports._test = service.test
