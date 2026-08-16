import assert from 'node:assert/strict'
import test from 'node:test'
import {
    MAX_JOB_PHOTOS,
    MAX_JOB_PHOTO_BYTES,
    removePendingJobPhoto,
    validateJobPhoto,
    type PendingJobPhoto,
} from '../src/alpha/portal/jobPhoto.ts'

const photo = (id: string): PendingJobPhoto => ({
    id,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    size: 3,
    data: 'YWJj',
    previewUrl: 'data:image/jpeg;base64,YWJj',
})

test('accepts supported Job photo formats within the size limit', () => {
    assert.equal(validateJobPhoto({ name: 'one.jpg', type: 'image/jpeg', size: MAX_JOB_PHOTO_BYTES }), '')
    assert.equal(validateJobPhoto({ name: 'two.png', type: 'image/png', size: 100 }), '')
    assert.equal(validateJobPhoto({ name: 'three.heic', type: 'image/heic', size: 100 }), '')
    assert.equal(validateJobPhoto({ name: 'iphone.HEIC', type: '', size: 100 }), '')
    assert.equal(MAX_JOB_PHOTOS, 20)
})

test('rejects unsupported and oversized Job photos', () => {
    assert.match(validateJobPhoto({ name: 'bad.gif', type: 'image/gif', size: 100 }), /not a supported/i)
    assert.match(validateJobPhoto({ name: 'large.jpg', type: 'image/jpeg', size: MAX_JOB_PHOTO_BYTES + 1 }), /larger than 10 MB/i)
})

test('removes only the selected pending photo', () => {
    const remaining = removePendingJobPhoto([photo('one'), photo('two')], 'one')
    assert.deepEqual(remaining.map((item) => item.id), ['two'])
    assert.match(remaining[0].previewUrl, /^data:image\/jpeg/)
})
