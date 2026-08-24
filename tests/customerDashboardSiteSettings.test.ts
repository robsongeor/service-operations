import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    getCustomerDashboardViewStateKey,
    restoreCustomerDashboardSelection,
    saveCustomerDashboardSelection,
} from '../src/alpha/customers/customerDashboardViewState.ts'

const dashboardSource = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
const drawerSource = readFileSync(new URL('../src/alpha/customers/SiteSettingsDrawer.tsx', import.meta.url), 'utf8')
const runDrawerSource = readFileSync(new URL('../src/alpha/site-checks/components/RunSiteCheckDrawer.tsx', import.meta.url), 'utf8')
const siteCheckDetailsSource = readFileSync(new URL('../src/alpha/site-checks/components/SiteCheckDetailsDrawer.tsx', import.meta.url), 'utf8')
const scheduleSettingsSource = readFileSync(new URL('../src/alpha/site-checks/components/SiteCheckScheduleSettings.tsx', import.meta.url), 'utf8')
const searchableSelectSource = readFileSync(new URL('../src/alpha/shared/searchable-select/SearchableSelect.tsx', import.meta.url), 'utf8')
const customerDataSource = readFileSync(new URL('../src/alpha/customers/useCustomerDashboardData.ts', import.meta.url), 'utf8')

function createStorage() {
    const values = new Map<string, string>()
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
    }
}

test('Customer Dashboard selection persists per signed-in user for the browser session', () => {
    const storage = createStorage()
    const firstUserKey = getCustomerDashboardViewStateKey('first-user')
    const secondUserKey = getCustomerDashboardViewStateKey('second-user')

    saveCustomerDashboardSelection(firstUserKey, 'customer-123', storage)

    assert.equal(restoreCustomerDashboardSelection(firstUserKey, storage), 'customer-123')
    assert.equal(restoreCustomerDashboardSelection(secondUserKey, storage), '')
})

test('Customer Dashboard selection storage fails safely and clears an explicit deselection', () => {
    const storage = createStorage()
    const storageKey = getCustomerDashboardViewStateKey('user')
    saveCustomerDashboardSelection(storageKey, 'customer-123', storage)
    saveCustomerDashboardSelection(storageKey, '', storage)
    assert.equal(restoreCustomerDashboardSelection(storageKey, storage), '')

    storage.setItem(storageKey, '{invalid json')
    assert.equal(restoreCustomerDashboardSelection(storageKey, storage), '')
})

test('Customer Dashboard opens and focuses the Customer search when the page mounts', () => {
    assert.match(dashboardSource, /<SearchableSelect[\s\S]*?id="customer-dashboard-customer"[\s\S]*?autoFocus/)
    assert.match(searchableSelectSource, /const \[open, setOpen\] = useState\(autoFocus && !disabled\)/)
    assert.match(searchableSelectSource, /requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/)
})

test('Sites tab uses one accessible settings-icon entry point', () => {
    assert.match(dashboardSource, /<PageSettingsButton/)
    assert.match(dashboardSource, /siteSettingsTriggerRefs\.current\[site\.gr_siteid\] = element/)
    assert.match(dashboardSource, /ariaLabel=\{`Site settings for \$\{site\.gr_name\}`\}/)
    assert.doesNotMatch(dashboardSource, />\s*Bulk Add Equipment\s*<\/button>/)
    assert.doesNotMatch(dashboardSource, />\s*Edit Site\s*<\/button>/)
    assert.doesNotMatch(dashboardSource, /Transfer Equipment|EquipmentTransferDrawer|transferSite/)
})

test('Site Settings restores focus to the invoking Site action when it closes', () => {
    assert.match(dashboardSource, /const trigger = siteSettingsTriggerRefs\.current\[siteSettingsSite\.gr_siteid\]/)
    assert.match(dashboardSource, /window\.setTimeout\(\(\) => trigger\?\.focus\(\), 0\)/)
})

test('combined Site Settings drawer exposes the required state-preserving tabs', () => {
    assert.match(drawerSource, /title="Site Settings"/)
    assert.match(drawerSource, /label: 'Details'/)
    assert.match(drawerSource, /label: 'Settings'/)
    assert.match(drawerSource, /label: 'Bulk Add Equipment'/)
    assert.match(drawerSource, /hidden=\{activeTab !== 'details'\}/)
    assert.match(drawerSource, /hidden=\{activeTab !== 'settings'\}/)
    assert.doesNotMatch(drawerSource, /\{ id: 'site-checks' as const, label: 'Site Checks'/)
})

test('Site Checks settings use the focused hook and preserve the existing drawer workflows', () => {
    assert.match(dashboardSource, /useSiteChecks\(persistedCustomerSiteIds\)/)
    assert.match(dashboardSource, /buildSiteCheckDashboardProjection/)
    assert.match(dashboardSource, /aria-live="polite"/)
    assert.match(dashboardSource, /sitesHeadingRef\.current\?\.focus/)
    assert.match(dashboardSource, /Object\.fromEntries\(matchingSiteIds/)
    assert.match(siteCheckDetailsSource, /<SiteCheckScheduleSettings/)
    assert.match(scheduleSettingsSource, /<FormSwitch/)
    assert.match(scheduleSettingsSource, /SITE_CHECK_FREQUENCY_OPTIONS/)
    assert.match(scheduleSettingsSource, /type="date"/)
    assert.match(scheduleSettingsSource, /Initial check date/)
    assert.match(scheduleSettingsSource, /Next check date/)
    assert.match(scheduleSettingsSource, /not a completion deadline/)
    assert.match(scheduleSettingsSource, /frequency automatically schedules every later check/)
    assert.doesNotMatch(scheduleSettingsSource, /Following check date/)
    assert.doesNotMatch(scheduleSettingsSource, />Initial date</)
    assert.match(scheduleSettingsSource, /Existing Site Check history and generated Jobs are retained/)
    assert.match(scheduleSettingsSource, /Disable Site Checks/)
    assert.match(scheduleSettingsSource, /SITE_CHECK_EQUIPMENT_SCOPES\.MANUAL_SELECTION/)
    assert.match(scheduleSettingsSource, /multiple/)
    assert.match(scheduleSettingsSource, /Search fleet, serial, make or model/)
    assert.match(scheduleSettingsSource, /Select at least one Equipment record for Manual Selection/)
    assert.match(runDrawerSource, /selectedEquipmentIds/)
})

test('bulk import receives the selected Customer and Site context', () => {
    assert.match(dashboardSource, /customerId=\{selectedCustomer\.gr_customerid\}/)
    assert.match(dashboardSource, /siteId=\{bulkImportSite\.gr_siteid\}/)
    assert.match(dashboardSource, /onCreate=\{\(input\) => createDashboardEquipment\(input, bulkImportSite\)\}/)
    assert.match(dashboardSource, /setBulkImportSite\(siteSettingsSite\)/)
})

test('details and settings retain the existing service workflows', () => {
    assert.match(dashboardSource, /onSaveDetails=\{\(name, address\) => updateSites/)
    assert.match(dashboardSource, /onSaveSettings=\{\(profile, equipmentIds\) => updateSiteMaintenanceSettings/)
    assert.match(drawerSource, /form="site-settings-details-form"/)
    assert.match(drawerSource, /onClick=\{requestSettingsSave\}/)
})

test('due Sites open the shared-pattern Run Site Check drawer with stable retry identity', () => {
    assert.match(siteCheckDetailsSource, />Start Site Check<\/button>/)
    assert.match(dashboardSource, /<RunSiteCheckDrawer/)
    assert.match(dashboardSource, /onStart=\{siteChecks\.startSiteCheck\}/)
    assert.match(runDrawerSource, /<EditDrawerShell/)
    assert.match(runDrawerSource, /<SearchableMechanicSelect/)
    assert.match(runDrawerSource, /useRef\(crypto\.randomUUID\(\)\)/)
    assert.match(runDrawerSource, /requestKey: requestKey\.current/)
    assert.match(runDrawerSource, /role="alert"/)
    assert.match(runDrawerSource, /Inactive/)
    assert.match(runDrawerSource, /availabilityOverrides/)
    assert.match(runDrawerSource, /Site Check availability for/)
    assert.match(runDrawerSource, /Create \$\{includedEquipment\.length\} Site Check Job/)
    assert.match(dashboardSource, /setSiteCheckDetails\(\{ site: runSiteCheckSite, check: created, tab: 'summary' \}\)/)
})

test('every Site uses one consistent Site Check entry point', () => {
    assert.match(dashboardSource, /siteCheck\?\.schedule\.gr_enabled && <span className="customer-site-check-summary"/)
    assert.match(dashboardSource, />\s*Site Check\s*<\/button>/)
    assert.match(dashboardSource, /check: siteCheck\?\.activeSiteCheck,[\s\S]*?tab: 'summary'/)
    assert.doesNotMatch(dashboardSource, /View Current Site Check|Site Check History|>\s*Run Site Check\s*<\/button>/)
})

test('Site Check history opens from cached data and retains an exact-Job fallback', () => {
    assert.match(dashboardSource, /fetchJobForDrawer,/)
    assert.match(
        dashboardSource,
        /onOpenJob=\{\(jobId, trigger\) => \{[\s\S]*?if \(job\) \{[\s\S]*?setEditingJob\(job\)[\s\S]*?fetchJobForDrawer\(jobId\)\.then\(\(refreshedJob\)/,
    )
})

test('Customer Dashboard loads selected-customer collections without starting global Jobs or Equipment reads', () => {
    assert.match(dashboardSource, /useCustomerDashboardData\(selectedCustomerId, activeTab === 'quotes'\)/)
    assert.match(dashboardSource, /useEquipmentManager\(\{[\s\S]*?loadGlobalOperationalData: false/)
    assert.match(dashboardSource, /useJobs\(\{[\s\S]*?loadGlobalOperationalData: false/)
    assert.match(customerDataSource, /fetchCustomerSites/)
    assert.match(customerDataSource, /fetchEquipmentForSites/)
    assert.match(customerDataSource, /fetchJobsForSites/)
    assert.match(customerDataSource, /fetchEquipmentServicePlansForEquipment/)
})

test('Customer Dashboard scoped reads retain bounded cache and explicit mutation reconciliation', () => {
    assert.match(customerDataSource, /cacheTimeMs: 2 \* 60_000/)
    assert.match(customerDataSource, /staleTimeMs: 20_000/)
    assert.match(customerDataSource, /const scheduleOptionsKey = useMemo\(/)
    assert.match(customerDataSource, /const officeUpdatesKey = useMemo\(/)
    assert.match(customerDataSource, /key: scheduleOptionsKey/)
    assert.match(customerDataSource, /key: officeUpdatesKey/)
    assert.match(dashboardSource, /onScopedDataChanged: customerData\.refetch/)
    assert.match(dashboardSource, /await customerData\.refetch\(\)/)
})
