const service = require('../services/serviceCoordinationService')

module.exports = async function serviceCoordination(context, request) {
    context.res = await service.handleServiceCoordination(request)
}

module.exports._test = service._test
