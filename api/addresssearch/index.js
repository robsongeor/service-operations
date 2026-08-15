const service = require('../services/equipmentGeocodingService')

module.exports = async function addressSearch(context, request) {
    context.res = await service.searchAddresses(request)
}
