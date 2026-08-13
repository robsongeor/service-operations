import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMailtoUrl } from '../src/alpha/jobs/utils/technicianMailto.ts'
import { resolvePurchaseOrderRecipients, validatePurchaseOrderRecipientSave } from '../src/alpha/customers/purchaseOrderRecipientRules.ts'
import { PURCHASE_ORDER_RECIPIENT_ROLES, type PurchaseOrderRecipient } from '../src/alpha/customers/purchaseOrderRecipient.types.ts'
import { validateNewPurchaseOrderContact } from '../src/alpha/customers/purchaseOrderContactRules.ts'

const row = (id: string, siteId: string | null, contactId: string, role: number, email: string): PurchaseOrderRecipient => ({
    gr_purchaseorderrecipientid: id,
    gr_name: id,
    _gr_customer_value: 'customer-id',
    _gr_site_value: siteId,
    _gr_contact_value: contactId,
    gr_recipientrole: role as PurchaseOrderRecipient['gr_recipientrole'],
    gr_sortorder: role === PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY ? 0 : 1,
    '@odata.etag': 'W/"1"',
    gr_Contact: { gr_contactid: contactId, gr_name: contactId, gr_email: email },
})

test('Site PO recipients replace the complete Customer default set', () => {
    const recipients = [
        row('default-primary', null, 'customer-primary', PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY, 'default@example.com'),
        row('default-cc', null, 'customer-cc', PURCHASE_ORDER_RECIPIENT_ROLES.CC, 'accounts@example.com'),
        row('site-primary', 'site-id', 'site-primary', PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY, 'site@example.com'),
    ]
    const site = resolvePurchaseOrderRecipients(recipients, 'customer-id', 'site-id')
    assert.equal(site.source, 'site')
    assert.equal(site.primary?._gr_contact_value, 'site-primary')
    assert.deepEqual(site.cc, [])
    const inherited = resolvePurchaseOrderRecipients(recipients, 'customer-id', 'other-site')
    assert.equal(inherited.source, 'customer')
    assert.equal(inherited.primary?._gr_contact_value, 'customer-primary')
    assert.deepEqual(inherited.cc.map((item) => item._gr_contact_value), ['customer-cc'])
})

test('PO recipient drafts require one distinct allowed primary and unique CC contacts', () => {
    assert.doesNotThrow(() => validatePurchaseOrderRecipientSave({
        customerId: 'customer-id', primaryContactId: 'primary', ccContactIds: ['cc-one', 'cc-two'],
    }, ['primary', 'cc-one', 'cc-two']))
    assert.throws(() => validatePurchaseOrderRecipientSave({
        customerId: 'customer-id', primaryContactId: 'primary', ccContactIds: ['primary'],
    }, ['primary']), /cannot also be a CC/i)
    assert.throws(() => validatePurchaseOrderRecipientSave({
        customerId: 'customer-id', primaryContactId: null, ccContactIds: ['cc-one'],
    }, ['cc-one']), /primary/i)
})

test('mailto keeps one primary recipient and deduplicated CC recipients', () => {
    const mailto = buildMailtoUrl({
        recipient: 'main@example.com', cc: ['CC@example.com', 'cc@example.com', 'main@example.com'],
        subject: 'PO request', body: 'Please provide a PO.',
    })
    assert.match(mailto, /^mailto:main%40example\.com\?/)
    const parameters = new URL(mailto).searchParams
    assert.equal(parameters.get('cc'), 'cc@example.com')
    assert.equal(parameters.get('subject'), 'PO request')
})

test('New PO contacts default to the main Customer and require a name and valid email address', () => {
    assert.doesNotThrow(() => validateNewPurchaseOrderContact({
        name: 'Accounts Team', email: 'accounts@example.com',
    }))
    assert.doesNotThrow(() => validateNewPurchaseOrderContact({
        siteId: 'site-id', name: 'Site Accounts', email: 'site@example.com',
    }))
    assert.throws(() => validateNewPurchaseOrderContact({
        siteId: 'site-id', name: '', email: 'accounts@example.com',
    }), /contact name/i)
    assert.throws(() => validateNewPurchaseOrderContact({
        siteId: 'site-id', name: 'Accounts Team', email: 'not-an-email',
    }), /valid email/i)
})
