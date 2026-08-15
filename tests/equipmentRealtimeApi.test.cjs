const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { equipmentEvent } = require('../realtime-api/equipmentchanged/index')._test

test('Dataverse Equipment webhook is protected by an Azure Function key', () => {
    const definition = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'realtime-api', 'equipmentchanged', 'function.json'),
        'utf8',
    ))
    const trigger = definition.bindings.find((binding) => binding.type === 'httpTrigger')
    assert.equal(trigger.authLevel, 'function')
})

test('Dataverse Equipment webhook context maps to a minimal SignalR event', () => {
    const event = equipmentEvent({
        PrimaryEntityName: 'gr_equipment',
        PrimaryEntityId: '{11111111-1111-4111-8111-111111111111}',
        MessageName: 'Update',
    })
    assert.equal(event.equipmentId, '11111111-1111-4111-8111-111111111111')
    assert.equal(event.operation, 'update')
    assert.equal(Number.isNaN(Date.parse(event.changedAt)), false)
})

test('Dataverse webhook rejects unrelated tables and operations', () => {
    assert.equal(equipmentEvent({ PrimaryEntityName: 'gr_job', PrimaryEntityId: '11111111-1111-4111-8111-111111111111', MessageName: 'Update' }), undefined)
    assert.equal(equipmentEvent({ PrimaryEntityName: 'gr_equipment', PrimaryEntityId: '11111111-1111-4111-8111-111111111111', MessageName: 'Retrieve' }), undefined)
})
