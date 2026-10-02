import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    createBlankJobBookRow,
    getPromotionReadiness,
    JOB_BOOK_ENTRY_STAGES,
    MANAGED_JOB_ENTRY_MARKER_COLUMNS,
    setEquipmentReviewRequired,
    splitSiteAddress,
} from '../src/alpha/job-book/jobBookPrototype.ts'
import { JOB_BOOKS, jobNumberBelongsToBook, jobNumberSequence, managedJobNumberFilter } from '../src/alpha/job-book/jobBookConfig.ts'
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
    assert.equal(row.jobBookKey, 'auckland')
    assert.equal(row.linkedJobId, '')
    assert.equal(row.contactId, '')
    assert.equal(row.contactName, '')
})

test('regional Job Books use separate tables and unbounded automatic number formats', () => {
    assert.deepEqual(Object.values(JOB_BOOKS).map(({ key, tableSetName, autoNumberFormat }) => ({ key, tableSetName, autoNumberFormat })), [
        { key: 'auckland', tableSetName: 'gr_jobbookentries', autoNumberFormat: '{SEQNUM:6}' },
        { key: 'waikato', tableSetName: 'gr_waikatojobbookentries', autoNumberFormat: 'WJ{SEQNUM:4}' },
        { key: 'hastings', tableSetName: 'gr_hastingsjobbookentries', autoNumberFormat: 'HJ{SEQNUM:5}' },
        { key: 'christchurch', tableSetName: 'gr_christchurchjobbookentries', autoNumberFormat: 'CJ{SEQNUM:5}' },
    ])
    assert.equal(jobNumberSequence('WJ9999'), 9999)
    assert.equal(jobNumberSequence('WJ10000'), 10000)
    assert.ok(jobNumberSequence('WJ10000') > jobNumberSequence('WJ9999'))
    assert.equal(jobNumberBelongsToBook('146704', JOB_BOOKS.auckland), true)
    assert.equal(jobNumberBelongsToBook('WJ1535', JOB_BOOKS.auckland), false)
    assert.equal(jobNumberBelongsToBook('WJ1535', JOB_BOOKS.waikato), true)
    assert.equal(jobNumberBelongsToBook('WJ15A5', JOB_BOOKS.waikato), false)
    assert.match(managedJobNumberFilter(JOB_BOOKS.waikato), /WJ/)
    assert.equal(managedJobNumberFilter(JOB_BOOKS.auckland), 'gr_jobnumber ne null')
})

test('regional allocation stays gated until migration and automatic cutover seeding', () => {
    const config = readFileSync(new URL('../src/alpha/job-book/jobBookConfig.ts', import.meta.url), 'utf8')
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    const schema = readFileSync(new URL('../scripts/manage-job-book-intake-schema.ps1', import.meta.url), 'utf8')
    const exampleEnvironment = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
    const deployment = readFileSync(new URL('../.github/workflows/azure-static-web-apps-yellow-cliff-068680700.yml', import.meta.url), 'utf8')

    assert.match(config, /VITE_REGIONAL_JOB_BOOKS_ENABLED/)
    assert.match(config, /VITE_REGIONAL_JOB_BOOK_ALLOCATION_ENABLED/)
    assert.match(screen, /regionalAllocationLocked/)
    assert.match(screen, /migrat.*seed/i)
    assert.match(schema, /\[ValidateSet\('Inspect', 'Provision', 'Verify', 'Cutover'\)\]/)
    assert.match(schema, /import its legacy Job Book rows before setting the live sequence/)
    assert.match(schema, /\[Math\]::Max\(\$managedMaximum,\[long\]\$imported\.Maximum\)\+1L/)
    assert.match(exampleEnvironment, /^VITE_REGIONAL_JOB_BOOKS_ENABLED=false$/m)
    assert.match(exampleEnvironment, /^VITE_REGIONAL_JOB_BOOK_ALLOCATION_ENABLED=false$/m)
    assert.match(deployment, /VITE_REGIONAL_JOB_BOOKS_ENABLED: "false"/)
    assert.match(deployment, /VITE_REGIONAL_JOB_BOOK_ALLOCATION_ENABLED: "false"/)
})

test('Job Book Intake persists the selected Contact lookup', () => {
    const api = readFileSync(new URL('../src/alpha/job-book/jobBookApi.ts', import.meta.url), 'utf8')
    const schema = readFileSync(new URL('../scripts/manage-job-book-intake-schema.ps1', import.meta.url), 'utf8')
    const exampleEnvironment = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
    const deployment = readFileSync(new URL('../.github/workflows/azure-static-web-apps-yellow-cliff-068680700.yml', import.meta.url), 'utf8')

    assert.match(api, /gr_Contact\(\$select=gr_contactid,gr_name\)/)
    assert.match(api, /'gr_Contact@odata\.bind'/)
    assert.match(api, /INTAKE_EXPAND_WITHOUT_CONTACT/)
    assert.match(api, /VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED/)
    assert.match(api, /jobBookIntakeContactLookupIsAvailable/)
    assert.match(schema, /Schema='gr_Contact'/)
    assert.match(schema, /Relationship='gr_jobbookentry_Contact_gr_contact'/)
    assert.match(schema, /prvReadgr_SiteContact/)
    assert.match(schema, /prvReadgr_Contact/)
    assert.match(schema, /prvAppendTogr_Contact/)
    assert.match(exampleEnvironment, /^VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED=true$/m)
    assert.match(deployment, /VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED: "true"/)
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

test('Job Book intake reuses the shared Job Equipment field and bounded Customer selector', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    const relationshipFields = readFileSync(new URL('../src/alpha/jobs/components/JobRelationshipFields.tsx', import.meta.url), 'utf8')
    const equipmentField = readFileSync(new URL('../src/alpha/jobs/components/JobEquipmentField.tsx', import.meta.url), 'utf8')
    const sharedSelect = readFileSync(new URL('../src/alpha/shared/searchable-select/SearchableSelect.tsx', import.meta.url), 'utf8')

    assert.match(screen, /import SearchableSelect/)
    assert.match(screen, /import JobEquipmentField/)
    assert.match(screen, /<JobEquipmentField/)
    assert.match(relationshipFields, /import JobEquipmentField/)
    assert.match(relationshipFields, /<JobEquipmentField/)
    assert.match(screen, /import JobSiteContactFields/)
    assert.match(screen, /<JobSiteContactFields/)
    assert.match(relationshipFields, /import JobSiteContactFields/)
    assert.match(relationshipFields, /<JobSiteContactFields/)
    assert.match(screen, /id="job-book-drawer-customer"/)
    assert.match(screen, /onCreateCustomerAndSite=/)
    assert.match(screen, /Use customer and site/)
    assert.match(screen, /does not create master Dataverse records/)
    assert.match(screen, /customerId=\{draft\.customerId\}/)
    assert.match(screen, /applyCustomerSelection/)
    assert.match(screen, /unknownEquipmentOption=\{\{/)
    assert.match(equipmentField, /job-equipment-unknown-option/)
    assert.match(equipmentField, /unknownEquipmentOption\?\.selected/)
    assert.match(screen, /if \(!value \|\| !customerName\) return/)
    assert.match(screen, /setSearchQuery\(customerName\)/)
    assert.doesNotMatch(screen, /<input aria-label="Customer"/)
    assert.match(sharedSelect, /resultLimit\?: number/)
    assert.match(sharedSelect, /matching\.slice\(0, resultLimit\)/)
})

test('unknown Equipment can be deferred without losing Customer and Site context', () => {
    const row = createBlankJobBookRow(0)
    Object.assign(row, {
        equipmentId: 'equipment-1', fleet: 'FN100', equipmentConfigured: true,
        customerId: 'customer-1', customer: 'Example Customer',
        siteId: 'site-1', site: 'Main Site', address: '1 Example Road',
    })

    const deferred = setEquipmentReviewRequired(row, true)
    assert.equal(deferred.equipmentId, '')
    assert.equal(deferred.equipmentConfigured, false)
    assert.equal(deferred.equipmentReviewRequired, true)
    assert.equal(deferred.customerId, 'customer-1')
    assert.equal(deferred.siteId, 'site-1')
    assert.equal(deferred.address, '1 Example Road')
})

test('Intake entries edit through the shared drawer while managed Job navigation stays gated', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')

    assert.match(screen, /openIntakeEntryEditor/)
    assert.match(screen, />Edit entry<\/button>/)
    assert.match(screen, /editingIntakeRow \? 'Edit' : 'Add'/)
    assert.match(screen, /editingIntakeRow \? 'Save changes' : 'Add to Job Book'/)
    assert.match(screen, /const saved = await updateJobBookIntakeRow\(token, draft\)/)
    assert.match(screen, /editingIntakeRow \? draft\.jobNumber : 'Assigned after saving'/)
    assert.match(screen, /allowManagedJobNavigation[\s\S]*Open Job[\s\S]*Managed Job/)
})

test('shared Job Book relationship dropdowns close when focus moves outside them', () => {
    const equipmentField = readFileSync(new URL('../src/alpha/jobs/components/JobEquipmentField.tsx', import.meta.url), 'utf8')
    const customerPicker = readFileSync(new URL('../src/alpha/shared/customer-relationship/CustomerRelationshipPicker.tsx', import.meta.url), 'utf8')
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    const coordination = readFileSync(new URL('../src/alpha/shared/dropdown/exclusiveDropdown.ts', import.meta.url), 'utf8')

    assert.match(equipmentField, /document\.addEventListener\('mousedown', closeOnOutsideClick, true\)/)
    assert.match(equipmentField, /rootRef\.current\?\.contains/)
    assert.match(customerPicker, /document\.addEventListener\('mousedown', closeOnOutsideClick, true\)/)
    assert.match(customerPicker, /rootRef\.current\?\.contains/)
    assert.match(equipmentField, /announceExclusiveDropdownOpen/)
    assert.match(customerPicker, /announceExclusiveDropdownOpen/)
    assert.match(screen, /closeWhenAnotherDropdownOpens\(dropdownId/)
    assert.match(coordination, /exclusive-dropdown-open/)
})

test('Job Book progressively loads shared Staff and bounded Customer Site relationships', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')

    assert.match(screen, /STAFF_DIRECTORY_QUERY_KEY/)
    assert.match(screen, /useOperationalQuery<Mechanic\[]>/)
    assert.match(screen, /searchCustomers\(await getAccessToken\(\), query, signal\)/)
    assert.match(screen, /fetchCustomerSites\(token, customerId, controller\.signal\)/)
    assert.match(screen, /fetchSiteContactsForSite\(token, siteId, controller\.signal\)/)
    assert.match(screen, /new AbortController\(\)/)
    assert.match(screen, /Retry Staff/)
    assert.match(screen, /Retry Customer search/)
    assert.match(screen, /Retry Sites/)
    assert.doesNotMatch(screen, /fetchCustomers\(token\)/)
    assert.doesNotMatch(screen, /fetchSites\(token\)/)
    assert.doesNotMatch(screen, /subscribeToStaffChanges/)
})

test('Job Book rows use bounded Dataverse pages and infinite scrolling', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    const api = readFileSync(new URL('../src/alpha/job-book/jobBookApi.ts', import.meta.url), 'utf8')

    assert.match(api, /JOB_BOOK_PAGE_SIZE = 100/)
    assert.match(api, /continuationLink\s*\?\s*trustedNextLink\(continuationLink\)/)
    assert.match(api, /odata\.maxpagesize=\$\{JOB_BOOK_PAGE_SIZE\}/)
    assert.doesNotMatch(api, /\$top=\$\{JOB_BOOK_PAGE_SIZE\}/)
    assert.doesNotMatch(api, /while \(nextUrl\)/)
    assert.match(screen, /new IntersectionObserver/)
    assert.match(screen, /infiniteScrollSentinelRef/)
    assert.match(screen, /fetchRecentJobBookRows\(token, selectedJobBook, recentNextLink\)/)
    assert.match(screen, /fetchJobBookIntakeRows\(token, selectedJobBook, intakeNextLink\)/)
    assert.match(screen, /filtersActive \? 'Load more entries to continue searching'/)
})

test('Job Book keeps status in the page header without a duplicated workspace title', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /className="job-book-header-summary"/)
    assert.match(screen, /aria-label="Job Book status"/)
    assert.doesNotMatch(screen, /job-book-workspace-header/)
    assert.match(screen, /<h1>\{selectedJobBook\.label\} Job Book<\/h1>/)
    assert.doesNotMatch(screen, /<h1>Job Book Legacy<\/h1>/)
})
