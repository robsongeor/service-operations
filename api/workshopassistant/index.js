const service = require('../services/workshopAssistantService')

module.exports = async function workshopAssistant(context, request) {
    context.res = await service.handleWorkshopAssistant(request)
}

module.exports._test = service._test
