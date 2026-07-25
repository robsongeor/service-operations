import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dashboardSource = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
const drawerSource = readFileSync(new URL('../src/alpha/customers/SiteSettingsDrawer.tsx', import.meta.url), 'utf8')

test('Sites tab uses one accessible settings-icon entry point', () => {
    assert.match(dashboardSource, /<PageSettingsButton/)
    assert.match(dashboardSource, /ariaLabel=\{`Site settings for \$\{site\.gr_name\}`\}/)
    assert.doesNotMatch(dashboardSource, />\s*Bulk Add Equipment\s*<\/button>/)
    assert.doesNotMatch(dashboardSource, />\s*Edit Site\s*<\/button>/)
})

test('combined Site Settings drawer exposes the required state-preserving tabs', () => {
    assert.match(drawerSource, /title="Site Settings"/)
    assert.match(drawerSource, /label: 'Details'/)
    assert.match(drawerSource, /label: 'Settings'/)
    assert.match(drawerSource, /label: 'Bulk Add Equipment'/)
    assert.match(drawerSource, /hidden=\{activeTab !== 'details'\}/)
    assert.match(drawerSource, /hidden=\{activeTab !== 'settings'\}/)
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
