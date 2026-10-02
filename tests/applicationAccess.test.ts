import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { AccountInfo } from '@azure/msal-browser'
import {
    APPLICATION_ROLES,
    parseSimulatedAccessMode,
    resolveApplicationAccess,
} from '../src/auth/applicationAccess.ts'

function accountWithRoles(roles: string[]): AccountInfo {
    return { idTokenClaims: { roles } } as unknown as AccountInfo
}

test('access enforcement gives full access precedence over Job Book-only access', () => {
    const access = resolveApplicationAccess(accountWithRoles([
        APPLICATION_ROLES.JOB_BOOK_ONLY,
        APPLICATION_ROLES.FULL_ACCESS,
    ]), { enforceAccessControl: true, isDevelopment: false })
    assert.equal(access.mode, 'full')
    assert.equal(access.canUseFullApplication, true)
    assert.equal(access.canUseJobBook, true)
})

test('Job Book-only role cannot use the rest of the management application', () => {
    const access = resolveApplicationAccess(accountWithRoles([
        APPLICATION_ROLES.JOB_BOOK_ONLY,
    ]), { enforceAccessControl: true, isDevelopment: false })
    assert.deepEqual(access, {
        mode: 'job-book-only',
        canUseFullApplication: false,
        canUseJobBook: true,
        isSimulated: false,
    })
})

test('enforced access denies an account without an application role', () => {
    const access = resolveApplicationAccess(accountWithRoles([]), {
        enforceAccessControl: true,
        isDevelopment: false,
    })
    assert.equal(access.mode, 'denied')
    assert.equal(access.canUseJobBook, false)
})

test('access control remains backwards compatible until enforcement is enabled', () => {
    const access = resolveApplicationAccess(accountWithRoles([]), {
        enforceAccessControl: false,
        isDevelopment: false,
    })
    assert.equal(access.mode, 'full')
})

test('development simulation overrides claims but is ignored outside development', () => {
    const production = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.FULL_ACCESS]), {
        enforceAccessControl: true,
        isDevelopment: false,
        simulatedMode: 'job-book-only',
    })
    const development = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.FULL_ACCESS]), {
        enforceAccessControl: true,
        isDevelopment: true,
        simulatedMode: 'job-book-only',
    })
    assert.equal(production.mode, 'full')
    assert.equal(development.mode, 'job-book-only')
    assert.equal(development.isSimulated, true)
    assert.equal(parseSimulatedAccessMode('unexpected'), null)
})

test('App and Sidebar enforce the Job Book-only navigation boundary', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    const sidebar = readFileSync(new URL('../src/Sidebar.tsx', import.meta.url), 'utf8')
    const jobBook = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(app, /access\.mode === 'job-book-only'/)
    assert.match(app, /path="\/" element=\{<Navigate to="\/job-book" replace \/>\}/)
    assert.match(app, /path="\*" element=\{<AccessDeniedScreen/)
    assert.match(sidebar, /filter\(\(item\) => item\.path === '\/job-book'\)/)
    assert.match(jobBook, /allowManagedJobNavigation/)
    assert.match(app, /allowManagedJobNavigation=\{false\}/)
    assert.match(jobBook, /allowManagedJobNavigation[\s\S]*Open Job[\s\S]*Managed Job/)
})
