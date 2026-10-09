const service = require('../services/mapTileService')

module.exports = async function mapTile(context, request) {
    context.res = await service.getTile({
        method: request.method,
        params: {
            z: String(context.bindingData?.z ?? ''),
            x: String(context.bindingData?.x ?? ''),
            y: String(context.bindingData?.y ?? ''),
        },
    })
}

module.exports._test = service.test
