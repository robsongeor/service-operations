import assert from 'node:assert/strict'
import test from 'node:test'
import { unzipSync } from 'fflate'
import { buildJobCardArchive, buildJobCardPhotoArchive, jobCardPhotoFilename, safePhotoFilename, saveJobCardArchive, saveJobCardPhotos } from '../src/alpha/job-card-reviews/jobCardPhotoDownload.ts'

const photo = (overrides = {}) => ({ id: 'photo-1', fileName: 'Pump.jpg', mimeType: 'image/jpeg', size: 3, ...overrides })
const bytes = new Uint8Array([1, 2, 3])
const card = { filename: 'Job-42.pdf', blob: new Blob(['%PDF-fixture'], { type: 'application/pdf' }) }

test('documentation ZIP includes the Job card and every original photo, including zero-photo submissions', async () => {
    const empty = unzipSync(new Uint8Array(await (await buildJobCardArchive([], async () => assert.fail('No photo request'), undefined, undefined, card)).arrayBuffer()))
    assert.deepEqual(Object.keys(empty), ['Job-42.pdf'])
    const files = unzipSync(new Uint8Array(await (await buildJobCardArchive([photo()], async () => new Blob([bytes]), undefined, undefined, card)).arrayBuffer()))
    assert.deepEqual(Object.keys(files), ['Job-42.pdf', '01 - Pump.jpg'])
    assert.deepEqual(files['Job-42.pdf'], new TextEncoder().encode('%PDF-fixture'))
    assert.deepEqual(files['01 - Pump.jpg'], bytes)
})

test('documentation ZIP fails entirely for missing photos, invalid PDF or cancellation', async () => {
    await assert.rejects(buildJobCardArchive([photo()], async () => { throw new Error('403') }, undefined, undefined, card), /403/)
    await assert.rejects(buildJobCardArchive([], async () => new Blob(), undefined, undefined, { ...card, blob: new Blob(['bad'], { type: 'application/pdf' }) }), /PDF is invalid/)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(buildJobCardArchive([], async () => new Blob(), undefined, controller.signal, card), { name: 'AbortError' })
})

test('documentation picker is opened before loading and saves only the completed ZIP', async (t) => {
    const original = globalThis.window
    t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original })
    const order = []
    globalThis.window = { showSaveFilePicker: async options => {
        order.push('picker')
        assert.equal(options.id, 'job-card-documentation')
        assert.equal(options.types[0].description, 'Job card and photos ZIP')
        return { createWritable: async () => ({ write: async () => order.push('write'), close: async () => order.push('close'), abort: async () => assert.fail('No abort') }) }
    } }
    assert.match(await saveJobCardArchive('42 documents', async () => { order.push('load'); return new Blob(['zip']) }, undefined, true), /Job card and photos saved/)
    assert.deepEqual(order, ['picker', 'load', 'write', 'close'])
})

test('ZIP name uses Job description and NZ submission date, not UTC or download date', () => {
    assert.equal(jobCardPhotoFilename({ jobNumber: '142314', workRequired: 'Repair hydraulic leak', submittedOn: '2026-10-01T12:00:00Z' }), '142314 - Repair hydraulic leak - 02-10-2026.zip')
    assert.equal(jobCardPhotoFilename({ jobNumber: '42', submittedOn: '2026-07-01T00:00:00Z' }), '42 - No description - 01-07-2026.zip')
    assert.ok(jobCardPhotoFilename({ jobNumber: '1'.repeat(100), workRequired: 'x'.repeat(2000), submittedOn: '2026-07-01T00:00:00Z' }).length <= 160)
})

test('filenames exclude Windows reserved names, path separators, control characters and trailing dots', () => {
    assert.equal(safePhotoFilename(' CON.txt '), 'Job photos')
    assert.equal(safePhotoFilename('NUL'), 'Job photos')
    assert.equal(safePhotoFilename('Pump / hose:  "LH"?*\u0000\u007f. '), 'Pump - hose- -LH-----')
    assert.equal(safePhotoFilename('..'), 'Job photos')
    assert.equal(safePhotoFilename('x'.repeat(300)).length, 160)
})

test('archive stores all original bytes, sanitises paths/extensions, numbers duplicates and reports progress', async () => {
    const progress = []
    const calls = []
    const archive = await buildJobCardPhotoArchive([
        photo({ fileName: '../Pump.exe' }), photo({ id: 'photo-2', fileName: '../Pump.exe' }),
        photo({ id: 'photo-3', fileName: 'Original', mimeType: 'image/heic' }),
    ], async (id) => { calls.push(id); return new Blob([bytes]) }, (value) => progress.push(value))
    assert.equal(archive.type, 'application/zip')
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()))
    assert.deepEqual(Object.keys(files), ['01 - ..-Pump.jpg', '02 - ..-Pump.jpg', '03 - Original.heic'])
    for (const value of Object.values(files)) assert.deepEqual(value, bytes)
    assert.deepEqual(calls, ['photo-1', 'photo-2', 'photo-3'])
    assert.deepEqual(progress, [1, 2, 3])
})

test('missing, partial, oversized and unsupported photos fail closed', async () => {
    await assert.rejects(buildJobCardPhotoArchive([], async () => new Blob()), /1 to 20/)
    await assert.rejects(buildJobCardPhotoArchive(Array(21).fill(photo()), async () => new Blob()), /1 to 20/)
    await assert.rejects(buildJobCardPhotoArchive([photo()], async () => new Blob([new Uint8Array(2)])), /completely/)
    await assert.rejects(buildJobCardPhotoArchive([photo()], async () => new Blob([new Uint8Array(10 * 1024 * 1024 + 1)])), /completely/)
    await assert.rejects(buildJobCardPhotoArchive([photo({ mimeType: 'text/html' })], async () => new Blob([bytes])), /unsupported/)
    await assert.rejects(buildJobCardPhotoArchive([photo()], async () => { throw new Error('403') }), /403/)
})

test('abort before or during download never produces a ZIP', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(buildJobCardPhotoArchive([photo()], async () => assert.fail('No request expected'), undefined, controller.signal), { name: 'AbortError' })
    const during = new AbortController()
    await assert.rejects(buildJobCardPhotoArchive([photo()], async () => { during.abort(); return new Blob([bytes]) }, undefined, during.signal), { name: 'AbortError' })
})

test('native save picker precedes all loading and only writes a completed ZIP', async (t) => {
    const order = []
    const archive = new Blob(['archive'])
    t.mock.method(globalThis, 'setTimeout', () => 0)
    const original = globalThis.window
    t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original })
    globalThis.window = { showSaveFilePicker: async (options) => {
        order.push('picker')
        assert.equal(options.suggestedName, '42 - Repair - 02-10-2026.zip')
        assert.deepEqual(options.types[0].accept, { 'application/zip': ['.zip'] })
        return { createWritable: async () => ({ write: async (value) => { assert.equal(value, archive); order.push('write') }, close: async () => order.push('close'), abort: async () => assert.fail('No abort expected') }) }
    } }
    assert.match(await saveJobCardPhotos('42 - Repair - 02-10-2026.zip', async () => { order.push('load'); return archive }), /selected location/)
    assert.deepEqual(order, ['picker', 'load', 'write', 'close'])
})

test('picker cancellation performs no load; archive failure opens no writer; failed write aborts', async (t) => {
    const original = globalThis.window
    t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original })
    globalThis.window = { showSaveFilePicker: async () => { throw new DOMException('Cancelled', 'AbortError') } }
    await assert.rejects(saveJobCardPhotos('photos', async () => assert.fail('No load expected')), { name: 'AbortError' })
    globalThis.window = { showSaveFilePicker: async () => ({ createWritable: async () => assert.fail('Incomplete ZIP must not write') }) }
    await assert.rejects(saveJobCardPhotos('photos', async () => { throw new Error('Missing photo') }), /Missing photo/)
    let aborted = false
    globalThis.window = { showSaveFilePicker: async () => ({ createWritable: async () => ({ write: async () => { throw new Error('Full disk') }, close: async () => assert.fail('Must not close failed write'), abort: async () => { aborted = true } }) }) }
    await assert.rejects(saveJobCardPhotos('photos', async () => new Blob(['archive'])), /Full disk/)
    assert.equal(aborted, true)
})

test('unsupported browsers download one ZIP and revoke its object URL', async (t) => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    t.after(() => {
        if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
        if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument
    })
    let clicked = false
    let revoked = false
    let release
    const anchor = { click() { clicked = true } }
    globalThis.window = {}
    globalThis.document = { createElement: (tag) => { assert.equal(tag, 'a'); return anchor } }
    t.mock.method(URL, 'createObjectURL', () => 'blob:fixture')
    t.mock.method(URL, 'revokeObjectURL', (url) => { assert.equal(url, 'blob:fixture'); revoked = true })
    t.mock.method(globalThis, 'setTimeout', (callback) => { release = callback; return 0 })
    assert.match(await saveJobCardPhotos('Fixture', async () => new Blob(['archive'])), /browser downloads/)
    assert.equal(anchor.download, 'Fixture.zip')
    assert.equal(anchor.href, 'blob:fixture')
    assert.equal(clicked, true)
    release()
    assert.equal(revoked, true)
})
