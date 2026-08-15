const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { equipmentEvent, jobEvent } = require('../realtime-api/equipmentchanged/index')._test
const { corsHeaders } = require('../realtime-api/services/realtimeSecurity')

test('realtime CORS accepts explicit production and localhost origins only', () => {
    const originalOrigins = process.env.APP_ORIGINS
    process.env.APP_ORIGINS = 'https://yellow-cliff-068680700.7.azurestaticapps.net,http://localhost:5173'
    try {
        const localhostHeaders = corsHeaders({ headers: { origin: 'http://localhost:5173' } })
        assert.equal(localhostHeaders['Access-Control-Allow-Origin'], 'http://localhost:5173')
        assert.equal(localhostHeaders['Access-Control-Allow-Credentials'], 'true')
        assert.equal(corsHeaders({ headers: { origin: 'https://yellow-cliff-068680700.7.azurestaticapps.net' } })['Access-Control-Allow-Origin'], 'https://yellow-cliff-068680700.7.azurestaticapps.net')
        assert.deepEqual(corsHeaders({ headers: { origin: 'https://example.invalid' } }), {})
    } finally {
        if (originalOrigins === undefined) delete process.env.APP_ORIGINS
        else process.env.APP_ORIGINS = originalOrigins
    }
})

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

test('the protected realtime webhook maps a minimal Dataverse Job event', () => {
    const event = jobEvent({ PrimaryEntityName: 'gr_job', PrimaryEntityId: '{11111111-1111-4111-8111-111111111111}', MessageName: 'Create' })
    assert.equal(event.jobId, '11111111-1111-4111-8111-111111111111')
    assert.equal(event.operation, 'create')
    assert.equal(jobEvent({ PrimaryEntityName: 'gr_equipment', PrimaryEntityId: event.jobId, MessageName: 'Update' }), undefined)
})

test('Node v4 entrypoints preserve protected receiver and authenticated negotiate routes', () => {
    const packageDefinition = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'realtime-api', 'package.json'), 'utf8'))
    assert.equal(packageDefinition.main, 'src/functions/*.js')
    assert.equal(typeof packageDefinition.dependencies['@azure/functions'], 'string')
    const receiver = fs.readFileSync(path.join(__dirname, '..', 'realtime-api', 'src', 'functions', 'equipmentchanged.js'), 'utf8')
    const negotiate = fs.readFileSync(path.join(__dirname, '..', 'realtime-api', 'src', 'functions', 'negotiate.js'), 'utf8')
    assert.match(receiver, /authLevel: 'function'/)
    assert.match(receiver, /route: 'equipmentchanged'/)
    assert.match(negotiate, /authLevel: 'anonymous'/)
    assert.match(negotiate, /route: 'negotiate'/)
})
