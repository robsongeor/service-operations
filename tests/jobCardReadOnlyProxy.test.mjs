import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import jobCardReadOnlyProxy, { createJobCardReadOnlyMiddleware } from '../scripts/dev/jobCardReadOnlyProxy.mjs'

const id = '00000000-0000-4000-8000-000000000001'
async function invoke({ url = '/api/jobcardreviews', method = 'GET', headers = { 'x-dataverse-authorization': 'Bearer fixture-token' }, upstream = async () => Response.json({ items: [] }) } = {}) {
    const calls = []
    const request = Object.assign(new EventEmitter(), { url, method, headers })
    const response = Object.assign(new EventEmitter(), { headers: {}, statusCode: 200, destroyed: false,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value },
        end(body) { this.body = body },
    })
    let passedThrough = false
    await createJobCardReadOnlyMiddleware(async (...args) => { calls.push(args); return upstream(...args) })(request, response, () => { passedThrough = true })
    return { response, calls, passedThrough, request }
}

test('only GETs to approved review paths reach the fixed live API with the delegated header', async () => {
    for (const url of ['/api/jobcardreviews', `/api/jobcardreviews?jobId=${id}`, `/api/jobcardreviews/${id}`, `/api/jobcardreviews/${id}/${id}`]) {
        const result = await invoke({ url, headers: { 'x-dataverse-authorization': 'Bearer fixture-token', cookie: 'private-cookie', authorization: 'do-not-forward', origin: 'do-not-forward' } })
        assert.equal(result.calls.length, 1)
        const [target, options] = result.calls[0]
        assert.equal(target, `https://yellow-cliff-068680700.7.azurestaticapps.net${url}`)
        assert.equal(options.method, 'GET')
        assert.equal(options.redirect, 'error')
        assert.deepEqual(options.headers, { 'X-Dataverse-Authorization': 'Bearer fixture-token', Accept: '*/*' })
        assert.equal(result.response.headers['cache-control'], 'private, no-store')
        assert.equal(result.response.headers['x-job-card-data-source'], 'live-read-only')
        assert.equal(result.response.statusCode, 200)
        assert.deepEqual(JSON.parse(result.response.body), { items: [] })
        assert.equal(result.request.listenerCount('aborted'), 0)
    }
})

test('all writes are blocked locally before authentication or any upstream call', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
        const { response, calls } = await invoke({ method, url: `/api/jobcardreviews/${id}` })
        assert.equal(response.statusCode, 405)
        assert.equal(response.headers.allow, 'GET')
        assert.match(String(response.body), /read-only/)
        assert.equal(calls.length, 0)
    }
})

test('authentication is required and caller-controlled destinations are rejected', async () => {
    const unsigned = await invoke({ headers: {} })
    assert.equal(unsigned.response.statusCode, 401)
    assert.equal(unsigned.calls.length, 0)
    for (const url of ['https://example.test/api/jobcardreviews', '/api/jobcardreviews/not-an-id', '/api/jobcardreviews//example.test']) {
        const { response, calls } = await invoke({ url })
        assert.equal(response.statusCode, 400)
        assert.equal(calls.length, 0)
    }
    const other = await invoke({ url: '/api/joblookup', method: 'POST' })
    assert.equal(other.passedThrough, true)
    assert.equal(other.calls.length, 0)
})

test('upstream denial remains denial and private photo bytes are preserved without cookies', async () => {
    const denied = await invoke({ upstream: async () => Response.json({ error: 'Access denied.' }, { status: 403 }) })
    assert.equal(denied.response.statusCode, 403)
    const photo = await invoke({ url: `/api/jobcardreviews/${id}/${id}`, upstream: async () => new Response(new Uint8Array([255, 216, 255]), { headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename=photo.jpg', 'Set-Cookie': 'secret', 'Cache-Control': 'public' } }) })
    assert.deepEqual(photo.response.body, Buffer.from([255, 216, 255]))
    assert.equal(photo.response.headers['content-type'], 'image/jpeg')
    assert.equal(photo.response.headers['content-disposition'], 'attachment; filename=photo.jpg')
    assert.equal(photo.response.headers['set-cookie'], undefined)
    assert.equal(photo.response.headers['cache-control'], 'private, no-store')
})

test('network errors, redirects and oversized responses fail closed without exposing diagnostics', async () => {
    for (const upstream of [
        async () => { throw new Error('private diagnostics') },
        async () => new Response('', { status: 302, headers: { Location: 'https://example.test' } }),
        async () => new Response('', { headers: { 'Content-Length': String(17 * 1024 * 1024) } }),
        async () => new Response(new Uint8Array(17 * 1024 * 1024)),
    ]) {
        const { response } = await invoke({ upstream })
        assert.equal(response.statusCode, 502)
        assert.doesNotMatch(String(response.body), /private diagnostics|example\.test/)
    }
})

test('proxy is development-only, ordered before normal handlers, and enables the UI notice', () => {
    const plugin = jobCardReadOnlyProxy()
    assert.equal(plugin.apply, 'serve')
    assert.equal(plugin.enforce, 'pre')
    assert.equal(plugin.config().define['import.meta.env.VITE_JOB_CARD_READ_ONLY'], '"true"')
})
