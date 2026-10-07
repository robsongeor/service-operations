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
        canUpdateEntryMarkers: true,
        canAssignInitialTechnician: true,
        canEditEquipmentDetails: false,
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
        canUpdateEntryMarkers: true,
        canAssignInitialTechnician: true,
        canEditEquipmentDetails: true,
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
    assert.match(screen, /if \(UNIFIED_JOB_RUNTIME && row\.registeredLedgerId\) \{[\s\S]*?fetchJobForCorrection[\s\S]*?setManagingJob[\s\S]*?return\s*\}\s*setPromotionRow\(row\)/)
    assert.match(screen, /\{canManageJobs && row\.coordinatorManaged !== true && <button[^>]*onClick=\{\(\) => openManageJob\(row\)\}>Manage job<\/button>\}/)
    assert.match(screen, /canEditIntake\s*\? <button[^>]*onClick=\{\(\) => openIntakeEntryEditor\(row\)\}>Edit entry<\/button>/)
    assert.match(screen, /\{canManageJobs && promotionRow && promotionReadiness &&/)
    assert.match(screen, /id="promotion-dialog-title">Manage job \{promotionRow\.jobNumber\}/)
    assert.match(screen, /<button[^>]*disabled[^>]*>Create managed Job<\/button>/)
    assert.doesNotMatch(screen, /Prepare promotion/)
})

test('unified production Jobs uses the bounded worklist without changing the default runtime', () => {
    const screen = readFileSync(new URL('../src/alpha/jobs/JobsScreen.tsx', import.meta.url), 'utf8')
    const worklist = readFileSync(new URL('../src/alpha/jobs/hooks/useUnifiedJobWorklist.ts', import.meta.url), 'utf8')
    assert.match(screen, /useUnifiedJobWorklist\(viewState\.selectedJobType\)/)
    assert.match(screen, /useJobs\(UNIFIED_JOB_RUNTIME \? \{ loadGlobalOperationalData: false/)
    assert.match(screen, /unifiedWorklist=\{UNIFIED_JOB_RUNTIME\}/)
    assert.match(worklist, /fetchUnifiedJobsPage\(token, scope, cursor\)/)
    assert.match(worklist, /pageNumber < 50/)
    assert.match(worklist, /loadedScope === scope/)
    assert.match(worklist, /const EMPTY_JOBS: Job\[\] = \[\]/)
    assert.match(worklist, /jobs: scopeIsCurrent \? jobs : EMPTY_JOBS/)
    assert.doesNotMatch(screen, /Refresh Jobs|Load more Jobs/)
})

test('WOF always presents Job numbers as immutable and points to regional allocation', () => {
    const drawer = readFileSync(new URL('../src/alpha/wof/components/WofEditorDrawer.tsx', import.meta.url), 'utf8')
    assert.match(drawer, /value=\{jobNumber\} readOnly/)
    assert.match(drawer, /saved unnumbered[\s\S]*regional allocation system/)
    assert.match(drawer, /Allocated Job numbers are permanent/)
})

test('Site Checks remove direct number paste and clear presentation', () => {
    const drawer = readFileSync(new URL('../src/alpha/site-checks/components/SiteCheckDetailsDrawer.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(drawer, /Clear Job number|Paste Job numbers|UNIFIED_JOB_RUNTIME/)
    assert.match(drawer, /selected && <div className="site-check-job-book" role="status">/)
    assert.match(drawer, /assigned only through the regional allocation system/)
    assert.match(drawer, /Allocated Jobs must be retained as history/)
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
    const quoteReadOnly = readFileSync(new URL('../src/alpha/quotes/components/QuoteReadOnlyDialog.tsx', import.meta.url), 'utf8')
    const equipment = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    const customers = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    assert.match(app, /access\.mode === 'job-card-admin'/)
    assert.match(app, /Navigate to="\/job-card-reviews"/)
    for (const route of ['/job-card-reviews', '/job-book', '/quotes', '/equipment', '/customers']) assert.ok(app.includes(`path="${route}"`), route)
    assert.match(sidebar, /access\.mode === 'job-card-admin'/)
    assert.match(app, /<QuotesScreen[^>]*readOnly/)
    assert.match(app, /<EquipmentScreen readOnly/)
    assert.match(app, /<CustomerDashboardScreen readOnly/)
    assert.match(app, /allowManagedJobMarkerUpdates=\{access.canUpdateEntryMarkers\}/)
    assert.match(quotes, /readOnly/)
    assert.match(quotes, /readOnly && editingQuote/)
    assert.match(quotes, /<QuoteReadOnlyDialog/)
    assert.match(quoteReadOnly, /Quote details/)
    assert.match(quoteReadOnly, /Read only — quote information cannot be changed/)
    assert.match(quoteReadOnly, /<colgroup>/)
    assert.doesNotMatch(quoteReadOnly, /<th>GST<\/th>/)
    assert.match(quoteReadOnly, /GST \{quote\.gr_gstrate \* 100\}%/)
    assert.doesNotMatch(quoteReadOnly, /<input|<select|<textarea|onSave|onDelete|Generate and save PDF|Open PO request email/)
    assert.match(equipment, /readOnly/)
    assert.match(customers, /readOnly/)
    assert.match(customers, /loadManagementData: !readOnly/)
    assert.match(customers, /useSiteChecks\(readOnly \? \[\] : persistedCustomerSiteIds\)/)
})

test('coordinator retains operational capabilities without full-application navigation', () => {
    const options = { enforceAccessControl: true, isDevelopment: false }
    const full = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.FULL_ACCESS]), options)
    const coordinator = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.SERVICE_COORDINATOR]), options)
    assert.equal(coordinator.mode, 'service-coordinator')
    assert.equal(coordinator.canUseFullApplication, false)
    for (const key of Object.keys(full).filter((key) => key.startsWith('can') && key !== 'canUseFullApplication')) assert.equal(coordinator[key as keyof typeof coordinator], full[key as keyof typeof full], key)
})

test('App and Sidebar enforce the Service Coordinator screen boundary', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    const sidebar = readFileSync(new URL('../src/Sidebar.tsx', import.meta.url), 'utf8')
    const access = readFileSync(new URL('../src/auth/applicationAccess.ts', import.meta.url), 'utf8')
    const coordinatorRoutes = app.match(/access\.mode === 'service-coordinator' \? <Routes>([\s\S]*?)<\/Routes> : access\.mode === 'job-book-only'/)?.[1] ?? ''
    assert.ok(coordinatorRoutes)
    assert.match(coordinatorRoutes, /Navigate to="\/jobs"/)
    assert.match(coordinatorRoutes, /path="\*" element=\{<AccessDeniedScreen/)
    for (const route of ['/customers', '/equipment', '/wof', '/jobs', '/job-card-reviews', '/job-book', '/scheduling', '/quotes', '/pricing']) {
        assert.ok(coordinatorRoutes.includes(`path="${route}"`), `allowed route ${route}`)
        assert.ok(access.includes(`'${route}'`), `navigation path ${route}`)
    }
    for (const route of ['/', '/staff', '/maintenance-booking', '/job-import', '/equipment-photos', '/equipment/greentree-test', '/equipment-map', '/job-map', '/site-checks', '/chargeable-invoices', '/site-checks/checklists']) {
        if (route !== '/') assert.ok(!coordinatorRoutes.includes(`path="${route}"`), `restricted route ${route}`)
        assert.ok(!access.includes(`'${route}',`), `restricted navigation path ${route}`)
    }
    assert.match(sidebar, /access\.mode === 'service-coordinator'/)
    assert.match(sidebar, /SERVICE_COORDINATOR_NAVIGATION_PATHS\.includes/)
    assert.match(sidebar, /isAdmin && access\.mode === 'full'/)
})
test('Job Book Admin separates corrections and master data from dispatch, markers and review', () => {
    const options = { enforceAccessControl: true, isDevelopment: false }
    const book = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.JOB_BOOK_ADMIN]), options)
    assert.equal(book.mode, 'job-book-admin')
    for (const key of ['canCorrectJobDetails','canEditEquipmentDetails','canMoveEquipment','canCreateEquipmentDestination','canViewCustomers','canViewEquipment'] as const) assert.equal(book[key], true, key)
    for (const key of ['canManageJobs','canAssignInitialTechnician','canUpdateEntryMarkers','canEmailAssignedTechnician','canReviewJobCards','canViewQuotes','canEditEquipment','canEditCustomers'] as const) assert.equal(book[key], false, key)
    const office = resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.JOB_CARD_ADMIN]), options)
    assert.equal(office.canEditEquipmentDetails, true)
    assert.equal(office.canAssignInitialTechnician, true)
    assert.equal(office.canUpdateEntryMarkers, true)
    assert.equal(office.canReviewJobCards, true)
    assert.equal(resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.JOB_BOOK_ADMIN, APPLICATION_ROLES.JOB_CARD_ADMIN]), options).mode, 'job-card-admin')
    assert.equal(resolveApplicationAccess(accountWithRoles([APPLICATION_ROLES.JOB_BOOK_ADMIN, APPLICATION_ROLES.SERVICE_COORDINATOR]), options).mode, 'service-coordinator')
})
