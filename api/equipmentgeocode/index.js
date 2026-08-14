const service = require('../services/equipmentGeocodingService')

module.exports = async function equipmentGeocode(context, request) {
    context.res = await service.geocode(request)
}

module.exports._test = service.test
