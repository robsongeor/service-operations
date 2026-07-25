const jobSubmissionService = require('../services/jobSubmissionService')

module.exports = async function jobSubmission(context, request) {
    try {
        if (request.method === 'GET') {
            context.res = await jobSubmissionService.handlePublicGet(request)
        } else if (request.method === 'POST' && request.body?.action === 'generate') {
            context.res = await jobSubmissionService.generate(request)
        } else if (request.method === 'POST') {
            context.res = await jobSubmissionService.handlePublicPost(request)
        } else {
            context.res = jobSubmissionService.jsonResponse(
                405,
                { error: 'Method not allowed.' },
                { Allow: 'GET, POST' },
            )
        }
    } catch (error) {
        context.log?.error('Job submission request failed.', error)
        context.res = jobSubmissionService.jsonResponse(503, {
            code: 'temporary',
            error: 'The job card service is temporarily unavailable.',
        })
    }
}

module.exports._test = jobSubmissionService.test
