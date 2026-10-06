const assert = require('node:assert/strict')
const test = require('node:test')
const { proxyJobCardReviews, targetUrl, usesSharedBackend } = require('../api/services/jobCardReviewsProxy')
const { SHARED_JOB_CARD_ORIGIN } = require('../api/services/jobSubmissionProxy')

const reviewId = '00000000-0000-4000-8000-000000000001'
const photoId = '00000000-0000-4000-8000-000000000002'

test('only marked V2 review calls use the fixed shared backend', () => {
    assert.equal(usesSharedBackend({ headers: { 'x-job-card-shared-backend': 'v1-production' } }), true)
    assert.equal(usesSharedBackend({ headers: {} }), false)
    assert.equal(targetUrl({ params: {}, query: { view: 'submitted', offset: '0', limit: '100' } }), `${SHARED_JOB_CARD_ORIGIN}/api/jobcardreviews?view=submitted&offset=0&limit=100`)
    assert.equal(targetUrl({ params: { reviewId, photoId }, query: {} }), `${SHARED_JOB_CARD_ORIGIN}/api/jobcardreviews/${reviewId}/${photoId}`)
})

test('review reads forward only the delegated token and bounded route data', async () => {
    const calls = []
    const response = await proxyJobCardReviews({
        method: 'GET', params: { reviewId }, query: {},
        headers: { 'x-dataverse-authorization': 'Bearer reviewer-token', authorization: 'private', cookie: 'private', origin: 'private' },
    }, async (...args) => { calls.push(args); return Response.json({ reviewId }) })
    assert.equal(calls.length, 1)
    const [target, options] = calls[0]
    assert.equal(target, `${SHARED_JOB_CARD_ORIGIN}/api/jobcardreviews/${reviewId}`)
    assert.deepEqual(options.headers, { Accept: '*/*', 'X-Dataverse-Authorization': 'Bearer reviewer-token' })
    assert.equal(response.status, 200)
    assert.equal(response.headers['X-Job-Card-Backend'], 'shared-v1')
})

test('review writes preserve the JSON body and upstream authorization result', async () => {
    const response = await proxyJobCardReviews({
        method: 'POST', params: { reviewId }, query: {}, headers: { 'x-dataverse-authorization': 'Bearer reviewer-token' },
        body: { action: 'startReview', etag: 'W/"1"' },
    }, async (_target, options) => {
        assert.equal(options.method, 'POST')
        assert.deepEqual(JSON.parse(options.body), { action: 'startReview', etag: 'W/"1"' })
        return Response.json({ error: 'Job Card reviewer access is required.' }, { status: 403 })
    })
    assert.equal(response.status, 403)
})

test('photo bytes are preserved while private and unsafe response headers are removed', async () => {
    const response = await proxyJobCardReviews({ method: 'GET', params: { reviewId, photoId }, query: {}, headers: {} }, async () => (
        new Response(new Uint8Array([255, 216, 255]), { headers: {
            'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="photo.jpg"',
            'X-Content-Type-Options': 'nosniff', 'Set-Cookie': 'private', 'Cache-Control': 'public',
        } })
    ))
    assert.deepEqual(response.body, Buffer.from([255, 216, 255]))
    assert.equal(response.headers['Content-Disposition'], 'attachment; filename="photo.jpg"')
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(response.headers['Set-Cookie'], undefined)
    assert.equal(response.headers['Cache-Control'], 'private, no-store')
})

test('unsupported paths, queries, methods and upstream failures fail closed', async () => {
    assert.equal(targetUrl({ params: { reviewId: 'not-a-guid' }, query: {} }), '')
    assert.equal(targetUrl({ params: {}, query: { destination: 'https://untrusted.invalid' } }), '')
    assert.equal(await proxyJobCardReviews({ method: 'DELETE', params: {}, query: {}, headers: {} }), null)
    const failed = await proxyJobCardReviews({ method: 'GET', params: {}, query: {}, headers: {} }, async () => { throw new Error('private diagnostics') })
    assert.equal(failed.status, 503)
    assert.doesNotMatch(String(failed.body), /private diagnostics/)
})
