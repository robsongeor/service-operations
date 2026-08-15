const { app, output } = require('@azure/functions')
const legacyHandler = require('../../equipmentchanged')

const signalRMessages = output.generic({
    type: 'signalR',
    name: 'signalRMessages',
    hubName: 'equipment',
    connectionStringSetting: 'AzureSignalRConnectionString',
})

app.http('equipmentchanged', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'equipmentchanged',
    extraOutputs: [signalRMessages],
    handler: async (request, context) => {
        const legacyContext = { bindings: {}, res: undefined }
        await legacyHandler(legacyContext, { body: await request.json() })
        if (legacyContext.bindings.signalRMessages) {
            context.extraOutputs.set(signalRMessages, legacyContext.bindings.signalRMessages)
        }
        const response = legacyContext.res ?? { status: 500, body: { error: 'Realtime receiver failed.' } }
        return {
            status: response.status,
            headers: response.headers,
            ...(typeof response.body === 'object' ? { jsonBody: response.body } : { body: response.body }),
        }
    },
})
