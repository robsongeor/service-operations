const test = require('node:test')
const assert = require('node:assert/strict')
const service = require('../api/services/workshopAssistantService')

const userId = '00000000-0000-4000-8000-000000000001'

function configure(t) {
    const previous = { ...process.env }
    t.after(() => {
        for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
        Object.assign(process.env, previous)
    })
    process.env.WORKSHOP_ASSISTANT_BACKEND_ENABLED = 'true'
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.AZURE_OPENAI_ENDPOINT = 'https://assistant.openai.azure.com'
    process.env.AZURE_OPENAI_API_KEY = 'server-secret'
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = 'workshop-realtime'
}

function request(headers = { 'X-Dataverse-Authorization': 'Bearer delegated-token' }) {
    return { method: 'POST', headers, body: { action: 'session' } }
}

test('Workshop Assistant is fail-closed while its backend gate is disabled', async (t) => {
    configure(t)
    process.env.WORKSHOP_ASSISTANT_BACKEND_ENABLED = 'false'
    const result = await service.handleWorkshopAssistant(request(), async () => { throw new Error('must not call upstream') })
    assert.equal(result.status, 503)
    assert.equal(JSON.parse(result.body).code, 'disabled')
})

test('Workshop Assistant requires a delegated Dataverse session', async (t) => {
    configure(t)
    const result = await service.handleWorkshopAssistant(request({}), async () => { throw new Error('must not call upstream') })
    assert.equal(result.status, 401)
})

test('Workshop Assistant rejects every account except George after authoritative Dataverse lookup', async (t) => {
    configure(t)
    let calls = 0
    const result = await service.handleWorkshopAssistant(request(), async () => {
        calls += 1
        if (calls === 1) return Response.json({ UserId: userId })
        return Response.json({ systemuserid: userId, fullname: 'Other User', internalemailaddress: 'other@liftrucks.co.nz' })
    })
    assert.equal(result.status, 403)
    assert.equal(calls, 2)
})

test('Workshop Assistant creates an owner session with read-only tools and no browser-visible server key', async (t) => {
    configure(t)
    const upstream = []
    const result = await service.handleWorkshopAssistant(request(), async (url, options = {}) => {
        upstream.push({ url: String(url), options })
        if (upstream.length === 1) return Response.json({ UserId: userId })
        if (upstream.length === 2) return Response.json({
            systemuserid: userId,
            fullname: 'George Robson',
            internalemailaddress: 'georger@liftrucks.co.nz',
        })
        return Response.json({ value: 'ephemeral-session-token', expires_at: 12345 })
    })
    assert.equal(result.status, 200)
    const body = JSON.parse(result.body)
    assert.equal(body.value, 'ephemeral-session-token')
    assert.equal(body.model, 'workshop-realtime')
    assert.equal(body.webrtcUrl, 'https://assistant.openai.azure.com/openai/v1/realtime/calls')
    assert.equal(JSON.stringify(body).includes('server-secret'), false)
    assert.equal(upstream[2].url, 'https://assistant.openai.azure.com/openai/v1/realtime/client_secrets')
    assert.equal(upstream[2].options.headers['api-key'], 'server-secret')
    const session = JSON.parse(upstream[2].options.body).session
    assert.deepEqual(session.tools.map((tool) => tool.name), [
        'search_equipment', 'get_equipment_context', 'search_jobs', 'get_job_context',
    ])
    assert.equal(session.tools.some((tool) => /create|update|delete|send|book/i.test(tool.name)), false)
    assert.match(session.instructions, /read-only/i)
    assert.match(session.instructions, /cannot create or change/i)
})
