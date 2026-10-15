const service = require('../services/timecloudJobService')

module.exports = async function timecloudJobs(context, request) {
    context.res = await service.sync(request)
}

module.exports._test = service._test
