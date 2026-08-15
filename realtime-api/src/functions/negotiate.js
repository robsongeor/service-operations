const { app, input } = require('@azure/functions')
const legacyHandler = require('../../negotiate')

const connectionInfoInput = input.generic({
    type: 'signalRConnectionInfo',
    name: 'connectionInfo',
    hubName: 'equipment',
    connectionStringSetting: 'AzureSignalRConnectionString',
})

function headersObject(headers) {
    return Object.fromEntries(headers.entries())
}

app.http('negotiate', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'negotiate',
    extraInputs: [connectionInfoInput],
    handler: async (request, context) => {
        const legacyContext = { res: undefined }
        await legacyHandler(legacyContext, {
            method: request.method,
            headers: headersObject(request.headers),
        }, context.extraInputs.get(connectionInfoInput))
        const response = legacyContext.res ?? { status: 500, body: { error: 'Realtime negotiation failed.' } }
        return {
            status: response.status,
            headers: response.headers,
            ...(typeof response.body === 'object' ? { jsonBody: response.body } : { body: response.body }),
        }
    },
})
