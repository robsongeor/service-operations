const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID, createHash } = require('node:crypto')
const { AzureJobCardStore } = require('../api/services/jobCardStorage')

// Opt-in, in-memory Azurite only: never consumes cloud credentials or deletes real data.
test('Azure adapter contract against local Azurite', { skip: process.env.JOB_CARD_AZURITE_TEST !== 'true' }, async () => {
    const suffix = randomUUID().replaceAll('-', '')
    const store = new AzureJobCardStore('UseDevelopmentStorage=true', `CardTest${suffix}`, `card-test-${suffix}`)
    await store.table.createTable()
    await store.container.create()
    const make = (job = 'job-one') => ({
        tokenHash: createHash('sha256').update(randomUUID()).digest('hex'), sourceJobId: job,
        reviewId: randomUUID(), status: 'active', createdOn: new Date().toISOString(),
        expiresOn: new Date(Date.now() + 3600000).toISOString(),
    })
    const first = await store.createActive(make(), false)
    await assert.rejects(store.createActive(make(), false), { code: 'active-link' })
    const replacement = await store.createActive(make(), true)
    assert.equal((await store.getByTokenHash(first.tokenHash)).status, 'superseded')
    const races = await Promise.allSettled([store.createActive(make('race'), false), store.createActive(make('race'), false)])
    assert.equal(races.filter((value) => value.status === 'fulfilled').length, 1)
    const large = 'a'.repeat(29999) + '🛠️' + 'b'.repeat(65000)
    const submitted = await store.replace({ ...replacement, status: 'pendingReview', submittedOn: new Date().toISOString(), partsJson: large }, replacement.etag)
    assert.equal((await store.getByReviewId(replacement.reviewId)).partsJson, large)
    assert.equal((await store.listPending()).length, 1)
    assert.equal((await store.listByJobId('job-one')).length, 2)
    await assert.rejects(store.replace({ ...replacement, status: 'reviewed' }, replacement.etag), (error) => error.statusCode === 412)
    const photo = { fileName: 'verification 🛠️.png', mimeType: 'image/png', data: Buffer.from('test-bytes').toString('base64') }
    const uploadId = randomUUID()
    const uploaded = await store.uploadPhoto(submitted.tokenHash, photo, uploadId)
    await store.uploadPhoto(submitted.tokenHash, photo, uploadId)
    assert.equal((await store.inspectPhoto(uploaded.blobName)).fileName, photo.fileName)
    assert.deepEqual((await store.downloadPhoto(uploaded.blobName)).data, Buffer.from('test-bytes'))
    await store.replace({ ...submitted, status: 'reviewed' }, submitted.etag)
    assert.equal((await store.listPending()).length, 0)
})
