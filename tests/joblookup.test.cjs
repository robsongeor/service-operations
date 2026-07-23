const assert = require('node:assert/strict')
const test = require('node:test')
const jobLookup = require('../api/joblookup/index')

const originalFetch = global.fetch
const originalEnvironment = {
    DATAVERSE_URL: process.env.DATAVERSE_URL,
    VITE_DATAVERSE_URL: process.env.VITE_DATAVERSE_URL,
    LIFTTRUCKS_API_USERNAME: process.env.LIFTTRUCKS_API_USERNAME,
    LIFTTRUCKS_API_PASSWORD: process.env.LIFTTRUCKS_API_PASSWORD,
}

function restoreEnvironment() {
    Object.entries(originalEnvironment).forEach(([name, value]) => {
        if (value == null) delete process.env[name]
        else process.env[name] = value
    })
    global.fetch = originalFetch
}

function request(overrides = {}) {
    return {
        method: 'GET',
        headers: {},
        query: { jobNumber: 'J123' },
        ...overrides,
    }
}

async function invoke(input) {
    const context = {}
    await jobLookup(context, input)
    return context.res
}

test.afterEach(restoreEnvironment)

test('rejects an anonymous request before any external call', { concurrency: false }, async () => {
    let fetchCalls = 0
    global.fetch = async () => {
        fetchCalls += 1
        throw new Error('fetch should not be called')
    }

    const response = await invoke(request())

    assert.equal(response.status, 401)
    assert.equal(fetchCalls, 0)
    assert.match(response.body, /Authentication is required/)
})

test('rejects an invalid bearer token without calling the upstream API', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    let fetchCalls = 0
    global.fetch = async (url) => {
        fetchCalls += 1
        assert.match(String(url), /WhoAmI$/)
        return new Response('', { status: 401 })
    }

    const response = await invoke(request({ headers: { authorization: 'Bearer expired-token' } }))

    assert.equal(response.status, 401)
    assert.equal(fetchCalls, 1)
    assert.match(response.body, /invalid or expired/)
})

test('validates Dataverse identity before forwarding an authenticated request', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    const urls = []
    global.fetch = async (url, options) => {
        urls.push(String(url))
        if (String(url).endsWith('/WhoAmI')) {
            assert.equal(options.headers.Authorization, 'Bearer valid-token')
            return Response.json({ UserId: '00000000-0000-4000-8000-000000000001' })
        }
        assert.match(options.headers.Authorization, /^Basic /)
        return Response.json([{ JCJob: { JCJobCard: { TaskText: 'Safe result' } } }])
    }

    const response = await invoke(request({ headers: { Authorization: 'Bearer valid-token' } }))

    assert.equal(response.status, 200)
    assert.equal(urls.length, 2)
    assert.match(urls[0], /WhoAmI$/)
    assert.match(urls[1], /\/api\/01\/JCJob\/J123/)
})

test('returns a safe configuration error only after authentication succeeds', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    delete process.env.LIFTTRUCKS_API_USERNAME
    delete process.env.LIFTTRUCKS_API_PASSWORD
    let fetchCalls = 0
    global.fetch = async () => {
        fetchCalls += 1
        return Response.json({ UserId: '00000000-0000-4000-8000-000000000001' })
    }

    const response = await invoke(request({ headers: { authorization: 'Bearer valid-token' } }))

    assert.equal(response.status, 500)
    assert.equal(fetchCalls, 1)
    assert.doesNotMatch(response.body, /LIFTTRUCKS|USERNAME|PASSWORD|server-user/i)
})

test('does not expose an upstream error response body', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.LIFTTRUCKS_API_USERNAME = 'server-user'
    process.env.LIFTTRUCKS_API_PASSWORD = 'server-password'
    global.fetch = async (url) => {
        if (String(url).endsWith('/WhoAmI')) {
            return Response.json({ UserId: '00000000-0000-4000-8000-000000000001' })
        }
        return new Response('sensitive upstream diagnostic', { status: 500 })
    }

    const response = await invoke(request({ headers: { authorization: 'Bearer valid-token' } }))

    assert.equal(response.status, 502)
    assert.doesNotMatch(response.body, /sensitive upstream diagnostic/)
})
