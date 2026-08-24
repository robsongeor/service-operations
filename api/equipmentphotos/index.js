const equipmentPhotoService = require('../services/equipmentPhotoService')

module.exports = async function equipmentPhotos(context, request) {
    if (request.method === 'GET') {
        context.res = await equipmentPhotoService.searchJobs(request)
        return
    }
    if (request.method === 'POST') {
        context.res = await equipmentPhotoService.upload(request)
        return
    }
    context.res = equipmentPhotoService.jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' })
}
