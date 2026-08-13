import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

import {
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    CHARGEABLE_INVOICE_DISPOSITIONS,
    CHARGEABLE_INVOICE_DOCUMENT_TYPES,
    CHARGEABLE_INVOICE_IMPORT_STATUSES,
    CHARGEABLE_INVOICE_LINE_TYPES,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    CHARGEABLE_INVOICE_UPLOAD_STATUSES,
    CHARGEABLE_INVOICE_WAITING_ON,
    CHARGEABLE_INVOICE_MATCH_STATUSES,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceReview,
    type ChargeableInvoiceWorkspace,
} from '../src/alpha/chargeable-invoices/types/chargeableInvoice.types.ts'
import {
    deriveChargeableInvoicePrimaryQueue,
    getReadyToProcessBlockers,
    validateChargeableInvoiceRequirements,
    validateChargeableInvoiceWaiting,
    validateDoNotProcess,
} from '../src/alpha/chargeable-invoices/domain/chargeableInvoiceState.ts'
import {
    buildGreenTreeInvoiceExtraction,
    buildStableInvoiceLineKeys,
    greenTreeJobDescription,
    greenTreeJobOrderNumber,
    parseGreenTreeDateOnly,
    parseGreenTreeMoney,
} from '../src/alpha/chargeable-invoices/domain/greenTreeInvoiceExtraction.ts'
import { compareOutstandingCorrections } from '../src/alpha/chargeable-invoices/domain/chargeableInvoiceRevisionComparison.ts'
import { buildChargeableInvoiceCorrectionFields } from '../src/alpha/chargeable-invoices/domain/chargeableInvoiceCorrectionDraft.ts'
import { buildChargeableInvoiceCorrectionInstructions } from '../src/alpha/chargeable-invoices/domain/chargeableInvoiceCorrectionInstructions.ts'
import { buildChargeableInvoiceAmendedTotals } from '../src/alpha/chargeable-invoices/domain/chargeableInvoicePricing.ts'
import { brandGreenTreeInvoicePdf } from '../src/alpha/chargeable-invoices/domain/brandGreenTreeInvoicePdf.ts'
import { fetchQuotesForJob } from '../src/alpha/quotes/services/quotesApi.ts'
import { validateChargeableInvoicePdf } from '../src/alpha/chargeable-invoices/services/chargeableInvoicePreviewApi.ts'
import {
    buildChargeableInvoicePhotoRequestMailto,
    buildChargeableInvoicePoRequestMailto,
    chargeableInvoiceReviewApiTest,
    uploadChargeableInvoiceSupportingPhotos,
    validateChargeableInvoiceSupportingPhotos,
} from '../src/alpha/chargeable-invoices/services/chargeableInvoiceReviewApi.ts'

test('customer evidence export adds Liftrucks letterhead without changing the source PDF', async () => {
    const sourcePdf = await PDFDocument.create()
    sourcePdf.addPage([595.32, 841.92])
    sourcePdf.addPage([595.32, 841.92])
    const sourceBytes = await sourcePdf.save()
    const sourceCopy = new Uint8Array(sourceBytes.byteLength)
    sourceCopy.set(sourceBytes)
    const source = new Blob([sourceCopy.buffer], { type: 'application/octet-stream' })

    const branded = await brandGreenTreeInvoicePdf(source)
    const loaded = await PDFDocument.load(await branded.arrayBuffer())

    assert.equal(branded.type, 'application/pdf')
    assert.equal(loaded.getPageCount(), 2)
    assert.ok(branded.size > source.size)
    assert.equal(source.size, sourceCopy.byteLength)
})

test('customer evidence export rejects a non-PDF source', async () => {
    await assert.rejects(
        brandGreenTreeInvoicePdf(new Blob(['not a pdf'], { type: 'text/plain' })),
        /Only a GreenTree PDF can be branded/,
    )
})

test('related quote lookup is bounded to the matched Job', async () => {
    const originalFetch = globalThis.fetch
    let requestedUrl = ''
    globalThis.fetch = async (input) => {
        requestedUrl = String(input)
        return Response.json({ value: [{ gr_quoteid: 'quote-id', gr_name: 'Repair quote' }] })
    }
    try {
        const quotes = await fetchQuotesForJob('token', 'job-id')
        const url = new URL(requestedUrl, 'https://local.test')
        assert.equal(quotes.length, 1)
        assert.equal(url.searchParams.get('$filter'), '_gr_job_value eq job-id')
        assert.equal(url.searchParams.get('$top'), '51')
        assert.equal(url.searchParams.get('$orderby'), 'createdon desc')
        assert.match(url.searchParams.get('$expand') ?? '', /createdby/)
    } finally {
        globalThis.fetch = originalFetch
    }
})

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
        'Decide whether supporting photos are required.',
        'Prepare the customer PO request email.',
    ])
    assert.deepEqual(getReadyToProcessBlockers({
        ...started,
        gr_photosrequired: true,
        gr_photosstatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
        gr_porequestpreparedon: '2026-08-11T02:00:00Z',
    }), [])
})

test('a requested customer PO is handed to Accounts and does not wait for the PO to arrive', () => {
    assert.deepEqual(getReadyToProcessBlockers({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_porequired: true,
        gr_porequestpreparedon: '2026-08-11T02:00:00Z',
        gr_photosrequired: false,
        gr_ponumber: null,
        gr_poreceivedon: null,
    }), [])
})

test('Ready hands outstanding corrections to Accounts instead of blocking the terminal transition', () => {
    const transition = chargeableInvoiceReviewApiTest.readyTransition(2)
    assert.equal(transition.fields.gr_disposition, CHARGEABLE_INVOICE_DISPOSITIONS.READY_TO_PROCESS)
    assert.equal(transition.event, 122830015)
    assert.match(transition.detail ?? '', /Nargiza \/ Accounts with 2 outstanding correction instructions/)
    assert.throws(() => chargeableInvoiceReviewApiTest.readyTransition(201), /too many/i)
})

test('PO and photo decisions require deliberate, internally consistent confirmation', () => {
    assert.match(validateChargeableInvoiceRequirements({
        poRequired: false, poNumber: '', poReceived: true, photosRequired: null, photosStatus: null,
    }) ?? '', /only when a PO is required/i)
    assert.match(validateChargeableInvoiceRequirements({
        poRequired: true, poNumber: '', poReceived: true, photosRequired: true,
        photosStatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.NOT_REQUESTED,
    }) ?? '', /confirmed customer PO number/i)
    assert.match(validateChargeableInvoiceRequirements({
        poRequired: false, poNumber: '', poReceived: false, photosRequired: false,
        photosStatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
    }) ?? '', /only when supporting photos are required/i)
    assert.equal(validateChargeableInvoiceRequirements({
        poRequired: true, poNumber: 'PO-123', poReceived: true, photosRequired: true,
        photosStatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
    }), null)
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
    assert.equal(parseGreenTreeDateOnly('02 July 2026'), '2026-07-02')
    assert.equal(parseGreenTreeDateOnly('14 Aug 2023'), '2023-08-14')
    assert.equal(parseGreenTreeDateOnly('31/02/2026'), null)
})

test('GreenTree Job description uses the concise final headline segment', () => {
    assert.equal(greenTreeJobDescription('Graphic Lamination - FG18HT-16/624404 - Oil leak'), 'Oil leak')
    assert.equal(greenTreeJobDescription('Hydraulic leak reported'), 'Hydraulic leak reported')
    assert.equal(greenTreeJobDescription(null), '')
})

test('GreenTree Job Order Number keeps real values and drops invoice placeholders', () => {
    assert.equal(greenTreeJobOrderNumber('4508217044'), '4508217044')
    assert.equal(greenTreeJobOrderNumber(' PO 87521 '), 'PO 87521')
    assert.equal(greenTreeJobOrderNumber('.'), '')
    assert.equal(greenTreeJobOrderNumber(null), '')
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

test('amended pricing replaces source lines, adds requested lines, and reapplies the source GST rate', () => {
    const secondLine: ChargeableInvoiceLine = {
        ...sourceLine,
        gr_chargeableinvoicelineid: 'second-line-id',
        gr_linekey: 'line-labour',
        gr_linetype: CHARGEABLE_INVOICE_LINE_TYPES.LABOUR,
        gr_description: 'Labour',
        gr_quantity: 1,
        gr_unitprice: 100,
        gr_extendedprice: 100,
        gr_sortorder: 1,
    }
    const revision = {
        gr_chargeableinvoicerevisionid: 'source-revision-id', gr_name: 'VFL00002 revision 1',
        _gr_review_value: 'review-id', _gr_sourcedocument_value: 'document-id', gr_revisionnumber: 1,
        gr_extractionversion: 'test-v1', gr_invoicenumber: 'VFL00002', gr_invoicedate: '2026-07-28',
        gr_greentreereference: '145421', gr_subtotal: 150, gr_gstrate: 15, gr_gstamount: 22.5,
        gr_total: 172.5, gr_extractionjson: '{}',
    }
    const totals = buildChargeableInvoiceAmendedTotals(revision, [sourceLine, secondLine], [
        correction({ gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE, _gr_sourceline_value: sourceLine.gr_chargeableinvoicelineid, gr_requestedquantity: 2, gr_requestedunitprice: 50 }),
        correction({ gr_chargeableinvoicecorrectionid: 'remove', gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE, _gr_sourceline_value: secondLine.gr_chargeableinvoicelineid }),
        correction({ gr_chargeableinvoicecorrectionid: 'add', gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE, gr_requestedquantity: 2, gr_requestedunitprice: 10 }),
    ])
    assert.deepEqual(totals, {
        adjustedSubtotal: 120, adjustedGst: 18, adjustedTotal: 138,
        totalChange: -34.5, complete: true, hasPricingChanges: true,
    })
    const incomplete = buildChargeableInvoiceAmendedTotals(revision, [sourceLine], [
        correction({ gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE, gr_requestedquantity: 1 }),
    ])
    assert.equal(incomplete.complete, false)
    assert.equal(incomplete.adjustedTotal, null)
})

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

test('a correction not made in one revision is re-evaluated by the next revision', () => {
    const results = compareOutstandingCorrections([
        correction({
            gr_comparisonstatus: CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE,
            gr_fieldkey: 'dateOfJob',
            gr_requestedtext: '2026-07-26',
        }),
    ], [], {
        gr_extractionversion: 'test-v1',
        gr_invoicenumber: 'VFL00004',
        gr_invoicedate: '2026-07-29',
        gr_greentreereference: '145554',
        gr_dateofjob: '2026-07-26',
        gr_extractionjson: '{}',
    }, [])
    assert.equal(results[0].comparison, CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION)
})

test('a Work completed amendment matches when a later revision attaches it without replacing the original narrative', () => {
    const results = compareOutstandingCorrections([
        correction({
            gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY,
            gr_fieldkey: 'workCompleted',
            gr_requestedtext: 'Also replaced the damaged seal kit.',
        }),
    ], [], {
        gr_extractionversion: 'test-v1',
        gr_invoicenumber: 'VFL00005',
        gr_invoicedate: '2026-07-30',
        gr_greentreereference: '145421',
        gr_workcompleted: 'Inspected the machine and repaired the leak. Also replaced the damaged seal kit.',
        gr_extractionjson: '{}',
    }, [])
    assert.equal(results[0].comparison, CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION)
    assert.match(results[0].reason, /work-completed amendment/i)
})

test('correction instructions include unresolved evidence and requests while excluding resolved history', () => {
    const instructions = buildChargeableInvoiceCorrectionInstructions({
        review: {
            gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00005', gr_invoicenumber: 'VFL00005',
            gr_invoicedate: '2026-07-30', gr_greentreereference: '145421',
            gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
            gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
            _gr_currentrevision_value: 'revision-id',
            gr_Job: { gr_jobid: 'job-id', gr_jobnumber: '145421' },
            gr_Customer: { gr_customerid: 'customer-id', gr_name: 'Example Customer' },
            gr_Site: { gr_siteid: 'site-id', gr_name: 'Example Site' },
        },
        revisions: [{
            gr_chargeableinvoicerevisionid: 'revision-id', gr_name: 'VFL00005 revision 1',
            _gr_review_value: 'review-id', _gr_sourcedocument_value: 'document-id', gr_revisionnumber: 1,
            gr_extractionversion: 'test-v1', gr_invoicenumber: 'VFL00005', gr_invoicedate: '2026-07-30',
            gr_greentreereference: '145421', gr_extractionjson: '{}',
        }],
        lines: [sourceLine], documents: [], activities: [], technicians: [], siteContacts: [],
        corrections: [
            correction({ gr_chargeableinvoicecorrectionid: 'header', gr_fieldkey: 'dateOfJob', gr_originalsnapshot: '2026-07-29', gr_requestedtext: '2026-07-28' }),
            correction({
                gr_chargeableinvoicecorrectionid: 'work-amendment',
                gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY,
                gr_fieldkey: 'workCompleted', gr_originalsnapshot: 'Inspected and repaired oil leak.',
                gr_requestedtext: 'Also replaced the damaged seal kit.',
            }),
            correction({
                gr_chargeableinvoicecorrectionid: 'line', gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE,
                gr_comparisonstatus: CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE,
                gr_originalsnapshot: JSON.stringify(sourceLine), gr_requestedunitprice: 55,
            }),
            correction({
                gr_chargeableinvoicecorrectionid: 'resolved', gr_fieldkey: 'headline', gr_requestedtext: 'Resolved text',
                gr_comparisonstatus: CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION,
            }),
        ],
    })
    assert.equal(instructions.count, 3)
    assert.equal(instructions.fileName, 'VFL00005-correction-instructions.txt')
    assert.match(instructions.text, /Invoice: VFL00005/)
    assert.match(instructions.text, /HEADER — Date of Job/)
    assert.match(instructions.text, /Current: 2026-07-29/)
    assert.match(instructions.text, /Requested: 2026-07-28/)
    assert.match(instructions.text, /WORK COMPLETED AMENDMENT[\s\S]*Original Work completed: Inspected and repaired oil leak\.[\s\S]*Amendment to attach: Also replaced the damaged seal kit\./)
    assert.match(instructions.text, /CHANGE LINE[\s\S]*Seal kit[\s\S]*Requested Unit price: \$55\.00/)
    assert.match(instructions.text, /This file has not been sent automatically/)
    assert.doesNotMatch(instructions.text, /Resolved text/)
    assert.equal(instructions.items.length, 3)
    assert.deepEqual(instructions.items.map((item) => item.title), [
        'Add to Work completed', 'Change Seal kit', 'Change Date of Job',
    ])
    assert.match(instructions.emailText, /Hi Nargiza,/)
    assert.match(instructions.emailText, /Please make the following amendments to invoice VFL00005 for Job 145421/)
    assert.match(instructions.emailText, /Add to Work completed[\s\S]*Also replaced the damaged seal kit/)
    assert.match(instructions.emailText, /Change Seal kit[\s\S]*Unit price: \$55\.00/)
    assert.doesNotMatch(instructions.emailText, /Resolved text|Outstanding/)
})

test('correction drafts preserve source evidence and require meaningful requested changes', () => {
    const revision = {
        gr_chargeableinvoicerevisionid: 'revision-id', gr_name: 'VFL00001 rev 1', _gr_review_value: 'review-id',
        _gr_sourcedocument_value: 'document-id', gr_revisionnumber: 1, gr_extractionversion: 'test',
        gr_invoicenumber: 'VFL00001', gr_invoicedate: '2026-07-27', gr_greentreereference: '145421',
        gr_dateofjob: '2026-07-26', gr_extractionjson: '{}',
    }
    const base = { fieldKey: '', requestedText: '', sourceLineId: '', requestedLineType: null, requestedDescription: '', requestedQuantity: '', requestedUnitPrice: '' }
    const header = buildChargeableInvoiceCorrectionFields({ ...base, type: CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD, fieldKey: 'dateOfJob', requestedText: '2026-07-25' }, revision, [sourceLine])
    assert.equal(header.fields?.gr_originalsnapshot, '2026-07-26')
    assert.equal(header.fields?.gr_requestedtext, '2026-07-25')
    const emptyChange = buildChargeableInvoiceCorrectionFields({ ...base, type: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE, sourceLineId: sourceLine.gr_chargeableinvoicelineid }, revision, [sourceLine])
    assert.match(emptyChange.error ?? '', /at least one/i)
    const unchanged = buildChargeableInvoiceCorrectionFields({ ...base, type: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE, sourceLineId: sourceLine.gr_chargeableinvoicelineid, requestedLineType: sourceLine.gr_linetype, requestedDescription: sourceLine.gr_description, requestedQuantity: String(sourceLine.gr_quantity), requestedUnitPrice: String(sourceLine.gr_unitprice) }, revision, [sourceLine])
    assert.match(unchanged.error ?? '', /change at least one value/i)
    const added = buildChargeableInvoiceCorrectionFields({ ...base, type: CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE, requestedLineType: CHARGEABLE_INVOICE_LINE_TYPES.OTHER, requestedDescription: 'Consumables', requestedQuantity: '1', requestedUnitPrice: '10' }, revision, [sourceLine])
    assert.equal(added.fields?.gr_requesteddescription, 'Consumables')
    assert.equal(added.fields?.gr_requestedunitprice, 10)
})

test('editing an amendment atomically supersedes it and creates one audited replacement', () => {
    const workspace = {
        review: {
            gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
            gr_invoicedate: '2026-07-27', gr_greentreereference: '145421', gr_reviewstartedon: '2026-08-12T01:00:00Z',
            gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
            gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
            _gr_currentrevision_value: 'source-revision-id', '@odata.etag': 'W/"9"',
        },
        revisions: [{
            gr_chargeableinvoicerevisionid: 'source-revision-id', gr_name: 'VFL00001 revision 1',
            _gr_review_value: 'review-id', _gr_sourcedocument_value: 'document-id', gr_revisionnumber: 1,
            gr_extractionversion: 'test', gr_invoicenumber: 'VFL00001', gr_invoicedate: '2026-07-27',
            gr_greentreereference: '145421', gr_extractionjson: '{}',
        }],
        lines: [sourceLine],
        corrections: [correction({
            _gr_sourceline_value: sourceLine.gr_chargeableinvoicelineid,
            gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE,
            gr_requestedquantity: 2,
            '@odata.etag': 'W/"4"',
        })],
        documents: [], activities: [], technicians: [], siteContacts: [],
    } as unknown as ChargeableInvoiceWorkspace
    const batch = chargeableInvoiceReviewApiTest.replacementCorrectionBatch(workspace, 'correction-id', {
        type: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE,
        fieldKey: '', requestedText: '', sourceLineId: sourceLine.gr_chargeableinvoicelineid,
        requestedLineType: sourceLine.gr_linetype, requestedDescription: sourceLine.gr_description,
        requestedQuantity: '3', requestedUnitPrice: '50',
    })
    assert.match(batch.payload, /PATCH gr_chargeableinvoicecorrections\(correction-id\)[\s\S]*If-Match: W\/"4"[\s\S]*"gr_comparisonstatus":122830003/)
    assert.match(batch.payload, /POST gr_chargeableinvoicecorrections[\s\S]*"gr_requestedquantity":3/)
    assert.match(batch.payload, /"gr_Correction@odata.bind":"\$3"/)
    assert.match(batch.payload, /"gr_event":122830004/)
})

test('withdrawing an amendment atomically restores the working invoice while retaining audit evidence', () => {
    const workspace = {
        review: {
            gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
            gr_invoicedate: '2026-07-27', gr_greentreereference: '145421', gr_reviewstartedon: '2026-08-12T01:00:00Z',
            gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
            gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
            _gr_currentrevision_value: 'source-revision-id', '@odata.etag': 'W/"9"',
        },
        revisions: [{
            gr_chargeableinvoicerevisionid: 'source-revision-id', gr_name: 'VFL00001 revision 1',
            _gr_review_value: 'review-id', _gr_sourcedocument_value: 'document-id', gr_revisionnumber: 1,
            gr_extractionversion: 'test', gr_invoicenumber: 'VFL00001', gr_invoicedate: '2026-07-27',
            gr_greentreereference: '145421', gr_extractionjson: '{}',
        }],
        lines: [sourceLine],
        corrections: [correction({
            _gr_sourceline_value: sourceLine.gr_chargeableinvoicelineid,
            gr_correctiontype: CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE,
            '@odata.etag': 'W/"4"',
        })],
        documents: [], activities: [], technicians: [], siteContacts: [],
    } as unknown as ChargeableInvoiceWorkspace
    const batch = chargeableInvoiceReviewApiTest.supersedeCorrectionBatch(workspace, 'correction-id')
    assert.match(batch.payload, /PATCH gr_chargeableinvoicecorrections\(correction-id\)[\s\S]*If-Match: W\/"4"[\s\S]*"gr_comparisonstatus":122830003/)
    assert.doesNotMatch(batch.payload, /DELETE gr_chargeableinvoicecorrections/)
    assert.match(batch.payload, /Correction withdrawn/)
    assert.match(batch.payload, /source invoice line restored/)
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

test('permanent invoice deletion is typed-confirmation ready, atomic, dependency ordered, and excludes operational records', () => {
    const workspace = {
        review: {
            gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
            gr_invoicedate: '2026-07-27', gr_greentreereference: '145156',
            gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
            gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
            _gr_currentrevision_value: 'revision-id', '@odata.etag': 'W/"9"',
        },
        revisions: [{ gr_chargeableinvoicerevisionid: 'revision-id', _gr_review_value: 'review-id', _gr_sourcedocument_value: 'document-id' }],
        lines: [{ gr_chargeableinvoicelineid: 'line-id', _gr_revision_value: 'revision-id' }],
        corrections: [{ gr_chargeableinvoicecorrectionid: 'correction-id', _gr_review_value: 'review-id' }],
        documents: [{ gr_chargeableinvoicedocumentid: 'document-id', _gr_review_value: 'review-id', _gr_revision_value: 'revision-id' }],
        activities: [{ gr_chargeableinvoiceactivityid: 'activity-id', _gr_review_value: 'review-id' }],
        technicians: [], siteContacts: [],
    } as unknown as ChargeableInvoiceWorkspace
    const batch = chargeableInvoiceReviewApiTest.permanentDeletionBatch(workspace)
    assert.equal(batch.operationCount, 9)
    assert.match(batch.payload, /If-Match: W\/"9"/)
    assert.match(batch.payload, /DELETE gr_chargeableinvoicereviews\(review-id\)\/gr_CurrentRevision\/\$ref/)
    assert.match(batch.payload, /DELETE gr_chargeableinvoicedocuments\(document-id\)\/gr_Revision\/\$ref/)
    const activity = batch.payload.indexOf('DELETE gr_chargeableinvoiceactivities(activity-id)')
    const correction = batch.payload.indexOf('DELETE gr_chargeableinvoicecorrections(correction-id)')
    const line = batch.payload.indexOf('DELETE gr_chargeableinvoicelines(line-id)')
    const revision = batch.payload.indexOf('DELETE gr_chargeableinvoicerevisions(revision-id)')
    const document = batch.payload.indexOf('DELETE gr_chargeableinvoicedocuments(document-id) HTTP/1.1')
    const review = batch.payload.indexOf('DELETE gr_chargeableinvoicereviews(review-id) HTTP/1.1')
    assert.ok(activity < correction && correction < line && line < revision && revision < document && document < review)
    assert.doesNotMatch(batch.payload, /gr_jobs|gr_customers|gr_sites|gr_equipments/)
    assert.throws(() => chargeableInvoiceReviewApiTest.permanentDeletionBatch({
        ...workspace, documents: [{ ...workspace.documents[0], _gr_review_value: 'another-review' }],
    }), /inconsistent/i)
})

test('review paging accepts only Dataverse continuation links on the configured API path', () => {
    assert.equal(
        chargeableInvoiceReviewApiTest.trustedNextLink('https://invalid.local/api/data/v9.2/gr_chargeableinvoicereviews?$skiptoken=abc'),
        'https://invalid.local/api/data/v9.2/gr_chargeableinvoicereviews?$skiptoken=abc',
    )
    assert.throws(() => chargeableInvoiceReviewApiTest.trustedNextLink('https://attacker.example/api/data/v9.2/reviews'), /untrusted/i)
})

test('workspace Site Contact lookup is bounded to the authoritative review Site', () => {
    const url = new URL(chargeableInvoiceReviewApiTest.siteContactUrl('site-id'))
    assert.equal(url.pathname, '/api/data/v9.2/gr_sitecontacts')
    assert.equal(url.searchParams.get('$filter'), '_gr_site_value eq site-id')
    assert.match(url.searchParams.get('$expand') ?? '', /gr_Contact/)
})

test('photo request mailto is explicit, editable, and addressed only to the selected technician', () => {
    const review = {
        gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
        gr_invoicedate: '2026-07-27', gr_greentreereference: '145156',
        gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
        gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
        gr_Job: { gr_jobid: 'job-id', gr_jobnumber: '145156', gr_description: 'Repair hydraulic leak' },
        gr_Customer: { gr_customerid: 'customer-id', gr_name: 'Example Customer' },
        gr_Site: { gr_siteid: 'site-id', gr_name: 'Example Site' },
    } satisfies ChargeableInvoiceReview
    const mailto = buildChargeableInvoicePhotoRequestMailto(review, {
        gr_mechanicid: 'mechanic-id', gr_name: 'Alex Technician', gr_email: 'alex@example.com', statecode: 0,
    })
    assert.match(mailto, /^mailto:alex%40example\.com\?/)
    const decoded = decodeURIComponent(mailto)
    assert.match(decoded, /Photo evidence required - Job 145156 - Invoice VFL00001/)
    assert.match(decoded, /clear photos showing the reported fault or damage/)
    assert.match(decoded, /This draft has not been sent automatically/)
})

test('PO request mailto uses the generated approval copy and a deliberate Site recipient', () => {
    const workspace = {
        review: {
            gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
            gr_invoicedate: '2026-07-27', gr_greentreereference: '145156',
            gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
            gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
            gr_reviewstartedon: '2026-08-11T00:00:00Z', gr_porequired: true,
            gr_photosrequired: true, gr_photosstatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
            _gr_currentrevision_value: 'revision-id', _gr_customer_value: 'customer-id', _gr_site_value: 'site-id', '@odata.etag': 'W/"8"',
            gr_Job: { gr_jobid: 'job-id', gr_jobnumber: '145156', gr_description: 'Repair hydraulic leak' },
            gr_Customer: { gr_customerid: 'customer-id', gr_name: 'Example Customer' },
            gr_Site: { gr_siteid: 'site-id', gr_name: 'Example Site' },
            gr_Equipment: { gr_equipmentid: 'equipment-id', gr_make: 'Example', gr_model: 'E20', gr_fleet: 'FLT-1' },
        },
        revisions: [{
            gr_chargeableinvoicerevisionid: 'revision-id', gr_name: 'VFL00001 rev 1',
            _gr_review_value: 'review-id', _gr_sourcedocument_value: 'source-id', gr_revisionnumber: 1,
            gr_extractionversion: 'test', gr_invoicenumber: 'VFL00001', gr_invoicedate: '2026-07-27',
            gr_greentreereference: '145156', gr_total: 432.5, gr_extractionjson: '{}',
        }],
        lines: [], corrections: [], activities: [], technicians: [],
        documents: [
            { gr_chargeableinvoicedocumentid: 'source-id', gr_name: 'original.pdf', gr_filename: 'original.pdf', _gr_review_value: 'review-id', _gr_revision_value: 'revision-id', gr_documenttype: CHARGEABLE_INVOICE_DOCUMENT_TYPES.GREENTREE_INVOICE, gr_contenttype: 'application/pdf', gr_bytecount: 200, gr_uploadstatus: 122830001 },
            { gr_chargeableinvoicedocumentid: 'approval-id', gr_name: 'approval.pdf', gr_filename: 'approval.pdf', _gr_review_value: 'review-id', _gr_revision_value: 'revision-id', gr_documenttype: CHARGEABLE_INVOICE_DOCUMENT_TYPES.APPROVAL_PDF, gr_contenttype: 'application/pdf', gr_bytecount: 100, gr_uploadstatus: 122830001 },
            { gr_chargeableinvoicedocumentid: 'photo-id', gr_name: 'photo.png', gr_filename: 'photo.png', _gr_review_value: 'review-id', _gr_revision_value: 'revision-id', gr_documenttype: CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO, gr_contenttype: 'image/png', gr_bytecount: 50, gr_uploadstatus: 122830001 },
        ],
        siteContacts: [{
            gr_sitecontactid: 'site-contact-id',
            gr_Contact: { gr_contactid: 'contact-id', gr_name: 'Pat Customer', gr_email: 'pat@example.com' },
        }],
        poRecipients: [], relatedQuotes: [], relatedQuotesError: '',
    } satisfies import('../src/alpha/chargeable-invoices/types/chargeableInvoice.types.ts').ChargeableInvoiceWorkspace
    const prepared = buildChargeableInvoicePoRequestMailto(workspace, { siteContactId: 'site-contact-id' })
    assert.match(prepared.mailto, /^mailto:pat%40example\.com\?/)
    const decoded = decodeURIComponent(prepared.mailto)
    assert.match(decoded, /Purchase order requested - Job 145156 - Example Customer/)
    assert.match(decoded, /Hi Pat/)
    assert.match(decoded, /Approval amount \(including GST\): \$432\.50/)
    assert.match(decoded, /attached Customer PO Approval document/)
    assert.deepEqual(prepared.attachments.map((document) => document.gr_chargeableinvoicedocumentid), ['approval-id', 'photo-id'])
    assert.throws(() => buildChargeableInvoicePoRequestMailto(workspace, { siteContactId: 'another-site-contact' }), /Site Contact/i)
    assert.throws(() => buildChargeableInvoicePoRequestMailto(workspace, { manualEmail: 'invalid' }), /valid customer recipient/i)

    const configured = {
        ...workspace,
        poRecipients: [
            { gr_purchaseorderrecipientid: 'po-primary', gr_name: 'Primary', _gr_customer_value: 'customer-id', _gr_site_value: null, _gr_contact_value: 'contact-primary', gr_recipientrole: 122830000, gr_sortorder: 0, '@odata.etag': 'W/"1"', gr_Contact: { gr_contactid: 'contact-primary', gr_name: 'Primary Person', gr_email: 'primary@example.com' } },
            { gr_purchaseorderrecipientid: 'po-cc', gr_name: 'CC', _gr_customer_value: 'customer-id', _gr_site_value: null, _gr_contact_value: 'contact-cc', gr_recipientrole: 122830001, gr_sortorder: 1, '@odata.etag': 'W/"1"', gr_Contact: { gr_contactid: 'contact-cc', gr_name: 'Accounts Person', gr_email: 'accounts@example.com' } },
        ],
    } satisfies import('../src/alpha/chargeable-invoices/types/chargeableInvoice.types.ts').ChargeableInvoiceWorkspace
    const configuredDraft = buildChargeableInvoicePoRequestMailto(configured, { useConfiguredRecipients: true })
    const configuredUrl = new URL(configuredDraft.mailto)
    assert.equal(decodeURIComponent(configuredUrl.pathname), 'primary@example.com')
    assert.equal(configuredUrl.searchParams.get('cc'), 'accounts@example.com')
})

test('first confirmed customer PO uses the dedicated PO Received activity event', () => {
    const review = {
        gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
        gr_invoicedate: '2026-07-27', gr_greentreereference: '145156',
        gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
        gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
    } satisfies ChargeableInvoiceReview
    const transition = chargeableInvoiceReviewApiTest.requirementsTransition(review, {
        poRequired: true, poNumber: 'PO-123', poReceived: true, photosRequired: false, photosStatus: null,
    })
    assert.equal(transition.event, 122830014)
    assert.equal(transition.name, 'PO received')
    assert.doesNotMatch(transition.detail ?? '', /PO-123/)
})

test('supporting photo validation verifies signatures, extensions, size, and duplicate hashes', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    const valid = new File([pngBytes], 'repair.png', { type: 'image/png' })
    const prepared = await validateChargeableInvoiceSupportingPhotos([valid], [])
    assert.equal(prepared[0].contentType, 'image/png')
    assert.equal(prepared[0].hash.length, 64)
    await assert.rejects(() => validateChargeableInvoiceSupportingPhotos([
        new File([pngBytes], 'repair.jpg', { type: 'image/jpeg' }),
    ], []), /valid JPG, PNG, HEIC or HEIF/i)
    await assert.rejects(() => validateChargeableInvoiceSupportingPhotos([valid], [{
        gr_chargeableinvoicedocumentid: 'document-id', gr_name: 'existing.png', _gr_review_value: 'review-id',
        gr_documenttype: CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO,
        gr_contenttype: 'image/png', gr_bytecount: pngBytes.length, gr_sourcesnapshothash: prepared[0].hash,
        gr_uploadstatus: 122830001,
    }]), /already present/i)
})

test('photo finalization atomically completes documents, receives photos, and appends activity under Review ETag', () => {
    const review = {
        gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
        gr_invoicedate: '2026-07-27', gr_greentreereference: '145156',
        gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
        gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
        _gr_currentrevision_value: 'revision-id', '@odata.etag': 'W/"9"',
    } satisfies ChargeableInvoiceReview
    const batch = chargeableInvoiceReviewApiTest.photoFinalizationBatch(review, ['document-1', 'document-2'])
    assert.match(batch.payload, /PATCH gr_chargeableinvoicedocuments\(document-1\)/)
    assert.match(batch.payload, /PATCH gr_chargeableinvoicedocuments\(document-2\)/)
    assert.match(batch.payload, /PATCH gr_chargeableinvoicereviews\(review-id\)/)
    assert.match(batch.payload, /If-Match: W\/"9"/)
    assert.match(batch.payload, /"gr_photosstatus":122830002/)
    assert.match(batch.payload, /"gr_event":122830008/)
    assert.doesNotMatch(batch.payload, /PATCH gr_jobs|gr_jobstatus|gr_status/)
})

test('supporting photo deletion removes the Dataverse document, audits it, and resets status only after the last photo', () => {
    const photo = (id: string, etag: string) => ({
        gr_chargeableinvoicedocumentid: id, gr_name: `${id}.png`, gr_filename: `${id}.png`,
        _gr_review_value: 'review-id', gr_documenttype: CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO,
        gr_contenttype: 'image/png', gr_bytecount: 12,
        gr_uploadstatus: CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE, '@odata.etag': etag,
    })
    const workspace = {
        review: {
            gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
            gr_invoicedate: '2026-07-27', gr_greentreereference: '145156',
            gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
            gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
            gr_reviewstartedon: '2026-08-12T01:00:00Z', gr_photosrequired: true,
            gr_photosstatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
            gr_photorequestpreparedon: '2026-08-12T02:00:00Z',
            _gr_currentrevision_value: 'revision-id', '@odata.etag': 'W/"11"',
        },
        revisions: [], lines: [], corrections: [], activities: [], technicians: [], siteContacts: [],
        documents: [photo('photo-1', 'W/"3"'), photo('photo-2', 'W/"4"')],
    } as unknown as ChargeableInvoiceWorkspace
    const retained = chargeableInvoiceReviewApiTest.supportingPhotoDeletionBatch(workspace, ['photo-1'])
    assert.equal(retained.remaining, 1)
    assert.match(retained.payload, /DELETE gr_chargeableinvoicedocuments\(photo-1\)/)
    assert.match(retained.payload, /If-Match: W\/"3"/)
    assert.match(retained.payload, /If-Match: W\/"11"/)
    assert.match(retained.payload, /"gr_photosstatus":122830002/)
    assert.match(retained.payload, /Supporting photo removed/)
    assert.match(retained.payload, /"gr_event":122830017/)
    assert.doesNotMatch(retained.payload, /gr_jobs|gr_jobphotos/)

    const last = chargeableInvoiceReviewApiTest.supportingPhotoDeletionBatch({ ...workspace, documents: [workspace.documents[0]] }, ['photo-1'])
    assert.equal(last.remaining, 0)
    assert.match(last.payload, /"gr_photosstatus":122830001/)

    const all = chargeableInvoiceReviewApiTest.supportingPhotoDeletionBatch(workspace, ['photo-1', 'photo-2'])
    assert.equal(all.remaining, 0)
    assert.match(all.payload, /DELETE gr_chargeableinvoicedocuments\(photo-1\)/)
    assert.match(all.payload, /DELETE gr_chargeableinvoicedocuments\(photo-2\)/)
    assert.match(all.payload, /2 supporting photos were permanently removed; 0 retained/)
    assert.match(all.payload, /"gr_photosstatus":122830001/)
})

test('known supporting photo upload failure retains a safe Failed staging document for retry', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; method: string; body?: string }> = []
    globalThis.fetch = async (input, init) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
        if (url.endsWith('/gr_chargeableinvoicedocuments') && method === 'POST') {
            return Response.json({ gr_chargeableinvoicedocumentid: 'document-id' }, { status: 201 })
        }
        if (url.includes('/gr_file?') && method === 'PATCH') return new Response('', { status: 500 })
        if (url.endsWith('gr_chargeableinvoicedocuments(document-id)') && method === 'PATCH') return new Response('', { status: 204 })
        throw new Error(`Unexpected request: ${method} ${url}`)
    }
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    try {
        await assert.rejects(() => uploadChargeableInvoiceSupportingPhotos('token', {
            review: {
                gr_chargeableinvoicereviewid: 'review-id', gr_name: 'VFL00001', gr_invoicenumber: 'VFL00001',
                gr_invoicedate: '2026-07-27', gr_greentreereference: '145156',
                gr_matchstatus: CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY,
                gr_importstatus: CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE,
                gr_reviewstartedon: '2026-08-11T00:00:00Z', gr_photosrequired: true,
                _gr_photorequesttechnician_value: 'mechanic-id', '@odata.etag': 'W/"3"',
            },
            revisions: [], lines: [], corrections: [], documents: [], activities: [],
            technicians: [{ gr_mechanicid: 'mechanic-id', gr_name: 'Alex', gr_email: 'alex@example.com', statecode: 0 }],
            siteContacts: [],
        }, [new File([pngBytes], 'repair.png', { type: 'image/png' })]), /failed safely/i)
    } finally {
        globalThis.fetch = originalFetch
    }
    const failedPatch = calls.find((call) => call.url.endsWith('gr_chargeableinvoicedocuments(document-id)') && call.method === 'PATCH')
    assert.match(failedPatch?.body ?? '', /"gr_uploadstatus":122830002/)
    assert.match(failedPatch?.body ?? '', /Select the files and retry/)
})

test('Chargeable Invoice route uses shared page primitives and delegates intake and queue workflows', async () => {
    const [app, sidebar, screen, intakeHook, intakeService, queue, workspace, workspaceStyles, reviewApi, approvalService, quoteApi, jobCreateDrawer, jobRelationshipFields] = await Promise.all([
        readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/Sidebar.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/ChargeableInvoiceReviewScreen.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/hooks/useChargeableInvoiceIntake.ts', import.meta.url), 'utf8'),
        readFile(new URL('../api/services/chargeableInvoicePreviewService.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/components/ChargeableInvoiceQueue.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/components/ChargeableInvoiceWorkspace.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/ChargeableInvoiceReviewScreen.css', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/chargeable-invoices/services/chargeableInvoiceReviewApi.ts', import.meta.url), 'utf8'),
        readFile(new URL('../api/services/chargeableInvoiceApprovalService.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/quotes/services/quotesApi.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/jobs/components/JobCreateDrawer.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/jobs/components/JobRelationshipFields.tsx', import.meta.url), 'utf8'),
    ])
    assert.match(app, /path="\/chargeable-invoices"/)
    assert.match(sidebar, /Chargeable Invoices/)
    assert.match(screen, /<PageHeader/)
    assert.match(screen, /<MetricStrip/)
    assert.match(screen, /type="file"[\s\S]*multiple/)
    assert.match(screen, />Back<\/button>/)
    assert.match(screen, /Add PDFs/)
    assert.doesNotMatch(screen, /Check PDFs/)
    assert.match(screen, /checked automatically/)
    assert.match(intakeHook, /autoPreviewRequested\.current = true/)
    assert.match(intakeHook, /void previewPending\(\)/)
    assert.match(screen, /intake\.importSelected/)
    assert.match(screen, /if \(allImported\) setMode\('queue'\)/)
    assert.match(screen, /<JobCreateDrawer/)
    assert.match(screen, /requireJobNumber/)
    assert.match(screen, /jobNumber: item\.jobLookupValue\.trim\(\) \|\| revision\?\.gr_greentreereference/)
    assert.match(screen, /description: greenTreeJobDescription\(revision\?\.gr_headline\)/)
    assert.match(screen, /orderNumber: greenTreeJobOrderNumber\(revision\?\.gr_rawordernumber\)/)
    assert.match(screen, /status: JOB_STATUSES\.COMPLETE/)
    assert.match(screen, /uniqueExactEquipmentMatch\(jobs\.equipmentList/)
    assert.match(screen, /equipmentId: matchedEquipment\?\.gr_equipmentid/)
    assert.match(screen, /customerId: matchedEquipment\?\.gr_Site\?\.gr_Customer\?\.gr_customerid/)
    assert.match(screen, /siteId: matchedEquipment\?\.gr_Site\?\.gr_siteid/)
    assert.match(screen, /matches\.length === 1 \? matches\[0\] : null/)
    assert.match(screen, /fleet: revision\?\.gr_fleet/)
    assert.match(screen, /serial: revision\?\.gr_serial/)
    assert.match(screen, /make: revision\?\.gr_make/)
    assert.match(screen, /model: revision\?\.gr_model/)
    assert.match(screen, /intake\.matchCreatedJob/)
    assert.match(intakeHook, /lookupChargeableInvoiceJob\(token, jobNumber\)/)
    assert.match(intakeHook, /match\.job\.gr_jobid\.toLowerCase\(\) !== expectedJobId\.toLowerCase\(\)/)
    assert.match(jobCreateDrawer, /onCreated\?\.\(jobId, jobInput\)/)
    assert.match(jobCreateDrawer, /initialEquipmentDraft=\{initialValues\?\.equipmentDraft\}/)
    assert.match(jobRelationshipFields, /hasExactInitialFleetMatch/)
    assert.match(jobRelationshipFields, /hasExactInitialSerialMatch/)
    assert.match(jobRelationshipFields, /shouldOpenInitialEquipmentCreate/)
    assert.match(jobRelationshipFields, /Prefilled from the invoice\. Confirm the details before creating/)
    assert.match(screen, /<ChargeableInvoiceQueue/)
    assert.match(queue, /deriveChargeableInvoicePrimaryQueue/)
    assert.match(queue, /onReplaceCorrection=\{reviews\.replaceCorrection\}/)
    assert.match(queue, /onLoadQuoteLines=\{reviews\.loadQuoteLines\}/)
    assert.match(workspace, /<EditDrawerShell/)
    assert.match(workspace, /className="chargeable-review-drawer"/)
    assert.match(workspace, /chargeable-review-source-pane/)
    assert.match(workspace, /chargeable-review-detail-pane/)
    assert.match(workspace, /<DrawerTabs/)
    assert.match(workspace, /id: 'amendments', label: 'Amendments'/)
    assert.match(workspace, /id: 'requests', label: 'Requests'/)
    assert.match(workspace, /id: 'waiting', label: 'Waiting'/)
    assert.doesNotMatch(workspace, /id: 'summary', label: 'Summary'/)
    assert.match(workspace, /Sales confirming a trade-in/)
    assert.match(workspace, /Start review/)
    assert.match(workspace, /Ready to Process/)
    assert.match(workspace, /Do Not Process/)
    assert.match(workspace, /Delete invoice/)
    assert.match(workspace, /type <strong>\{review\.gr_invoicenumber\}<\/strong> to confirm/i)
    assert.match(workspace, /What is required\?/)
    assert.match(workspace, /Customer PO required/)
    assert.match(workspace, /Supporting photos required/)
    assert.match(workspace, /changePoRequired\(event\.currentTarget\.value\)/)
    assert.match(workspace, /changePhotosRequired\(event\.currentTarget\.value\)/)
    assert.doesNotMatch(workspace, /setDraft\(\(current\)[^\n]+event\.currentTarget/)
    assert.match(workspace, /Changes save automatically/)
    assert.doesNotMatch(workspace, />Save requirements</)
    assert.match(workspace, /await onSave\(next\)/)
    assert.match(intakeService, /gr_porequired: null, gr_photosrequired: null, gr_photosstatus: null/)
    assert.doesNotMatch(workspace, />Photo status</)
    assert.match(workspace, /View source PDF/)
    assert.match(workspace, /URL\.revokeObjectURL/)
    assert.match(workspace, /Add amendment/)
    assert.match(workspace, /Amend line/)
    assert.match(workspace, /Add new line/)
    assert.match(workspace, /Related quotes/)
    assert.match(workspace, /Accepted and sent quotes are shown first/)
    assert.match(workspace, /No quotes linked to Job/)
    assert.match(workspace, /quotePriceComparison/)
    assert.match(workspace, /target="_blank"/)
    assert.match(workspace, /Open quote/)
    assert.match(workspace, /onLoadLines\(quote\.gr_quoteid\)/)
    assert.match(workspace, /PRICING_CATEGORY_LABELS/)
    assert.match(workspaceStyles, /chargeable-related-quote-status/)
    assert.match(reviewApi, /fetchQuotesForJob\(accessToken, review\._gr_job_value\)/)
    assert.match(reviewApi, /Related quotes could not be loaded\. Invoice review remains available\./)
    assert.match(quoteApi, /\$filter', `_gr_job_value eq \$\{jobId\}`/)
    assert.match(quoteApi, /\$top', '51'/)
    assert.match(quoteApi, /more than 50 linked quotes/)
    assert.match(quoteApi, /\$top', '201'/)
    assert.match(quoteApi, /more than 200 lines/)
    assert.match(workspace, /Original invoice values remain visible/)
    assert.match(workspace, /Attached amendments/)
    assert.match(workspace, /Cancel Work completed amendment and restore original text/)
    assert.match(workspace, /function RestoreIcon\(\)[\s\S]*M12 5H8\.4/)
    assert.match(workspace, /chargeable-source-line-amended/)
    assert.match(workspace, /className=\{`chargeable-added-line\$\{departingCorrectionId/)
    assert.match(workspace, />New line</)
    assert.match(workspace, /corrections\.filter\(\(correction\) => correction !== removal\)/)
    assert.doesNotMatch(workspace, /chargeable-source-line-removed/)
    assert.match(workspace, /className="chargeable-line-edit-button"/)
    assert.match(workspace, /<PencilIcon \/>/)
    assert.match(workspace, /aria-label="Source and adjusted invoice totals"/)
    assert.match(workspace, /currentRevision\.gr_subtotal/)
    assert.match(workspace, /currentRevision\.gr_gstamount/)
    assert.match(workspace, /buildChargeableInvoiceAmendedTotals/)
    assert.match(workspace, /After amendments/)
    assert.match(workspace, /Order number/)
    assert.match(workspace, /Total \(incl\. GST\)/)
    assert.doesNotMatch(workspace, /Order No evidence/)
    assert.match(workspace, /Pricing change/)
    assert.match(workspace, /onReplaceCorrection/)
    assert.match(workspace, /Edit amendment/)
    assert.match(workspace, /corrections\.length === 0/)
    assert.match(workspace, /Request photo evidence/)
    assert.match(workspace, /<EmailIcon \/>/)
    assert.match(workspace, /id="chargeable-photo-technician"/)
    assert.match(workspace, /searchPlaceholder="Search technicians"/)
    assert.match(workspace, /emphasized: isAssigned/)
    assert.match(workspace, /Number\(right\.emphasized\) - Number\(left\.emphasized\)/)
    assert.match(workspace, /label="Technician to email"/)
    assert.match(workspace, /Job assigned to/)
    assert.match(workspace, /request changed to/)
    assert.match(workspace, /Upload photos/)
    assert.match(workspace, /chargeable-photo-request-row/)
    assert.match(workspace, /Selected photos/)
    assert.match(workspace, /Received photos/)
    assert.match(workspace, /UploadedPhotoPreviews/)
    assert.match(workspace, /Delete this photo\?/)
    assert.match(workspace, /Delete all \$\{photosToDelete\.length\} photos\?/)
    assert.match(workspace, />Remove all</)
    assert.match(workspace, /permanently deleted from Dataverse/)
    assert.match(workspace, /Delete \$\{name\} from Dataverse/)
    assert.match(queue, /onDeletePhotos=\{reviews\.deletePhotos\}/)
    assert.match(reviewApi, /supportingPhotoDeletionBatch/)
    assert.match(workspace, /URL\.createObjectURL/)
    assert.match(workspace, /URL\.revokeObjectURL/)
    assert.match(workspace, /Open \$\{name\} full size/)
    assert.match(workspace, /<SearchableSelect/)
    assert.match(workspace, /Open customer PO email/)
    assert.match(workspace, /No customer or site recipient with a valid email is configured yet/)
    assert.match(workspace, /Generate approval PDF/)
    assert.match(workspace, /Save supporting documents/)
    assert.match(workspace, /Customer PO Approval PDF/)
    assert.match(workspace, /showDirectoryPicker/)
    assert.match(workspace, /availableSupportingDocumentName/)
    const directoryPickerId = workspace.match(/id: '([^']+)', mode: 'readwrite'/)?.[1]
    assert.ok(directoryPickerId && directoryPickerId.length <= 32)
    assert.match(workspace, /prepareSupportingDocument\(document, onLoadDocument\)/)
    assert.match(workspace, /brandGreenTreeInvoicePdf\(source\)/)
    assert.match(workspace, /downloadSupportingDocument/)
    assert.doesNotMatch(workspace, />Download photo</)
    assert.match(workspace, /Approval copy will include active amendments/)
    assert.match(workspace, /Regenerate the Customer PO Approval PDF/)
    assert.doesNotMatch(workspace, /I will attach the downloaded files before sending/)
    assert.doesNotMatch(workspace, /EditDrawerSection title="Documents"/)
    assert.match(workspace, /attach the downloaded invoice and photos before sending/i)
    assert.match(workspace, /Amendment handoff/)
    assert.match(workspace, /Generate and save PDF/)
    assert.match(workspace, /Regenerate and save PDF/)
    assert.match(workspace, /Download amended invoice/)
    assert.match(workspace, /await onDownload\(document\)/)
    assert.match(workspace, /sent to your browser downloads/)
    assert.match(queue, /onDownload=\{reviews\.downloadDocument\}/)
    assert.match(await readFile(new URL('../src/alpha/chargeable-invoices/hooks/useChargeableInvoiceReviews.ts', import.meta.url), 'utf8'), /document\.body\.appendChild\(link\)[\s\S]*link\.click\(\)[\s\S]*setTimeout\(\(\) => URL\.revokeObjectURL\(objectUrl\), 1000\)/)
    assert.match(workspace, /Fill the approved invoice template with these active amendments/)
    assert.doesNotMatch(reviewApi, /Record that a customer PO is required before generating an approval PDF/)
    assert.doesNotMatch(approvalService, /Record that a customer PO is required before generating its approval document/)
    assert.match(workspace, /Email amendments/)
    assert.match(workspace, /Copy email summary/)
    assert.match(workspace, /Current instructions for Nargiza/)
    assert.doesNotMatch(workspace, /VITE_CHARGEABLE_INVOICE_AMENDMENT_RECIPIENT_EMAIL/)
    assert.match(workspace, /mailto:\?subject=/)
    assert.match(workspace, /Invoice amendments required/)
    assert.match(workspace, /recipient blank/)
    assert.doesNotMatch(workspace, /Download correction instructions/)
    assert.match(workspaceStyles, /grid-template-columns:[^;]+minmax\(520px/)
    assert.match(workspaceStyles, /@media \(max-width: 1100px\)/)
    assert.match(workspaceStyles, /sidebar\.open[^\n]+chargeable-review-drawer[^\n]+calc\(100vw - 280px\)/)
    assert.match(workspaceStyles, /sidebar\.collapsed[^\n]+chargeable-review-drawer[^\n]+calc\(100vw - 76px\)/)
    assert.match(workspaceStyles, /calc\(100vw - 220px\)/)
    assert.match(workspaceStyles, /edit-drawer-backdrop:has\(> \.chargeable-review-drawer\)/)
    assert.match(workspace, /InlineWorkAmendmentEditor/)
    assert.match(workspace, /InlineLineEditor/)
    assert.match(workspace, /The original Work completed text remains unchanged/i)
    assert.match(workspace, /Original values remain visible above/i)
    assert.match(workspace, /Proposed total/)
    assert.match(workspace, /className="chargeable-inline-line-row"/)
    assert.match(workspace, /aria-label="Type"/)
    assert.match(workspace, /aria-label="Description"/)
    assert.match(workspace, /Save amendment/)
    assert.match(workspace, /Save line/)
    assert.match(workspace, /aria-label="Cancel line edit"/)
    assert.match(workspace, /<SaveIcon \/>/)
    assert.match(workspaceStyles, /chargeable-inline-icon-button/)
    assert.match(workspace, /const canCorrect = Boolean\(review\?\.gr_reviewstartedon && review\.gr_disposition == null\)/)
    assert.match(workspace, /const correctionActionsDisabled = saving \|\| correctionEditor != null \|\| departingCorrectionId != null/)
    assert.match(workspace, /className="chargeable-line-remove-button" disabled=\{correctionActionsDisabled\}/)
    assert.match(workspace, /className="chargeable-line-edit-button" disabled=\{correctionActionsDisabled\}/)
    assert.match(workspace, /className="chargeable-line-restore-button" disabled=\{correctionActionsDisabled\}/)
    assert.match(workspace, /Cancel removal and restore original line/)
    assert.doesNotMatch(workspace, /ChargeableInvoiceCorrectionDialog/)
    assert.match(workspaceStyles, /chargeable-inline-line-row/)
    assert.match(workspaceStyles, /min-width: 620px/)
    assert.match(workspaceStyles, /table-layout: fixed/)
    assert.match(workspaceStyles, /position: sticky[^}]+right: 0/)
    assert.match(workspaceStyles, /min-height: 30px/)
    assert.match(workspaceStyles, /text-decoration: line-through/)
    assert.match(workspaceStyles, /chargeable-removed-line td:first-child small/)
    assert.doesNotMatch(workspace, /This line will be removed from the invoice/)
    assert.match(workspace, /money\.format\(-Math\.abs\(total\)\)/)
    assert.match(workspaceStyles, /chargeable-added-line/)
    assert.match(workspaceStyles, /chargeable-invoice-totals/)
    assert.match(workspaceStyles, /chargeable-invoice-total-change dd\.increase \{ color: #176f66; \}/)
    assert.match(workspaceStyles, /chargeable-invoice-total-change dd\.decrease \{ color: #b13c37; \}/)
    assert.match(workspaceStyles, /@keyframes chargeable-editor-enter/)
    assert.match(workspaceStyles, /@keyframes chargeable-row-exit/)
    assert.match(workspaceStyles, /@media \(prefers-reduced-motion: reduce\)/)
    assert.match(reviewApi, /POST gr_chargeableinvoicecorrections/)
    assert.match(reviewApi, /replacementCorrectionBatch/)
    assert.match(reviewApi, /gr_comparisonstatus: CHARGEABLE_INVOICE_CORRECTION_COMPARISONS\.SUPERSEDED/)
    assert.match(reviewApi, /gr_Correction@odata\.bind': '\$2'/)
    assert.doesNotMatch(reviewApi, /gr_emaildispatchs/)
    assert.doesNotMatch(screen, /fetch\(/)
})
