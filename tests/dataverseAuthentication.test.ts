import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

test('popup and silent callbacks execute the MSAL v5 redirect bridge', async () => {
    const [bootstrap, bridge, callbackPage, viteConfig] = await Promise.all([
        readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/auth/redirectBridge.ts', import.meta.url), 'utf8'),
        readFile(new URL('../auth/silent.html', import.meta.url), 'utf8'),
        readFile(new URL('../vite.config.ts', import.meta.url), 'utf8'),
    ])

    assert.match(bootstrap, /isEmbeddedAuthResponse[\s\S]*completeEmbeddedAuthenticationResponse\(\)/)
    assert.match(bridge, /@azure\/msal-browser\/redirect-bridge/)
    assert.match(bridge, /broadcastResponseToMainFrame\(\)/)
    assert.match(callbackPage, /redirectBridgeEntry\.ts/)
    assert.match(viteConfig, /authCallback:\s*resolve\(import\.meta\.dirname, 'auth\/silent\.html'\)/)
})
