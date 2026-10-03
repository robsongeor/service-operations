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
        canManageJobs: false,
        canCorrectJobDetails: false,
        canEmailAssignedTechnician: false,
        canReviewJobCards: false,
        canViewQuotes: false,
        canEditQuotes: false,
        canViewEquipment: false,
        canEditEquipment: false,
        canMoveEquipment: true,
        canCreateEquipmentDestination: true,
        canViewCustomers: false,
        canEditCustomers: false,
        isSimulated: false,
    })
})

test('Job Card Admin has the five-area capability set with corrections but no coordination capabilities', () => {
    const access = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.JOB_CARD_ADMIN]), {
        enforceAccessControl: true,
        isDevelopment: false,
    })
    assert.deepEqual(access, {
        mode: 'job-card-admin',
        canUseFullApplication: false,
        canUseJobBook: true,
        canManageJobs: false,
        canCorrectJobDetails: true,
        canEmailAssignedTechnician: true,
        canReviewJobCards: true,
        canViewQuotes: true,
        canEditQuotes: false,
        canViewEquipment: true,
        canEditEquipment: false,
        canMoveEquipment: true,
        canCreateEquipmentDestination: true,
        canViewCustomers: true,
        canEditCustomers: false,
        isSimulated: false,
    })
})

test('Full Access takes precedence when Job Card Admin is also assigned', () => {
    const access = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.JOB_CARD_ADMIN, APPLICATION_ROLES.FULL_ACCESS]), {
        enforceAccessControl: true,
        isDevelopment: false,
    })
    assert.equal(access.mode, 'full')
    assert.equal(access.canEditQuotes, true)
    assert.equal(access.canEditEquipment, true)
    assert.equal(access.canEditCustomers, true)
})

test('only Full Access coordinators can manage Jobs, including development simulation', () => {
    for (const [roles, permitted] of [
        [[APPLICATION_ROLES.FULL_ACCESS], true],
        [[APPLICATION_ROLES.JOB_CARD_ADMIN], false],
        [[APPLICATION_ROLES.JOB_BOOK_ONLY], false],
        [[APPLICATION_ROLES.JOB_CARD_ADMIN, APPLICATION_ROLES.JOB_BOOK_ONLY], false],
        [[APPLICATION_ROLES.FULL_ACCESS, APPLICATION_ROLES.JOB_CARD_ADMIN], true],
        [[], false],
    ] as [string[], boolean][]) {
        const access = resolveApplicationAccess(accountWithRoles(roles), { enforceAccessControl: true, isDevelopment: false })
        assert.equal(access.canManageJobs, permitted, roles.join(',') || 'no role')
    }
    for (const simulatedMode of ['full', 'job-card-admin', 'job-book-only', 'denied']) {
        const access = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.FULL_ACCESS]), {
            enforceAccessControl: true, isDevelopment: true, simulatedMode,
        })
        assert.equal(access.canManageJobs, simulatedMode === 'full', simulatedMode)
    }
})

test('Job Book guards Manage job presentation and entry point while retaining Intake editing', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /const \{ canManageJobs, canCorrectJobDetails, canEmailAssignedTechnician \} = applicationAccessFromEnvironment\(account\)/)
    assert.match(screen, /const openManageJob = \(row: JobBookRow\) => \{\s*if \(!canManageJobs \|\| \(!isEditableJobBookIntake\(row\) && !row\.registeredLedgerId\)\) return/)
    assert.match(screen, /if \(UNIFIED_JOB_WALKTHROUGH && row\.registeredLedgerId\) \{[\s\S]*?fetchJobForCorrection[\s\S]*?setManagingJob[\s\S]*?return\s*\}\s*setPromotionRow\(row\)/)
    assert.match(screen, /\{canManageJobs && row\.coordinatorManaged !== true && <button[^>]*onClick=\{\(\) => openManageJob\(row\)\}>Manage job<\/button>\}/)
    assert.match(screen, /canEditIntake\s*\? <button[^>]*onClick=\{\(\) => openIntakeEntryEditor\(row\)\}>Edit entry<\/button>/)
    assert.match(screen, /\{canManageJobs && promotionRow && promotionReadiness &&/)
    assert.match(screen, /id="promotion-dialog-title">Manage job \{promotionRow\.jobNumber\}/)
    assert.match(screen, /<button[^>]*disabled[^>]*>Create managed Job<\/button>/)
    assert.doesNotMatch(screen, /Prepare promotion/)
})

test('enforced access denies an account without an application role', () => {
    const access = resolveApplicationAccess(accountWithRoles([]), {
        enforceAccessControl: true,
        isDevelopment: false,
    })
    assert.equal(access.mode, 'denied')
    assert.equal(access.canUseJobBook, false)
    assert.equal(access.canMoveEquipment, false)
    assert.equal(access.canCreateEquipmentDestination, false)
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
    assert.equal(parseSimulatedAccessMode('job-card-admin'), 'job-card-admin')
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

test('App and Sidebar enforce the Job Card Admin route and presentation boundary', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    const sidebar = readFileSync(new URL('../src/Sidebar.tsx', import.meta.url), 'utf8')
    const quotes = readFileSync(new URL('../src/alpha/quotes/QuotesScreen.tsx', import.meta.url), 'utf8')
    const equipment = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    const customers = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    assert.match(app, /access\.mode === 'job-card-admin'/)
    assert.match(app, /Navigate to="\/job-card-reviews"/)
    for (const route of ['/job-card-reviews', '/job-book', '/quotes', '/equipment', '/customers']) assert.ok(app.includes(`path="${route}"`), route)
    assert.match(sidebar, /access\.mode === 'job-card-admin'/)
    assert.match(app, /<QuotesScreen[^>]*readOnly/)
    assert.match(app, /<EquipmentScreen readOnly/)
    assert.match(app, /<CustomerDashboardScreen readOnly/)
    assert.match(app, /allowManagedJobMarkerUpdates=\{access.canCorrectJobDetails\}/)
    assert.match(quotes, /readOnly/)
    assert.match(equipment, /readOnly/)
    assert.match(customers, /readOnly/)
})
