const service = require('../services/jobSubmissionService')
const { proxyJobCardReviews, usesSharedBackend } = require('../services/jobCardReviewsProxy')

module.exports = async function jobCardReviews(context, request) {
    try {
        if (usesSharedBackend(request)) {
            context.res = await proxyJobCardReviews(request)
            return
        }
        context.res = await service.handleReviewRequest({
            ...request,
            query: {
                ...request.query,
                reviewId: request.params?.reviewId || request.query?.reviewId,
                photoId: request.params?.photoId || request.query?.photoId,
            },
        })
    } catch {
        context.log?.error('Job Card review request failed.')
        context.res = service.jsonResponse(503, { error: 'The Job Card review service is temporarily unavailable.' })
    }
}
