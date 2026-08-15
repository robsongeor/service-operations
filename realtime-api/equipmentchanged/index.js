const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OPERATIONS = new Set(['create', 'update', 'delete'])

function equipmentEvent(body) {
    const table = String(body?.PrimaryEntityName || body?.primaryEntityName || '').toLowerCase()
    const operation = String(body?.MessageName || body?.messageName || '').toLowerCase()
    const equipmentId = String(body?.PrimaryEntityId || body?.primaryEntityId || '').replace(/[{}]/g, '')
    if (table !== 'gr_equipment' || !OPERATIONS.has(operation) || !GUID_PATTERN.test(equipmentId)) return undefined
    return { equipmentId, operation, changedAt: new Date().toISOString() }
}

module.exports = async function equipmentChanged(context, request) {
    const event = equipmentEvent(request.body)
    if (!event) {
        context.res = { status: 400, body: { error: 'Unsupported Dataverse event.' } }
        return
    }

    context.bindings.signalRMessages = [{ target: 'equipmentChanged', arguments: [event] }]
    context.res = { status: 202, body: { accepted: true } }
}

module.exports._test = { equipmentEvent }
