import assert from 'node:assert/strict'
import test from 'node:test'
import {
    JobsDataCache,
    deletePersistedJobsSnapshot,
    jobsCacheScope,
    readPersistedJobsSnapshot,
    writePersistedJobsSnapshot,
} from '../src/alpha/jobs/services/jobsDataCache.ts'

function jwt(claims: Record<string, string>) {
    return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
}

test('reuses a fresh Jobs result within one account scope', async () => {
    const cache = new JobsDataCache<string[]>()
    let loads = 0
    const loader = async () => [`load-${++loads}`]
    assert.deepEqual(await cache.read('account-a', loader), ['load-1'])
    assert.deepEqual(await cache.read('account-a', loader), ['load-1'])
    assert.equal(loads, 1)
})

test('force refresh bypasses a fresh Jobs result', async () => {
    const cache = new JobsDataCache<string[]>()
    let loads = 0
    const loader = async () => [`load-${++loads}`]
    await cache.read('account-a', loader)
    assert.deepEqual(await cache.read('account-a', loader, { forceRefresh: true }), ['load-2'])
})

test('Jobs cache scopes are stable and isolated without retaining tokens', () => {
    const first = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-1', nonce: 'one' })
    const refreshed = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-1', nonce: 'two' })
    assert.equal(jobsCacheScope(first), jobsCacheScope(refreshed))
    assert.notEqual(jobsCacheScope(first), jobsCacheScope(jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-2' })))
    assert.notEqual(jobsCacheScope(first), jobsCacheScope(jwt({ aud: 'org-b', tid: 'tenant-1', oid: 'user-1' })))
})

test('Jobs persistence safely becomes a no-op without IndexedDB', async () => {
    if (globalThis.indexedDB) return
    assert.equal(await readPersistedJobsSnapshot('account-a'), undefined)
    await writePersistedJobsSnapshot('account-a', [])
    await deletePersistedJobsSnapshot('account-a')
})
