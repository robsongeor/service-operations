import assert from 'node:assert/strict'
import test from 'node:test'
import { buildQuotePoRequestInvoiceSnapshot } from '../src/alpha/quotes/utils/quotePoRequestInvoice.ts'
import { PRICING_CATEGORIES } from '../src/alpha/quotes/types/pricing.types.ts'
import { QUOTE_STATUSES, type Quote } from '../src/alpha/quotes/types/quote.types.ts'
import { calculateInvoiceLineLayout } from '../src/alpha/shared/pdf/renderLiftrucksInvoicePdf.ts'

const quote: Quote = {
    gr_quoteid: 'quote-id', gr_name: 'Repair hydraulic leak', gr_quotenumber: 'Q-00123',
    gr_quotestatus: QUOTE_STATUSES.DRAFT, gr_revision: 1, gr_quotedate: '2026-08-13',
    gr_validuntil: null, gr_notes: null, gr_gstrate: .15, gr_subtotal: 200, gr_gst: 30,
    gr_total: 230, createdon: '2026-08-13T00:00:00Z', _gr_job_value: 'job-id',
}

test('Quote PO request invoice uses the live editor notes and direct selections', () => {
    const snapshot = buildQuotePoRequestInvoiceSnapshot({
        quote, title: 'Repair hydraulic leak', quoteDate: '2026-08-13',
        notes: 'Replace damaged hose, clean the area and test operation.',
        jobId: 'job-id', customerId: 'customer-id', equipmentId: 'equipment-id',
        jobs: [{
            gr_jobid: 'job-id', gr_jobnumber: '145999', gr_description: 'Hydraulic oil leak',
            gr_Site: { gr_siteid: 'job-site', gr_name: 'Fallback site' },
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

    assert.equal(snapshot.documentNumber, 'Q-00123')
    assert.equal(snapshot.jobNumber, '145999')
    assert.equal(snapshot.customer, 'Example Customer Ltd')
    assert.equal(snapshot.site, '10 Industry Road, Penrose')
    assert.equal(snapshot.workCompleted, 'Replace damaged hose, clean the area and test operation.')
    assert.deepEqual(snapshot.lines.map((line) => line.type), ['Labour', 'Other'])
    assert.equal(snapshot.total, 230)
})

test('Quote PO request invoice requires a saved quote number', () => {
    assert.throws(() => buildQuotePoRequestInvoiceSnapshot({
        quote: { ...quote, gr_quotenumber: null }, title: 'Draft', quoteDate: '2026-08-13', notes: '',
        jobId: '', customerId: '', equipmentId: '', jobs: [], customers: [], equipment: [],
        lines: [{ pricingItemId: null, category: PRICING_CATEGORIES.OTHER, description: 'Item', quantity: 1, unitLabel: 'each', unitPrice: 10, taxable: true, sortOrder: 0 }],
        extendedPrices: [10], subtotal: 10, gstRatePercent: 15, gst: 1.5, total: 11.5,
    }), /save the quote/i)
})

test('Invoice typography keeps GreenTree sizing and makes totals follow the lines', () => {
    const common = calculateInvoiceLineLayout(6)
    assert.equal(common.fontSize, 9.96)
    assert.equal(common.rowHeight, 11.55)
    assert.equal(common.totalsOffset, 591.3)

    const dense = calculateInvoiceLineLayout(15)
    assert.equal(dense.fontSize, 8.5)
    assert.equal(dense.totalsOffset, 672)
})
