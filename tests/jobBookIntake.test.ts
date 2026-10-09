import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    createBlankJobBookRow,
    applyIntakeCustomerToRow,
    jobBookEquipmentFallback,
    jobBookLocationFieldsVisible,
    jobBookLocationSummaryVisible,
    getPromotionReadiness,
    JOB_BOOK_ENTRY_STAGES,
    MANAGED_JOB_ENTRY_MARKER_COLUMNS,
    setEquipmentReviewRequired,
    splitSiteAddress,
} from '../src/alpha/job-book/jobBookPrototype.ts'
import { JOB_BOOKS, jobNumberBelongsToBook, jobNumberSequence, managedJobNumberFilter } from '../src/alpha/job-book/jobBookConfig.ts'
import { fetchJobBookSearchBatch, intakeJobBookSearchFilter, managedJobBookSearchFilter } from '../src/alpha/job-book/jobBookApi.ts'
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

test('saved equipment snapshots provide display details without inventing a master link or changing location', () => {
    const row = { ...createBlankJobBookRow(0), fleet: '123', serial: 'serial-123', make: 'Sample make', model: 'Sample model', customerId: 'saved-customer', siteId: 'saved-site' }
    const before = structuredClone(row)
    assert.deepEqual(jobBookEquipmentFallback(row), { gr_equipmentid: '', gr_fleet: '123', gr_serial: 'serial-123', gr_make: 'Sample make', gr_model: 'Sample model' })
    assert.deepEqual(row, before)
    assert.equal(jobBookEquipmentFallback({ ...row, fleet: '' })?.gr_serial, 'serial-123')
})

test('linked Equipment missing from the directory retains its ID; unknown and empty selections have no fallback', () => {
    const blank = createBlankJobBookRow(0)
    assert.equal(jobBookEquipmentFallback({ ...blank, equipmentId: 'linked-equipment' })?.gr_equipmentid, 'linked-equipment')
    assert.equal(jobBookEquipmentFallback(blank), undefined)
    assert.equal(jobBookEquipmentFallback({ ...blank, fleet: '   ', serial: ' ' }), undefined)
    assert.equal(jobBookEquipmentFallback({ ...blank, fleet: 'old-snapshot', equipmentReviewRequired: true }), undefined)
    const source = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(source, /selectedEquipmentFallback=\{jobBookEquipmentFallback\(draft\)\}/)
})

test('new Intake hides Customer, Site and Contact until an equipment decision; existing entries remain editable', () => {
    const blank = createBlankJobBookRow(0)
    const withoutEquipment = { ...blank, customerId: 'previous-customer' }
    assert.equal(jobBookLocationFieldsVisible(blank), false)
    assert.equal(jobBookLocationFieldsVisible(withoutEquipment), false)
    assert.equal(jobBookLocationFieldsVisible({ ...blank, equipmentId: 'existing-equipment' }), true)
    assert.equal(jobBookLocationFieldsVisible({ ...blank, equipmentId: 'prototype-machine' }), true)
    assert.equal(jobBookLocationFieldsVisible(setEquipmentReviewRequired(blank, true)), true)
    assert.equal(jobBookLocationFieldsVisible(setEquipmentReviewRequired(setEquipmentReviewRequired(blank, true), false)), false)
    assert.equal(jobBookLocationFieldsVisible(blank, true), true)
    const source = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(source, /showIntakeLocationFields && <>[\s\S]*<JobEquipmentLocation[\s\S]*<CustomerPicker[\s\S]*<JobSiteContactFields[\s\S]*<\/>\}/)
    assert.match(source, /!intakeDrawerOpen \|\| !showIntakeLocationFields/)
})

test('editing linked equipment defaults to a location summary until Edit is explicitly chosen', () => {
    const row = { ...createBlankJobBookRow(0), equipmentId: 'equipment-1', customerId: 'customer-1', siteId: 'site-1' }
    const before = structuredClone(row)
    assert.equal(jobBookLocationSummaryVisible(row, true), true)
    assert.equal(jobBookLocationSummaryVisible(row, true, true), false)
    assert.equal(jobBookLocationSummaryVisible(row, false), false)
    for (const missing of ['customerId', 'siteId']) {
        assert.equal(jobBookLocationSummaryVisible({ ...row, [missing]: '' }, true), false, missing)
    }
    assert.deepEqual(row, before)
})

test('unknown or absent Equipment still shows saved Customer/Site as a tile until Edit is chosen', () => {
    const saved = { ...createBlankJobBookRow(0), customerId: 'customer-1', customer: 'Saved Customer', siteId: 'site-1', site: 'Saved Site', address: 'Saved address' }
    for (const row of [saved, setEquipmentReviewRequired(saved, true)]) {
        const before = structuredClone(row)
        assert.equal(jobBookLocationSummaryVisible(row, true), true)
        assert.equal(jobBookLocationSummaryVisible(row, true, true), false)
        assert.equal(jobBookLocationSummaryVisible(row, true, false), true, 'reopening restores the tile')
        assert.equal(jobBookLocationSummaryVisible(row, false), false, 'new Intake keeps its selectors')
        assert.deepEqual(row, before)
    }
})

test('saved snapshot-only Customer/Site also use the tile without requiring master lookups', () => {
    const row = { ...createBlankJobBookRow(0), customer: 'Snapshot Customer', site: 'Snapshot Site', equipmentReviewRequired: true }
    assert.equal(jobBookLocationSummaryVisible(row, true), true)
    assert.equal(jobBookLocationSummaryVisible(row, true, true), false)
    for (const missing of ['customer', 'site']) {
        assert.equal(jobBookLocationSummaryVisible({ ...row, [missing]: '  ' }, true), false, 'incomplete entries retain selectors')
    }
    assert.equal(jobBookLocationSummaryVisible(createBlankJobBookRow(0), true), false)
})

test('newly created Customer/Site snapshots become a tile and explicit Edit restores controls', () => {
    const row = { ...createBlankJobBookRow(0), equipmentId: 'prototype-machine', fleet: 'Sample machine', customerId: 'prototype-customer-new', customer: 'Created customer', siteId: 'prototype-site-new', site: 'Created site', address: '1 Sample Road' }
    const before = structuredClone(row)
    assert.equal(jobBookLocationSummaryVisible(row, false), false, 'ordinary incomplete/unconfirmed creation stays editable')
    assert.equal(jobBookLocationSummaryVisible(row, true), true, 'successful Customer/Site creation confirms the location')
    assert.equal(jobBookLocationSummaryVisible(row, true, true), false, 'Edit remains explicit')
    assert.equal(jobBookLocationSummaryVisible(row, true, false), true, 'creating again restores the tile')
    assert.deepEqual(row, before, 'presentation must not change the machine or its location')
    assert.equal(jobBookLocationSummaryVisible({ ...row, siteId: '', site: '' }, true), false)
    assert.equal(jobBookLocationSummaryVisible({ ...row, customerId: '', customer: '' }, true), false)
})

test('Intake creation confirms only the finished Customer/Site and reuses the existing summary', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /jobBookLocationSummaryVisible\(draft, Boolean\(editingIntakeRow\) \|\| createdEntryLocation, editingEntryLocation\)/)
    const create = screen.slice(screen.indexOf('onCreateCustomerAndSite={async'), screen.indexOf('}} /></div>}', screen.indexOf('onCreateCustomerAndSite={async')))
    assert.match(create, /setDraft\([\s\S]*prototype-customer-[\s\S]*prototype-site-[\s\S]*setCreatedEntryLocation\(true\)[\s\S]*setEditingEntryLocation\(false\)/)
    assert.match(create, /if \(UNIFIED_JOB_RUNTIME && !editingIntakeRow\)/)
    assert.doesNotMatch(create.slice(create.indexOf("setIntakeError('')")), /createCustomer\(|createSite\(|fetch\(/)
    assert.match(screen, /createActionLabel="Create customer"/)
    assert.doesNotMatch(screen, /createActionLabel="Use customer and site"/)
})

test('production unified workflow registers new Job Book entries atomically', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /useJobRegistration\(`\$\{account\?\.homeAccountId\}\.job-book`, getAccessToken, UNIFIED_JOB_RUNTIME\)/)
    assert.match(screen, /else if \(UNIFIED_JOB_RUNTIME\) \{[\s\S]*registration\.submit\(\{ kind: 'register'/)
    assert.match(screen, /const persist = UNIFIED_JOB_RUNTIME && !editingIntakeRow/)
    assert.match(screen, /UNIFIED_JOB_RUNTIME && registration\.pending/)
})

test('created-location presentation resets between entries and regional books', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    for (const [start, end] of [['const openNewIntakeEntry =', 'const openManageJob ='], ['const openIntakeEntryEditor =', 'const createLocalIntakeEquipment ='], ['const switchJobBook =', 'const searchJobBookCustomers =']]) {
        assert.match(screen.slice(screen.indexOf(start), screen.indexOf(end)), /setCreatedEntryLocation\(false\)/)
    }
})

test('new and edited entries reuse the same location tile without replacing saved locations', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    const location = readFileSync(new URL('../src/alpha/jobs/components/JobEquipmentLocation.tsx', import.meta.url), 'utf8')
    const summary = readFileSync(new URL('../src/alpha/jobs/components/JobLocationSummary.tsx', import.meta.url), 'utf8')
    assert.match(screen, /<JobLocationSummary customer=\{draft\.customer\} site=\{draft\.site\} address=\{draft\.address\}/)
    assert.match(screen, /onEdit=\{\(\) => setEditingEntryLocation\(true\)\}/)
    assert.match(screen, /showSite=\{!locationEquipment && !showEntryLocationSummary\}/)
    assert.match(screen, /if \(showEntryLocationSummary\) return/)
    assert.match(screen, /const selectIntakeEquipment = \(item: Equipment \| undefined\) => \{\s*setEditingEntryLocation\(false\)/)
    assert.match(screen, /const openNewIntakeEntry = \(\) => \{\s*setEditingEntryLocation\(false\)/)
    assert.match(screen, /setEditingEntryLocation\(false\)[\s\S]*setEditingIntakeRow\(row\)/)
    assert.match(screen, /!editingIntakeRow && isPersistedEquipmentId/)
    assert.match(location, /<JobLocationSummary customer=\{site\?\.gr_Customer\?\.gr_name\}/)
    assert.match(summary, /onClick=\{onEdit\}>Edit<\/button>/)
    assert.doesNotMatch(summary, /useEquipmentLocation|fetch|acquireDataverseAccessToken/)
})

test('Customer selection preserves unknown equipment or local machine details while clearing stale Site and Contact', () => {
    const blank = createBlankJobBookRow(0)
    for (const selected of [setEquipmentReviewRequired(blank, true), { ...blank, equipmentId: 'prototype-machine', fleet: 'TEST', equipmentConfigured: true }]) {
        const before = { ...selected, customerId: 'old', siteId: 'old-site', contactId: 'old-contact', address: 'Old address' }
        const updated = applyIntakeCustomerToRow(before, 'new', 'New Customer')
        assert.equal(jobBookLocationFieldsVisible(updated), true)
        assert.equal(updated.equipmentId, before.equipmentId)
        assert.equal(updated.equipmentReviewRequired, before.equipmentReviewRequired)
        assert.equal(updated.fleet, before.fleet)
        assert.equal(updated.siteId, '')
        assert.equal(updated.contactId, '')
        assert.equal(updated.address, '')
        assert.equal(before.siteId, 'old-site')
    }
})

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

    const equipmentSection = readFileSync(new URL('../src/alpha/jobs/components/JobEquipmentAndLocationFields.tsx', import.meta.url), 'utf8')
    assert.match(screen, /import JobEquipmentAndLocationFields/)
    assert.match(screen, /<JobEquipmentAndLocationFields/)
    assert.match(relationshipFields, /import JobEquipmentAndLocationFields/)
    assert.match(relationshipFields, /<JobEquipmentAndLocationFields/)
    assert.match(equipmentSection, /import JobEquipmentField/)
    assert.match(equipmentSection, /<JobEquipmentField/)
    assert.match(screen, /import JobSiteContactFields/)
    assert.match(screen, /<JobSiteContactFields/)
    assert.match(relationshipFields, /import JobSiteContactFields/)
    assert.match(relationshipFields, /<JobSiteContactFields/)
    assert.match(screen, /id="job-book-drawer-customer"/)
    assert.match(screen, /onCreateCustomerAndSite=/)
    assert.match(screen, /createActionLabel="Create customer"/)
    assert.match(screen, /does not create master Dataverse records/)
    assert.match(screen, /customerId=\{draft\.customerId\}/)
    assert.match(screen, /applyCustomerSelection/)
    assert.match(screen, /unknownEquipmentOption=\{\{/)
    assert.match(equipmentField, /job-equipment-unknown-option/)
    assert.match(equipmentField, /unknownEquipmentOption\?\.selected/)
    assert.match(screen, /input\.customerId === value && input\.customerName === customerName \? input\.text : customerName/)
    assert.match(screen, /value && customerName \? \[\{ gr_customerid: value, gr_name: customerName \}\] : \[\]/)
    assert.match(screen, /customerId === row\.customerId && customer === row\.customer/)
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

test('Intake and managed Job entries open their editors within the Job Book', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')

    assert.match(screen, /openIntakeEntryEditor/)
    assert.match(screen, />Edit entry<\/button>/)
    assert.match(screen, /editingIntakeRow \? 'Edit' : 'Add'/)
    assert.match(screen, /editingIntakeRow \? 'Save changes' : 'Add to Job Book'/)
    assert.match(screen, /const saved = await updateJobBookIntakeRow\(token, draft, !canAssignInitialTechnician\)/)
    assert.match(screen, /editingIntakeRow \? draft\.jobNumber : 'Assigned after saving'/)
    assert.match(screen, /onClick=\{\(\) => setCorrectingJobId\(row\.linkedJobId\)\}[\s\S]*Open Job/)
    assert.doesNotMatch(screen, /navigate\(`\/jobs\?jobId=/)
})

test('unconfigured equipment reopens the existing Intake drawer without a second editor', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /const canEditIntake = isEditableJobBookIntake\(row\)/)
    assert.match(screen, /row\.equipmentReviewRequired\s*\? canEditIntake\s*\? <button/)
    assert.ok(screen.includes('onClick={() => openIntakeEntryEditor(row)}><strong>Equipment not configured</strong><small>Edit entry to set equipment</small>'))
    assert.match(screen, /const openIntakeEntryEditor = \(row: JobBookRow\) => \{\s*if \(!isEditableJobBookIntake\(row\)\) return/)
    assert.match(screen, /setEditingIntakeRow\(row\)[\s\S]*setDraft\(\{ \.\.\.row \}\)[\s\S]*setIntakeDrawerOpen\(true\)/)
    assert.match(screen, /if \(editingIntakeRow\) \{\s*const saved = await updateJobBookIntakeRow\(token, draft, !canAssignInitialTechnician\)/)
    assert.match(screen, /<JobEquipmentAndLocationFields[\s\S]*onChange=\{selectIntakeEquipment\}/)
    assert.doesNotMatch(screen, /openMachineDialog|machineDialogOpen|machine-dialog-title|setEditingRow|saveEditedRow|Click to add Fleet or Serial/)
})

test('shared Job Book relationship dropdowns close when focus moves outside them', () => {
    const equipmentField = readFileSync(new URL('../src/alpha/jobs/components/JobEquipmentField.tsx', import.meta.url), 'utf8')
    const customerPicker = readFileSync(new URL('../src/alpha/shared/customer-relationship/CustomerRelationshipPicker.tsx', import.meta.url), 'utf8')
    const searchableSelect = readFileSync(new URL('../src/alpha/shared/searchable-select/SearchableSelect.tsx', import.meta.url), 'utf8')
    const mechanicPicker = readFileSync(new URL('../src/alpha/jobs/components/SearchableMechanicSelect.tsx', import.meta.url), 'utf8')
    const coordination = readFileSync(new URL('../src/alpha/shared/dropdown/exclusiveDropdown.ts', import.meta.url), 'utf8')

    assert.match(equipmentField, /document\.addEventListener\('mousedown', closeOnOutsideClick, true\)/)
    assert.match(equipmentField, /rootRef\.current\?\.contains/)
    assert.match(customerPicker, /<SearchableSelect/)
    assert.match(searchableSelect, /document\.addEventListener\('mousedown', close\)/)
    assert.match(searchableSelect, /rootRef\.current\?\.contains/)
    assert.match(equipmentField, /announceExclusiveDropdownOpen/)
    assert.match(searchableSelect, /announceExclusiveDropdownOpen/)
    assert.match(mechanicPicker, /closeWhenAnotherDropdownOpens\(resultsId/)
    assert.match(mechanicPicker, /document\.addEventListener\('mousedown', closeOnOutsideClick, true\)/)
    assert.match(coordination, /exclusive-dropdown-open/)
})

test('Equipment Change opens a focused replacement search without clearing selected relationships', () => {
    const field = readFileSync(new URL('../src/alpha/jobs/components/JobEquipmentField.tsx', import.meta.url), 'utf8')
    const change = field.slice(field.indexOf('const changeEquipment ='), field.indexOf('const select ='))
    assert.match(change, /setEquipmentSearch\(''\)/)
    assert.match(change, /setActiveIndex\(0\)/)
    assert.match(change, /openSearch\(\)/)
    assert.doesNotMatch(change, /onChange|clear\(|setCreatedSelection/)
    assert.match(field, /aria-label="Change selected equipment" onClick=\{changeEquipment\}/)
    assert.match(field, /aria-label="Change unknown equipment selection" onClick=\{changeEquipment\}/)
    assert.match(field, /if \(searchOpen\) searchInputRef\.current\?\.focus\(\)/)
    assert.match(field, /<input ref=\{searchInputRef\} role="combobox"/)
})

test('Equipment search dismissal restores the tile; only deliberate selections replace or clear it', () => {
    const field = readFileSync(new URL('../src/alpha/jobs/components/JobEquipmentField.tsx', import.meta.url), 'utf8')
    assert.match(field, /selectedEquipment && !searchOpen/)
    assert.match(field, /unknownEquipmentOption\?\.selected && !searchOpen/)
    assert.match(field, /event\.key === 'Escape' && searchOpen[\s\S]*event\.stopPropagation\(\); restoreChangeFocusRef\.current = true; setSearchOpen\(false\)/)
    assert.match(field, /changeButtonRef\.current\?\.focus\(\)/)
    const select = field.slice(field.indexOf('const select ='), field.indexOf('const clear ='))
    assert.match(select, /unknownEquipmentOption\?\.onChange\(false\)/)
    assert.match(select, /onChange\(item\)/)
    const clear = field.slice(field.indexOf('const clear ='), field.indexOf('const createEquipment ='))
    assert.match(clear, /onChange\(undefined\)/)
    assert.match(field, /onClick=\{clear\}>No Equipment/)
    assert.match(field, /select\(created\)/)
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
    const customerField = readFileSync(new URL('../src/alpha/jobs/components/JobCustomerField.tsx', import.meta.url), 'utf8')
    assert.match(customerField, /onRetrySearch=\{search\.retry\}/)
    assert.match(screen, /onRetrySites=\{\(\) => setIntakeSiteLoadAttempt/)
    assert.doesNotMatch(screen, /fetchCustomers\(token\)/)
    assert.doesNotMatch(screen, /fetchSites\(token\)/)
    assert.doesNotMatch(screen, /subscribeToStaffChanges/)
})

test('Job Book rows use bounded Dataverse pages, server search and infinite scrolling', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    const api = readFileSync(new URL('../src/alpha/job-book/jobBookApi.ts', import.meta.url), 'utf8')

    assert.match(api, /JOB_BOOK_PAGE_SIZE = 100/)
    assert.match(api, /continuationLink\s*\?\s*trustedNextLink\(continuationLink\)/)
    assert.match(api, /odata\.maxpagesize=\$\{options\.pageSize \?\? JOB_BOOK_PAGE_SIZE\}/)
    assert.doesNotMatch(api, /\$top=\$\{JOB_BOOK_PAGE_SIZE\}/)
    assert.doesNotMatch(api, /while \(nextUrl\)/)
    assert.match(screen, /new IntersectionObserver/)
    assert.match(screen, /infiniteScrollSentinelRef/)
    assert.match(screen, /fetchRecentJobBookRows\(token, selectedJobBook, recentNextLink\)/)
    assert.match(screen, /fetchJobBookIntakeRows\(token, selectedJobBook, intakeNextLink\)/)
    assert.match(screen, /fetchJobBookSearchBatch/)
    assert.match(screen, /}, 350\)/)
    assert.match(screen, /filtersActive \? 'Load more results'/)
    assert.match(api, /remaining = JOB_BOOK_PAGE_SIZE/)
})

test('GreenTree entry is automated while Timecloud remains an explicit office marker', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /requestGreenTreeJobReconciliation\(token\)/)
    assert.match(screen, /row\.entered \? 'In GreenTree' : 'Not confirmed'/)
    assert.doesNotMatch(screen, /onChange=\{\(event\) => void updateRowField\(row, 'entered'/)
    assert.match(screen, /onChange=\{\(event\) => void updateRowField\(row, 'timecloudEntered'/)
})

test('Job Book server filters cover visible columns, escape input and use Auckland dates', () => {
    const filters = { search: "Godfrey's", date: '2026-10-07', mechanic: 'Ricardo', equipment: 'FN2131', customerSite: 'Kerrs' }
    const managed = managedJobBookSearchFilter(JOB_BOOKS.auckland, filters)
    const intake = intakeJobBookSearchFilter(filters)

    assert.match(managed, /gr_jobnumber ne null/)
    assert.match(managed, /contains\(gr_description,'Godfrey''s'\)/)
    assert.match(managed, /contains\(gr_Equipment\/gr_fleet,'FN2131'\)/)
    assert.match(managed, /contains\(gr_Site\/gr_Customer\/gr_name,'Kerrs'\)/)
    assert.match(managed, /createdon ge 2026-10-06T11:00:00\.000Z/)
    assert.match(managed, /createdon lt 2026-10-07T11:00:00\.000Z/)
    assert.match(intake, /contains\(gr_customersnapshot,'Kerrs'\)/)
    assert.match(intake, /contains\(gr_customerpo,'Godfrey''s'\)/)
})

test('Job Book search downloads no more than 100 records in its first batch', async () => {
    const originalFetch = globalThis.fetch
    const preferences: string[] = []
    globalThis.fetch = async (input, init) => {
        preferences.push(new Headers(init?.headers).get('Prefer') ?? '')
        const managed = String(input).includes('/gr_jobs?')
        const value = Array.from({ length: 50 }, (_, index) => managed ? {
            gr_jobid: `job-${index}`,
            createdon: '2026-10-07T00:00:00Z',
            gr_jobnumber: String(147000 + index),
            gr_ordernumber: null,
            gr_description: 'Matching job',
            gr_gtentered: false,
            gr_timecloudentered: false,
        } : {
            gr_jobbookentryid: `intake-${index}`,
            createdon: '2026-10-07T00:00:00Z',
            gr_jobnumber: String(148000 + index),
            gr_stage: 122830000,
            gr_mechanictext: null,
            gr_fleetsnapshot: null,
            gr_serialsnapshot: null,
            gr_makesnapshot: null,
            gr_modelsnapshot: null,
            gr_customersnapshot: null,
            gr_sitesnapshot: null,
            gr_addresssnapshot: null,
            gr_addressverified: false,
            gr_addressnotfoundconfirmed: false,
            gr_description: 'Matching intake',
            gr_customerpo: null,
            gr_entered: false,
            gr_timecloudentered: false,
            gr_equipmentreviewrequired: true,
        })
        return new Response(JSON.stringify({ value }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    try {
        const filters = { search: 'Matching', date: '', mechanic: '', equipment: '', customerSite: '' }
        const batch = await fetchJobBookSearchBatch('token', JOB_BOOKS.auckland, filters)
        assert.equal(batch.recentRecords.length + batch.intakeRecords.length, 100)
        assert.deepEqual(preferences, ['odata.maxpagesize=50', 'odata.maxpagesize=50'])
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Job Book keeps status in the page header without a duplicated workspace title', () => {
    const screen = readFileSync(new URL('../src/alpha/job-book/JobBookPrototypeScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /className="job-book-header-summary"/)
    assert.match(screen, /aria-label="Job Book status"/)
    assert.doesNotMatch(screen, /job-book-workspace-header/)
    assert.match(screen, /<h1>\{selectedJobBook\.label\} Job Book<\/h1>/)
    assert.doesNotMatch(screen, /<h1>Job Book Legacy<\/h1>/)
})

test('Job Book create drawer does not double-divide the Scheduling section', () => {
    const styles = readFileSync('src/alpha/job-book/JobBookPrototypeScreen.css', 'utf8')
    assert.match(styles, /\.job-book-intake-section\s*>\s*\.job-schedule-section\s*\{[^}]*border-top:\s*0;/s)
})
