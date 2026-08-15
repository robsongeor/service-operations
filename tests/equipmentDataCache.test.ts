import assert from 'node:assert/strict'
import test from 'node:test'
import {
    EquipmentDataCache,
    deletePersistedEquipmentSnapshot,
    equipmentCacheScope,
    readPersistedEquipmentSnapshot,
    writePersistedEquipmentSnapshot,
} from '../src/alpha/equipment/services/equipmentDataCache.ts'

function jwt(claims: Record<string, string>) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `header.${payload}.signature`
}

test('reuses a fresh equipment result within the same account scope', async () => {
    const cache = new EquipmentDataCache<string[]>()
    let loads = 0
    const loader = async () => [`load-${++loads}`]

    assert.deepEqual(await cache.read('account-a', loader), ['load-1'])
    assert.deepEqual(await cache.read('account-a', loader), ['load-1'])
    assert.equal(loads, 1)
})

test('deduplicates concurrent equipment requests', async () => {
    const cache = new EquipmentDataCache<string[]>()
    let resolve!: (value: string[]) => void
    let loads = 0
    const loader = () => {
        loads += 1
        return new Promise<string[]>((done) => { resolve = done })
    }

    const first = cache.read('account-a', loader)
    const second = cache.read('account-a', loader)
    assert.equal(loads, 1)
    resolve(['equipment'])
    assert.deepEqual(await Promise.all([first, second]), [['equipment'], ['equipment']])
})

test('keeps equipment isolated by signed-in account and supports invalidation', async () => {
    const cache = new EquipmentDataCache<string[]>()
    let loads = 0
    const loader = async () => [`load-${++loads}`]

    await cache.read('account-a', loader)
    await cache.read('account-b', loader)
    cache.invalidate('account-a')
    assert.deepEqual(await cache.read('account-a', loader), ['load-3'])
    assert.deepEqual(await cache.read('account-b', loader), ['load-2'])
})

test('force refresh bypasses a fresh cached value', async () => {
    const cache = new EquipmentDataCache<string[]>()
    let loads = 0
    const loader = async () => [`load-${++loads}`]

    await cache.read('account-a', loader)
    assert.deepEqual(await cache.read('account-a', loader, { forceRefresh: true }), ['load-2'])
})

test('derives a stable cache scope without retaining the access token', () => {
    const first = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-1', nonce: 'one' })
    const refreshed = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-1', nonce: 'two' })
    const other = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-2' })
    const otherEnvironment = jwt({ aud: 'org-b', tid: 'tenant-1', oid: 'user-1' })

    assert.equal(equipmentCacheScope(first), equipmentCacheScope(refreshed))
    assert.notEqual(equipmentCacheScope(first), equipmentCacheScope(other))
    assert.notEqual(equipmentCacheScope(first), equipmentCacheScope(otherEnvironment))
})

test('device persistence safely becomes a no-op when IndexedDB is unavailable', async () => {
    if (globalThis.indexedDB) return
    assert.equal(await readPersistedEquipmentSnapshot('account-a'), undefined)
    await writePersistedEquipmentSnapshot('account-a', [])
    await deletePersistedEquipmentSnapshot('account-a')
})
