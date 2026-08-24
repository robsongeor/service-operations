import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    createBlankJobBookRow,
    getPromotionReadiness,
    JOB_BOOK_ENTRY_STAGES,
    MANAGED_JOB_ENTRY_MARKER_COLUMNS,
    splitSiteAddress,
} from '../src/alpha/job-book/jobBookPrototype.ts'
import {
    deletePersistedJobBookEquipmentIndex,
    jobBookEquipmentIndexScope,
    readPersistedJobBookEquipmentIndex,
    writePersistedJobBookEquipmentIndex,
} from '../src/alpha/job-book/jobBookEquipmentIndexCache.ts'

function jwt(claims: Record<string, string>) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
    return `header.${payload}.signature`
}

test('GT and Timecloud completion use separate managed Job columns', () => {
    assert.deepEqual(MANAGED_JOB_ENTRY_MARKER_COLUMNS, {
        entered: 'gr_gtentered',
        timecloudEntered: 'gr_timecloudentered',
    })
    assert.notEqual(MANAGED_JOB_ENTRY_MARKER_COLUMNS.entered, MANAGED_JOB_ENTRY_MARKER_COLUMNS.timecloudEntered)
})

test('Job Book Equipment indexes are isolated by account and environment', () => {
    const first = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-1', nonce: 'one' })
    const refreshed = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-1', nonce: 'two' })
    const otherAccount = jwt({ aud: 'org-a', tid: 'tenant-1', oid: 'user-2' })
    const otherEnvironment = jwt({ aud: 'org-b', tid: 'tenant-1', oid: 'user-1' })

    assert.equal(jobBookEquipmentIndexScope(first), jobBookEquipmentIndexScope(refreshed))
    assert.notEqual(jobBookEquipmentIndexScope(first), jobBookEquipmentIndexScope(otherAccount))
    assert.notEqual(jobBookEquipmentIndexScope(first), jobBookEquipmentIndexScope(otherEnvironment))
})

test('Job Book Equipment persistence safely becomes a no-op without IndexedDB', async () => {
    if (globalThis.indexedDB) return
    assert.equal(await readPersistedJobBookEquipmentIndex('account-a'), undefined)
    await writePersistedJobBookEquipmentIndex('account-a', [])
    await deletePersistedJobBookEquipmentIndex('account-a')
})

test('new Job Book rows are Intake records and are not managed Jobs', () => {
    const row = createBlankJobBookRow(130501)
    assert.equal(row.entryStage, JOB_BOOK_ENTRY_STAGES.INTAKE)
    assert.equal(row.entrySource, 'local-intake')
    assert.equal(row.linkedJobId, '')
})

test('promotion requires an allocated number, description, equipment decision and address decision', () => {
    const row = createBlankJobBookRow(0)
    row.address = 'Unknown address'
    const result = getPromotionReadiness(row)
    assert.equal(result.ready, false)
    assert.deepEqual(result.reasons, [
        'A Job Number must be allocated first.',
        'A Job description is required.',
        'Equipment must be selected or marked unconfigured.',
        'The address must be verified or marked not found.',
    ])
})

test('a reviewed Intake entry is ready for a typed promotion', () => {
    const row = createBlankJobBookRow(130501)
    row.description = 'Hydraulic leak'
    row.equipmentReviewRequired = true
    row.address = 'Address supplied by caller'
    row.addressNotFoundConfirmed = true
    assert.deepEqual(getPromotionReadiness(row), { ready: true, reasons: [] })
})

test('a managed or void entry cannot be promoted again', () => {
    const row = createBlankJobBookRow(130501)
    row.description = 'Hydraulic leak'
    row.equipmentReviewRequired = true
    row.entryStage = JOB_BOOK_ENTRY_STAGES.PROMOTED
    assert.equal(getPromotionReadiness(row).ready, false)
    assert.match(getPromotionReadiness(row).reasons[0], /Only Intake/)
})

test('Site addresses display the street above the remaining locality', () => {
    assert.deepEqual(splitSiteAddress('114 Captain Springs Road, Onehunga, Auckland 1061'), {
        street: '114 Captain Springs Road',
        locality: 'Onehunga, Auckland 1061',
    })
    assert.deepEqual(splitSiteAddress('77 Westney Road\nMangere, Auckland'), {
        street: '77 Westney Road',
        locality: 'Mangere, Auckland',
    })
})

test('Job Book intake uses the shared bounded selectors for Equipment and Customer', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    const sharedSelect = readFileSync(new URL('../src/alpha/shared/searchable-select/SearchableSelect.tsx', import.meta.url), 'utf8')

    assert.match(screen, /import SearchableSelect/)
    assert.match(screen, /id="job-book-draft-equipment"/)
    assert.match(screen, /id="job-book-draft-customer"/)
    assert.match(screen, /customerId=\{draft\.customerId\}/)
    assert.match(screen, /applyCustomerSelection/)
    assert.doesNotMatch(screen, /<input aria-label="Customer"/)
    assert.match(sharedSelect, /resultLimit\?: number/)
    assert.match(sharedSelect, /matching\.slice\(0, resultLimit\)/)
})

test('Job Book progressively loads shared Staff and bounded Customer Site relationships', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')

    assert.match(screen, /STAFF_DIRECTORY_QUERY_KEY/)
    assert.match(screen, /useOperationalQuery<Mechanic\[]>/)
    assert.match(screen, /searchCustomers\(await getAccessToken\(\), query, signal\)/)
    assert.match(screen, /fetchCustomerSites\(token, customerId, controller\.signal\)/)
    assert.match(screen, /new AbortController\(\)/)
    assert.match(screen, /Retry Staff/)
    assert.match(screen, /Retry Customer search/)
    assert.match(screen, /Retry Sites/)
    assert.doesNotMatch(screen, /fetchCustomers\(token\)/)
    assert.doesNotMatch(screen, /fetchSites\(token\)/)
    assert.doesNotMatch(screen, /subscribeToStaffChanges/)
})
