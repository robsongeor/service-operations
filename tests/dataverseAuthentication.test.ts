import assert from 'node:assert/strict'
import test from 'node:test'
import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'
import { acquireDataverseAccessToken } from '../src/auth/dataverseAuthentication.ts'

const account = {
    homeAccountId: 'home-account',
    localAccountId: 'local-account',
    username: 'user@example.invalid',
} as AccountInfo

test('concurrent delegated token reads share one silent MSAL request', async () => {
    let calls = 0
    let resolve!: (value: { accessToken: string }) => void
    const instance = {
        acquireTokenSilent: () => {
            calls += 1
            return new Promise((done) => { resolve = done })
        },
    } as unknown as IPublicClientApplication

    const first = acquireDataverseAccessToken(instance, account)
    const second = acquireDataverseAccessToken(instance, account)
    assert.equal(calls, 1)
    resolve({ accessToken: 'shared-token' })
    assert.deepEqual(await Promise.all([first, second]), ['shared-token', 'shared-token'])
})

test('forced and ordinary delegated token reads do not share request intent', async () => {
    const calls: boolean[] = []
    const instance = {
        acquireTokenSilent: async (request: { forceRefresh?: boolean }) => {
            calls.push(Boolean(request.forceRefresh))
            return { accessToken: request.forceRefresh ? 'forced' : 'cached' }
        },
    } as unknown as IPublicClientApplication

    assert.deepEqual(await Promise.all([
        acquireDataverseAccessToken(instance, account),
        acquireDataverseAccessToken(instance, account, true),
    ]), ['cached', 'forced'])
    assert.deepEqual(calls, [false, true])
})
