const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { proxyJobSubmission, usesSharedBackend, SHARED_JOB_CARD_ORIGIN } = require('../api/services/jobSubmissionProxy')

test('only the explicit V2 marker selects the fixed shared Job Card backend', () => {
    assert.equal(usesSharedBackend({ headers: { 'x-job-card-shared-backend': 'v1-production' } }), true)
    assert.equal(usesSharedBackend({ headers: {} }), false)
    assert.equal(usesSharedBackend({ headers: { 'x-job-card-shared-backend': 'other' } }), false)
})

test('authenticated generation forwards only the delegated Dataverse token to the fixed backend', async () => {
    const calls = []
    const response = await proxyJobSubmission({
        method: 'POST',
        headers: {
            'x-dataverse-authorization': 'Bearer office-token',
            authorization: 'do-not-forward', cookie: 'private-cookie', origin: 'https://untrusted.invalid',
        },
        body: { action: 'generate', jobId: 'job-id' },
    }, async (...args) => {
        calls.push(args)
        return Response.json({ path: '/portal/job/token', expiresOn: '2026-10-07T00:00:00Z' }, { status: 201 })
    })
    assert.equal(calls.length, 1)
    const [target, options] = calls[0]
    assert.equal(target, `${SHARED_JOB_CARD_ORIGIN}/api/jobsubmission`)
    assert.equal(options.method, 'POST')
    assert.deepEqual(options.headers, { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Dataverse-Authorization': 'Bearer office-token' })
    assert.deepEqual(JSON.parse(options.body), { action: 'generate', jobId: 'job-id' })
    assert.equal(response.status, 201)
    assert.equal(response.headers['X-Job-Card-Backend'], 'shared-v1')
})

test('public reads retain only the encoded token and failures remain private', async () => {
    let target = ''
    const response = await proxyJobSubmission({ method: 'GET', headers: {}, query: { token: 'safe_token-1' } }, async (url, options) => {
        target = url
        assert.deepEqual(options.headers, { Accept: 'application/json' })
        return Response.json({ jobNumber: '147174' })
    })
    assert.equal(target, `${SHARED_JOB_CARD_ORIGIN}/api/jobsubmission?token=safe_token-1`)
    assert.equal(JSON.parse(response.body.toString()).jobNumber, '147174')
    const failed = await proxyJobSubmission({ method: 'GET', headers: {}, query: {} }, async () => { throw new Error('private upstream detail') })
    assert.equal(failed.status, 503)
    assert.doesNotMatch(failed.body, /private upstream detail/)
})

test('V2 build marks office and public Job Card requests for the shared backend', () => {
    const workflow = readFileSync(join(__dirname, '../.github/workflows/azure-static-web-apps-kind-wave-0cdea2200.yml'), 'utf8')
    const office = readFileSync(join(__dirname, '../src/alpha/jobs/services/jobSubmissionLinkApi.ts'), 'utf8')
    const portal = readFileSync(join(__dirname, '../src/alpha/portal/jobSubmissionApi.ts'), 'utf8')
    assert.match(workflow, /VITE_JOB_CARD_SHARED_BACKEND: "v1-production"/)
    assert.match(office, /X-Job-Card-Shared-Backend.*v1-production/s)
    assert.match(portal, /X-Job-Card-Shared-Backend.*v1-production/s)
})
