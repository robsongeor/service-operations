const service = require('../services/jobSubmissionService')

module.exports = async function jobCardReviews(context, request) {
    try {
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
