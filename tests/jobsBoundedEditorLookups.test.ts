import assert from 'node:assert/strict'
import test from 'node:test'
import {
    buildCustomerSearchUrl,
    buildCustomerSitesUrl,
    buildEquipmentSearchUrl,
    buildSiteContactsUrl,
} from '../src/alpha/jobs/services/jobRelationshipLookupUrls.ts'

test('Job editor relationship lookups are bounded and server filtered', () => {
        const root = 'https://example.crm.dynamics.com'
        const equipmentUrl = new URL(buildEquipmentSearchUrl(root, "FN'12"))
        assert.equal(equipmentUrl.searchParams.get('$top'), '8')
        assert.match(equipmentUrl.searchParams.get('$filter') ?? '', /contains\(gr_fleet,'FN''12'\)/)
        assert.match(equipmentUrl.searchParams.get('$select') ?? '', /gr_alternatefleetnumbers/)

        const customerUrl = new URL(buildCustomerSearchUrl(root, "O'Brien"))
        assert.equal(customerUrl.searchParams.get('$top'), '8')
        assert.equal(customerUrl.searchParams.get('$orderby'), 'gr_name')
        assert.equal(customerUrl.searchParams.get('$filter'), "contains(gr_name,'O''Brien')")

        const sitesUrl = new URL(buildCustomerSitesUrl(root, '11111111-1111-4111-8111-111111111111'))
        assert.equal(sitesUrl.searchParams.get('$filter'), '_gr_customer_value eq 11111111-1111-4111-8111-111111111111')

        const contactsUrl = new URL(buildSiteContactsUrl(root, '22222222-2222-4222-8222-222222222222'))
        assert.equal(contactsUrl.searchParams.get('$filter'), '_gr_site_value eq 22222222-2222-4222-8222-222222222222')
})
