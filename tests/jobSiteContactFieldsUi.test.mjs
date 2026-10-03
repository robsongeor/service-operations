import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
let JobSiteContactFields
const originalFetch = globalThis.fetch

test.before(async () => {
    globalThis.fetch = async () => { throw new Error('Local UI fixtures must not call a backend.') }
    server = await createServer({ configFile: false, envDir: false, server: { middlewareMode: true, watch: null }, appType: 'custom' })
    JobSiteContactFields = (await server.ssrLoadModule('/src/alpha/jobs/components/JobSiteContactFields.tsx')).default
})

test.after(async () => {
    globalThis.fetch = originalFetch
    await server?.close()
})

const noChange = () => { throw new Error('Rendering must not change a selection.') }
const site = { gr_siteid: 'site-1', gr_name: 'Sample Site', gr_address: '1 Sample Road' }
const contact = { gr_sitecontactid: 'site-contact-1', gr_Contact: { gr_contactid: 'contact-1', gr_name: 'Sample Contact' } }
const render = (overrides = {}) => renderToStaticMarkup(createElement(JobSiteContactFields, {
    customerId: '', siteId: '', contactId: '', sites: [site], contacts: [contact], locationRequired: true,
    onSiteChange: noChange, onContactChange: noChange, onAddSite: noChange, onAddContact: noChange,
    ...overrides,
}))

test('no Customer hides Site, address, Contact and their premature validation errors', () => {
    assert.equal(render({ siteError: 'Choose a Site', addressError: 'Address required' }), '')
})

test('selected Customer reveals Site and read-only required address, but not Contact yet', () => {
    const html = render({ customerId: 'customer-1' })
    assert.match(html, /<span>Site \*<\/span>/)
    assert.match(html, /Add new site/)
    assert.match(html, /<span>Site address \*<\/span>/)
    assert.match(html, /<input readOnly=""/)
    assert.doesNotMatch(html, /<span>Contact<\/span>|Add new contact/)
})

test('selected Site reveals optional Contact and its selected address', () => {
    const html = render({ customerId: 'customer-1', siteId: 'site-1', contactId: 'contact-1' })
    assert.match(html, /value="1 Sample Road"/)
    assert.match(html, /<span>Contact<\/span>/)
    assert.match(html, /value="contact-1" selected=""/)
    assert.match(html, /Add new contact/)
})

test('clearing Customer hides dependent controls even if stale options or IDs are present', () => {
    assert.equal(render({ customerId: '', siteId: 'site-1', contactId: 'contact-1', address: 'Old address' }), '')
    assert.doesNotMatch(render({ customerId: 'different-customer', siteId: '' }), /<span>Contact<\/span>/)
})

test('inline-created Customer and Site snapshots reveal the same fields', () => {
    const html = render({ customerId: 'prototype-customer-new', siteId: 'prototype-site-new', address: 'New snapshot address' })
    assert.match(html, /<span>Site \*<\/span>/)
    assert.match(html, /value="New snapshot address"/)
    assert.match(html, /<span>Contact<\/span>/)
})

test('summary tiles keep Contact-only rendering, while location editor keeps Site-only rendering', () => {
    const selected = { customerId: 'customer-1', siteId: 'site-1' }
    const contactOnly = render({ ...selected, showSite: false })
    assert.doesNotMatch(contactOnly, /<span>Site|Site address/)
    assert.match(contactOnly, /<span>Contact<\/span>/)
    const siteOnly = render({ ...selected, showContact: false })
    assert.match(siteOnly, /<span>Site \*<\/span>/)
    assert.doesNotMatch(siteOnly, /<span>Contact<\/span>/)
    assert.equal(render({ ...selected, showSite: false, showContact: false }), '')
})

test('loading and failure messages appear only with the appropriate selected parent', () => {
    const errors = { siteLoadStatus: 'error', contactLoadStatus: 'error', onRetrySites: noChange, onRetryContacts: noChange }
    assert.equal(render(errors), '')
    const customerOnly = render({ ...errors, customerId: 'customer-1' })
    assert.match(customerOnly, /Sites are temporarily unavailable/)
    assert.doesNotMatch(customerOnly, /Site Contacts are temporarily unavailable/)
    const both = render({ ...errors, customerId: 'customer-1', siteId: 'site-1' })
    assert.match(both, /Site Contacts are temporarily unavailable/)
    assert.match(render({ customerId: 'customer-1', siteLoadStatus: 'loading' }), /Loading Sites/)
    assert.match(render({ customerId: 'customer-1', siteId: 'site-1', contactLoadStatus: 'loading' }), /Loading Contacts/)
})
