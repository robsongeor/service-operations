import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    CHARGEABLE_INVOICE_DISPOSITIONS,
    CHARGEABLE_INVOICE_IMPORT_STATUSES,
    CHARGEABLE_INVOICE_LINE_TYPES,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    CHARGEABLE_INVOICE_WAITING_ON,
    CHARGEABLE_INVOICE_MATCH_STATUSES,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceReview,
} from '../src/alpha/chargeable-invoices/types/chargeableInvoice.types.ts'
import {
    deriveChargeableInvoicePrimaryQueue,
    getReadyToProcessBlockers,
    validateChargeableInvoiceWaiting,
    validateDoNotProcess,
} from '../src/alpha/chargeable-invoices/domain/chargeableInvoiceState.ts'
import {
    buildGreenTreeInvoiceExtraction,
    buildStableInvoiceLineKeys,
    parseGreenTreeDateOnly,
    parseGreenTreeMoney,
} from '../src/alpha/chargeable-invoices/domain/greenTreeInvoiceExtraction.ts'
import { compareOutstandingCorrections } from '../src/alpha/chargeable-invoices/domain/chargeableInvoiceRevisionComparison.ts'
import { validateChargeableInvoicePdf } from '../src/alpha/chargeable-invoices/services/chargeableInvoicePreviewApi.ts'
import { chargeableInvoiceReviewApiTest } from '../src/alpha/chargeable-invoices/services/chargeableInvoiceReviewApi.ts'

test('queue state requires an explicit start and gives Waiting precedence while active', () => {
    assert.equal(deriveChargeableInvoicePrimaryQueue({}), 'new')
    assert.equal(deriveChargeableInvoicePrimaryQueue({ gr_reviewstartedon: '2026-08-11T01:00:00Z' }), 'in-progress')
    assert.equal(deriveChargeableInvoicePrimaryQueue({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
    }), 'waiting')
})

test('terminal dispositions derive Ready and History without another completion action', () => {
    assert.equal(deriveChargeableInvoicePrimaryQueue({
        gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.READY_TO_PROCESS,
    }), 'ready-to-process')
    assert.equal(deriveChargeableInvoicePrimaryQueue({
        gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.DO_NOT_PROCESS,
    }), 'history')
})

test('Waiting requires a useful note and cannot coexist with a terminal disposition', () => {
    assert.match(validateChargeableInvoiceWaiting({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
    }) ?? '', /waiting note/i)
    assert.match(validateChargeableInvoiceWaiting({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
        gr_waitingnote: 'Customer may trade the machine.',
        gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.DO_NOT_PROCESS,
    }) ?? '', /cannot remain/i)
    assert.match(validateChargeableInvoiceWaiting({
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
        gr_waitingnote: 'Need confirmation.',
    }) ?? '', /start/i)
})

test('PO and photo prerequisites block Ready until the confirmed business events occur', () => {
    const started = { gr_reviewstartedon: '2026-08-11T01:00:00Z', gr_porequired: true }
    assert.deepEqual(getReadyToProcessBlockers(started), [
        'Record the customer PO number.',
        'Mark the customer PO as received.',
        'Decide whether supporting photos are required.',
    ])
    assert.deepEqual(getReadyToProcessBlockers({
        ...started,
        gr_ponumber: 'PO-123',
        gr_poreceivedon: '2026-08-11T02:00:00Z',
        gr_photosrequired: true,
        gr_photosstatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
    }), [])
})

test('Do Not Process requires review, resolved Waiting, and an explanatory reason', () => {
    assert.match(validateDoNotProcess({}) ?? '', /start/i)
    assert.match(validateDoNotProcess({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
        gr_dispositionreason: 'Machine was traded.',
    }) ?? '', /waiting/i)
    assert.equal(validateDoNotProcess({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_dispositionreason: 'Machine was traded and the invoice must not be charged.',
    }), null)
})

test('GreenTree scalar normalization accepts invoice formats and rejects impossible values', () => {
    assert.equal(parseGreenTreeMoney('$ 1,234.50'), 1234.5)
    assert.equal(parseGreenTreeMoney('(45.60)'), -45.6)
    assert.equal(parseGreenTreeMoney('12 dollars'), null)
    assert.equal(parseGreenTreeDateOnly('27/07/26'), '2026-07-27')
    assert.equal(parseGreenTreeDateOnly('31/02/2026'), null)
})

test('line keys remain stable for equivalent content and disambiguate duplicates', () => {
    const keys = buildStableInvoiceLineKeys([
        { type: 'Labour', description: ' Service labour ' },
        { type: 'labour', description: 'Service   labour' },
        { type: 'Parts', description: 'Consumables' },
    ])
    assert.match(keys[0], /^line-/)
    assert.equal(keys[1], `${keys[0]}-2`)
    assert.notEqual(keys[2], keys[0])
})

test('structured GreenTree extraction preserves raw Order No and flags arithmetic instead of repairing it', () => {
    const extracted = buildGreenTreeInvoiceExtraction({
        invoiceNumber: 'VFL00001',
        invoiceDate: '27/07/26',
        rawOrderNumber: 'PO # candidate only',
        greenTreeReference: '145156',
        subtotal: '100.00',
        gstRate: '15',
        gstAmount: '15.00',
        total: '120.00',
        extractionVersion: 'test-v1',
        sourceEvidence: { fixture: 'de-identified' },
        lines: [{
            type: 'Labour',
            description: 'Service labour',
            quantity: '1',
            unitPrice: '90',
            extendedPrice: '90',
            confidence: 0.95,
        }],
    })
    assert.equal(extracted.revision.gr_rawordernumber, 'PO # candidate only')
    assert.equal(extracted.revision.gr_total, 120)
    assert.deepEqual(extracted.issues.map((issue) => issue.code), ['subtotal-mismatch', 'invoice-total-mismatch'])
})

const sourceLine: ChargeableInvoiceLine = {
    gr_chargeableinvoicelineid: 'source-line-id',
    _gr_revision_value: 'source-revision-id',
    gr_linekey: 'line-parts',
    gr_linetype: CHARGEABLE_INVOICE_LINE_TYPES.PARTS,
    gr_description: 'Seal kit',
    gr_quantity: 1,
    gr_unitprice: 50,
    gr_extendedprice: 50,
    gr_sortorder: 0,
}

function correction(overrides: Partial<ChargeableInvoiceCorrection>): ChargeableInvoiceCorrection {
    return {
        gr_chargeableinvoicecorrectionid: 'correction-id',
        _gr_review_value: 'review-id',
        _gr_sourcerevision_value: 'source-revision-id',
        gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD,
        gr_comparisonstatus: CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING,
        ...overrides,
    }
}

test('revision comparison conservatively matches header, changed, added, and removed corrections', () => {
    const revision = buildGreenTreeInvoiceExtraction({
        invoiceNumber: 'VFL00002',
        invoiceDate: '28/07/26',
        greenTreeReference: '145421',
        dateOfJob: '26/07/26',
        extractionVersion: 'test-v1',
        sourceEvidence: {},
        lines: [
            { type: 'Parts', description: 'Seal kit', quantity: 1, unitPrice: 55, extendedPrice: 55 },
            { type: 'Other', description: 'Consumables', quantity: 1, unitPrice: 10, extendedPrice: 10 },
        ],
    })
    revision.lines[0].gr_linekey = sourceLine.gr_linekey
    const results = compareOutstandingCorrections([
        correction({ gr_chargeableinvoicecorrectionid: 'header', gr_fieldkey: 'dateOfJob', gr_requestedtext: '2026-07-26' }),
        correction({
            gr_chargeableinvoicecorrectionid: 'change',
            gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE,
            _gr_sourceline_value: sourceLine.gr_chargeableinvoicelineid,
            gr_requestedunitprice: 55,
        }),
        correction({
            gr_chargeableinvoicecorrectionid: 'add',
            gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE,
            gr_requestedlinetype: CHARGEABLE_INVOICE_LINE_TYPES.OTHER,
            gr_requesteddescription: 'Consumables',
            gr_requestedquantity: 1,
            gr_requestedunitprice: 10,
        }),
        correction({
            gr_chargeableinvoicecorrectionid: 'remove',
            gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE,
            _gr_sourceline_value: sourceLine.gr_chargeableinvoicelineid,
        }),
    ], [sourceLine], revision.revision, revision.lines)
    assert.deepEqual(results.map((item) => [item.correctionId, item.comparison]), [
        ['header', CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION],
        ['change', CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION],
        ['add', CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION],
        ['remove', CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE],
    ])
})

test('ambiguous duplicate added lines are not claimed as matched', () => {
    const candidateLine = {
        gr_linekey: 'line-one',
        gr_linetype: CHARGEABLE_INVOICE_LINE_TYPES.LABOUR,
        gr_description: 'Labour',
        gr_quantity: 1,
        gr_unitprice: 100,
        gr_extendedprice: 100,
        gr_sortorder: 0,
    }
    const results = compareOutstandingCorrections([
        correction({
            gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE,
            gr_requestedlinetype: CHARGEABLE_INVOICE_LINE_TYPES.LABOUR,
            gr_requesteddescription: 'Labour',
        }),
    ], [], {
        gr_extractionversion: 'test-v1',
        gr_invoicenumber: 'VFL00003',
        gr_invoicedate: '2026-07-29',
        gr_greentreereference: '145554',
        gr_extractionjson: '{}',
    }, [candidateLine, { ...candidateLine, gr_linekey: 'line-two', gr_sortorder: 1 }])
    assert.equal(results[0].comparison, CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE)
    assert.match(results[0].reason, /ambiguous/i)
})

test('client PDF validation enforces the approved type and 5 MiB boundary before upload', () => {
    assert.equal(validateChargeableInvoicePdf({ name: 'invoice.pdf', type: 'application/pdf', size: 5 * 1024 * 1024 }), null)
    assert.match(validateChargeableInvoicePdf({ name: 'invoice.pdf', type: 'application/pdf', size: 5 * 1024 * 1024 + 1 }) ?? '', /5 MiB/)
    assert.match(validateChargeableInvoicePdf({ name: 'invoice.txt', type: 'text/plain', size: 100 }) ?? '', /PDF/)
})

test('review transitions atomically update by ETag and append activity without touching Jobs', () => {
    const review: ChargeableInvoiceReview = {
        gr_chargeableinvoicereviewid: 'review-id',
        gr_name: 'VFL00001',
        gr_invoicenumber: 'VFL00001',
        gr_invoicedate: '2026-07-27',
        gr_greentreereference: '145156',
        gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
        gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
        _gr_currentrevision_value: 'revision-id',
        '@odata.etag': 'W/"7"',
    }
    const batch = chargeableInvoiceReviewApiTest.transitionBatch(review, {
        fields: { gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.TECHNICIAN, gr_waitingnote: 'Confirm job date.' },
        event: 122830005,
        name: 'Waiting changed',
        detail: 'Confirm job date.',
    })
    assert.match(batch.payload, /PATCH gr_chargeableinvoicereviews\(review-id\)/)
    assert.match(batch.payload, /If-Match: W\/"7"/)
    assert.match(batch.payload, /POST gr_chargeableinvoiceactivities/)
    assert.match(batch.payload, /gr_chargeableinvoicerevisions\(revision-id\)/)
    assert.doesNotMatch(batch.payload, /PATCH gr_jobs|gr_jobstatus|gr_status/)
})

test('review paging accepts only Dataverse continuation links on the configured API path', () => {
    assert.equal(
        chargeableInvoiceReviewApiTest.trustedNextLink('https://invalid.local/api/data/v9.2/gr_chargeableinvoicereviews?$skiptoken=abc'),
        'https://invalid.local/api/data/v9.2/gr_chargeableinvoicereviews?$skiptoken=abc',
    )
    assert.throws(() => chargeableInvoiceReviewApiTest.trustedNextLink('https://attacker.example/api/data/v9.2/reviews'), /untrusted/i)
})

test('Chargeable Invoice route uses shared page primitives and delegates intake and queue workflows', async () => {
    const [app, sidebar, screen, queue, workspace] = await Promise.all([
        readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/Sidebar.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/ChargeableInvoiceReviewScreen.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/components/ChargeableInvoiceQueue.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/components/ChargeableInvoiceWorkspace.tsx', import.meta.url), 'utf8'),
    ])
    assert.match(app, /path="\/chargeable-invoices"/)
    assert.match(sidebar, /Chargeable Invoices/)
    assert.match(screen, /<PageHeader/)
    assert.match(screen, /<MetricStrip/)
    assert.match(screen, /type="file"[\s\S]*multiple/)
    assert.match(screen, /intake\.importSelected/)
    assert.match(screen, /<ChargeableInvoiceQueue/)
    assert.match(queue, /deriveChargeableInvoicePrimaryQueue/)
    assert.match(workspace, /<EditDrawerShell/)
    assert.match(workspace, /<DrawerTabs/)
    assert.match(workspace, /Start review/)
    assert.doesNotMatch(screen, /fetch\(/)
})
