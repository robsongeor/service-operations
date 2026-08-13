import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildQuotePoRequestInvoiceSnapshot, buildQuoteProvisionalFilename } from '../src/alpha/quotes/utils/quotePoRequestInvoice.ts'
import { PRICING_CATEGORIES } from '../src/alpha/quotes/types/pricing.types.ts'
import { QUOTE_STATUSES, type Quote } from '../src/alpha/quotes/types/quote.types.ts'
import { calculateInvoiceLineLayout, MAX_LIFTTRUCKS_INVOICE_LINES, renderLiftrucksInvoicePdf } from '../src/alpha/shared/pdf/renderLiftrucksInvoicePdf.ts'
import { buildProtectedQuoteTitle, buildQuoteTitle, extractQuoteTitleAddition, getQuoteJobDefaults } from '../src/alpha/quotes/utils/quoteTitle.ts'
import { buildQuotePoRequestEmail } from '../src/alpha/quotes/utils/quotePoRequestEmail.ts'
import { PURCHASE_ORDER_RECIPIENT_ROLES, type PurchaseOrderRecipient } from '../src/alpha/customers/purchaseOrderRecipient.types.ts'

const quote: Quote = {
    gr_quoteid: 'quote-id', gr_name: 'Repair hydraulic leak', gr_quotenumber: 'Q-00123',
    gr_quotestatus: QUOTE_STATUSES.DRAFT, gr_revision: 1, gr_quotedate: '2026-08-13',
    gr_validuntil: null, gr_notes: null, gr_gstrate: .15, gr_subtotal: 200, gr_gst: 30,
    gr_total: 230, createdon: '2026-08-13T00:00:00Z', _gr_job_value: 'job-id',
    gr_Job: { gr_jobid: 'job-id', gr_jobnumber: '145999', gr_description: 'Hydraulic oil leak' },
}

test('Quote title protects linked context while preserving user-added wording', () => {
    const protectedTitle = buildProtectedQuoteTitle(
        { gr_jobnumber: '145878', gr_description: 'C-Service Repairs' },
        { gr_fleet: 'VFL01301', gr_serial: 'SER-1' },
    )
    assert.equal(protectedTitle, '145878 - VFL01301 - C-Service Repairs')
    assert.equal(buildQuoteTitle(protectedTitle, 'Urgent customer request'), '145878 - VFL01301 - C-Service Repairs - Urgent customer request')
    assert.equal(extractQuoteTitleAddition('VFL01301 - C-Service Repairs - Urgent customer request', protectedTitle), 'Urgent customer request')
})

test('Linked Job supplies Quote Customer and Equipment defaults', () => {
    assert.deepEqual(getQuoteJobDefaults({
        gr_Equipment: { gr_equipmentid: 'equipment-id' },
        gr_Site: { gr_Customer: { gr_customerid: 'customer-id' } },
    }), { customerId: 'customer-id', equipmentId: 'equipment-id' })
    assert.deepEqual(getQuoteJobDefaults(undefined), { customerId: '', equipmentId: '' })
})

const poRecipient = (role: number, email: string, siteId?: string): PurchaseOrderRecipient => ({
    gr_purchaseorderrecipientid: `${role}-${email}`,
    gr_name: email,
    _gr_customer_value: 'customer-id',
    _gr_site_value: siteId,
    _gr_contact_value: email,
    gr_recipientrole: role as PurchaseOrderRecipient['gr_recipientrole'],
    gr_sortorder: role === PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY ? 0 : 1,
    '@odata.etag': 'W/"1"',
    gr_Contact: { gr_contactid: email, gr_name: role === PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY ? 'Priya Patel' : 'Accounts', gr_email: email },
})

test('Quote PO email uses Site recipients and CC when configured', () => {
    const draft = buildQuotePoRequestEmail({
        recipients: [
            poRecipient(PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY, 'customer@example.com'),
            poRecipient(PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY, 'site@example.com', 'site-id'),
            poRecipient(PURCHASE_ORDER_RECIPIENT_ROLES.CC, 'site-cc@example.com', 'site-id'),
        ],
        customerId: 'customer-id', siteId: 'site-id', jobNumber: '145999', quoteNumber: 'Q-00123',
        customerName: 'Example Customer', equipmentLabel: 'FLT-22 - Komatsu FG25', total: 230,
        internalCc: ['manager@liftrucks.co.nz'],
        workSummary: 'Replace the damaged hydraulic hose and test the machine.',
    })
    assert.equal(draft.recipientConfigured, true)
    assert.equal(draft.recipientSource, 'site')
    assert.match(draft.mailto, /^mailto:site%40example\.com\?cc=site-cc%40example\.com%2Cmanager%40liftrucks\.co\.nz&/)
    assert.match(decodeURIComponent(draft.mailto), /Purchase order request - Job 145999/)
    assert.match(decodeURIComponent(draft.mailto), /Could you please process the attached provisional quotation/)
    assert.match(decodeURIComponent(draft.mailto), /Replace the damaged hydraulic hose and test the machine/)
    assert.match(decodeURIComponent(draft.mailto), /The work is awaiting PO approval/)
})

test('Quote PO email opens with a blank recipient when routing is not configured', () => {
    const draft = buildQuotePoRequestEmail({
        recipients: [], customerId: 'customer-id', jobNumber: '145999', quoteNumber: 'Q-00123',
        customerName: 'Example Customer', total: 230, internalCc: ['manager@liftrucks.co.nz'],
    })
    assert.equal(draft.recipientConfigured, false)
    assert.equal(draft.recipientSource, 'unconfigured')
    assert.match(draft.mailto, /^mailto:\?cc=/)
    assert.match(decodeURIComponent(draft.mailto), /cc=manager@liftrucks\.co\.nz/)
})

test('Quote PO request invoice uses the live editor notes and direct selections', () => {
    const snapshot = buildQuotePoRequestInvoiceSnapshot({
        quote, title: 'Repair hydraulic leak', quoteDate: '2026-08-13',
        notes: 'Replace damaged hose, clean the area and test operation.',
        jobId: 'job-id', customerId: 'customer-id', equipmentId: 'equipment-id',
        jobs: [{
            gr_jobid: 'job-id', gr_jobnumber: '145999', gr_description: 'Hydraulic oil leak',
            gr_Site: { gr_siteid: 'job-site', gr_name: 'Penrose Service Site', gr_address: '10 Industry Road, Penrose' },
        }],
        customers: [{ gr_customerid: 'customer-id', gr_name: 'Example Customer Ltd' }],
        equipment: [{
            gr_equipmentid: 'equipment-id', gr_fleet: 'FLT-22', gr_serial: 'SER-9',
            gr_make: 'Komatsu', gr_model: 'FG25',
            gr_Site: { gr_siteid: 'site-id', gr_name: 'Penrose', gr_address: '10 Industry Road, Penrose' },
        }],
        lines: [
            { pricingItemId: null, category: PRICING_CATEGORIES.LABOUR, description: 'Labour', quantity: 1.5, unitLabel: 'hour', unitPrice: 100, taxable: true, sortOrder: 0 },
            { pricingItemId: null, category: PRICING_CATEGORIES.CONSUMABLES, description: 'Sundries', quantity: 1, unitLabel: 'each', unitPrice: 50, taxable: true, sortOrder: 1 },
        ],
        extendedPrices: [150, 50], subtotal: 200, gstRatePercent: 15, gst: 30, total: 230,
    })

    assert.equal(snapshot.documentNumber, '145999')
    assert.equal(snapshot.jobNumber, '145999')
    assert.equal(snapshot.customer, 'Example Customer Ltd')
    assert.equal(snapshot.siteName, 'Penrose Service Site')
    assert.equal(snapshot.siteAddress, '10 Industry Road, Penrose')
    assert.equal(snapshot.workRequired, 'Replace damaged hose, clean the area and test operation.')
    assert.deepEqual(snapshot.lines.map((line) => line.type), ['Labour', 'Other'])
    assert.equal(snapshot.total, 230)
    assert.equal(buildQuoteProvisionalFilename(snapshot), 'FLT-22 - 145999.pdf')
})

test('Provisional quotation filename falls back safely when Fleet is unavailable', () => {
    assert.equal(buildQuoteProvisionalFilename({
        documentNumber: '145999', documentDate: '2026-08-13', jobNumber: '145999', customer: '',
        headline: '', repairDescription: '', lines: [], subtotal: 0, gstRatePercent: 15, gstAmount: 0,
        total: 0, fleet: '', serial: 'SER/22:*', make: 'Komatsu', model: 'FG25',
    }), 'SER-22 - 145999.pdf')
})

test('Quote PO request invoice requires a saved quote number', () => {
    assert.throws(() => buildQuotePoRequestInvoiceSnapshot({
        quote: { ...quote, gr_quotenumber: null }, title: 'Draft', quoteDate: '2026-08-13', notes: '',
        jobId: '', customerId: '', equipmentId: '', jobs: [], customers: [], equipment: [],
        lines: [{ pricingItemId: null, category: PRICING_CATEGORIES.OTHER, description: 'Item', quantity: 1, unitLabel: 'each', unitPrice: 10, taxable: true, sortOrder: 0 }],
        extendedPrices: [10], subtotal: 10, gstRatePercent: 15, gst: 1.5, total: 11.5,
    }), /save the quote/i)
})

test('Provisional quotation requires a numbered linked Job', () => {
    assert.throws(() => buildQuotePoRequestInvoiceSnapshot({
        quote: { ...quote, gr_Job: undefined }, title: 'Draft', quoteDate: '2026-08-13', notes: '',
        jobId: '', customerId: '', equipmentId: '', jobs: [], customers: [], equipment: [],
        lines: [{ pricingItemId: null, category: PRICING_CATEGORIES.OTHER, description: 'Item', quantity: 1, unitLabel: 'each', unitPrice: 10, taxable: true, sortOrder: 0 }],
        extendedPrices: [10], subtotal: 10, gstRatePercent: 15, gst: 1.5, total: 11.5,
    }), /numbered Job/i)
})

test('Invoice typography keeps GreenTree sizing and makes totals follow the lines', () => {
    const common = calculateInvoiceLineLayout(6)
    assert.equal(common.fontSize, 9.96)
    assert.equal(common.rowHeight, 11.55)
    assert.equal(common.totalsOffset, 591.3)

    const dense = calculateInvoiceLineLayout(15)
    assert.equal(dense.fontSize, 8.5)
    assert.equal(dense.totalsOffset, 672)

    const sixteenLines = calculateInvoiceLineLayout(16)
    assert.equal(sixteenLines.fontSize, 7.875)
    assert.equal(sixteenLines.totalsOffset, 672)
    assert.equal(MAX_LIFTTRUCKS_INVOICE_LINES, 20)
})

test('Quote PO request invoice accepts a sixteen-line quote', () => {
    const lines = Array.from({ length: 16 }, (_, index) => ({
        pricingItemId: null,
        category: PRICING_CATEGORIES.OTHER,
        description: `Item ${index + 1}`,
        quantity: 1,
        unitLabel: 'each',
        unitPrice: 10,
        taxable: true,
        sortOrder: index,
    }))
    const snapshot = buildQuotePoRequestInvoiceSnapshot({
        quote, title: 'Sixteen line repair', quoteDate: '2026-08-13', notes: 'Complete quoted work.',
        jobId: '', customerId: '', equipmentId: '', jobs: [], customers: [], equipment: [], lines,
        extendedPrices: lines.map(() => 10), subtotal: 160, gstRatePercent: 15, gst: 24, total: 184,
    })
    assert.equal(snapshot.lines.length, 16)
})

test('Sixteen-line Quote PO request invoice renders as a PDF', async () => {
    const lines = Array.from({ length: 16 }, (_, index) => ({
        type: 'Other' as const,
        description: `Quoted repair item ${index + 1}`,
        quantity: index % 3 + 1,
        unitPrice: 10 + index,
        extendedPrice: (index % 3 + 1) * (10 + index),
    }))
    const template = await readFile(new URL('../api/assets/chargeable-invoice-approval-template.png', import.meta.url))
    const logo = await readFile(new URL('../api/assets/liftrucks-invoice-logo.jpg', import.meta.url))
    const blob = await renderLiftrucksInvoicePdf({
        documentNumber: 'Q-00123', documentDate: '2026-08-13', jobNumber: '145999', customer: 'Example Customer',
        siteName: 'Penrose Service Site', siteAddress: '10 Industry Road, Penrose', headline: 'Dense repair quote', repairDescription: 'Complete the listed repairs.',
        workRequired: 'Complete quoted work and test the machine.', lines, subtotal: 640, gstRatePercent: 15,
        gstAmount: 96, total: 736,
    }, {
        template: template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength) as ArrayBuffer,
        logo: logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength) as ArrayBuffer,
    })
    assert.equal(blob.type, 'application/pdf')
    assert.equal(Buffer.from(await blob.arrayBuffer()).subarray(0, 5).toString('ascii'), '%PDF-')
})
