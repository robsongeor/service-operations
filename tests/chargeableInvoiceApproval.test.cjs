const assert = require('node:assert/strict')
const test = require('node:test')
const { approvalSnapshot, renderApprovalPdf, effectiveApprovalContent, calculateApprovalLineLayout, TEMPLATE_VERSION } = require('../api/services/chargeableInvoiceApprovalPdf')
const service = require('../api/services/chargeableInvoiceApprovalService').test

const review = {
    gr_chargeableinvoicereviewid: '11111111-1111-4111-8111-111111111111',
    gr_name: 'INV-TEST',
    gr_Job: { gr_jobnumber: '145156' },
    gr_Customer: { gr_name: 'Example Customer' },
    gr_Site: { gr_name: 'Auckland Workshop' },
    gr_Equipment: { gr_fleet: 'FLT-100', gr_make: 'Example', gr_model: 'E20', gr_serial: 'SER-100' },
}
const revision = {
    gr_chargeableinvoicerevisionid: '22222222-2222-4222-8222-222222222222',
    gr_revisionnumber: 2,
    gr_invoicenumber: 'INV-TEST',
    gr_invoicedate: '2026-08-11',
    gr_rawordernumber: 'PO-4508217044',
    gr_greentreereference: '145156',
    gr_customersnapshot: 'Build Run Repair - Service\nPO Box 197\nSomerton VIC\nAustralia 3062',
    gr_sitesnapshot: 'Visyboard NZ Ltd\nRosscommon Rd\nWiri South Auckland',
    gr_dateofjob: '2026-08-10',
    gr_meter: 1234,
    gr_serviceinterval: '6 months',
    gr_nextdue: '2027-02-10',
    gr_headline: 'Hydraulic leak reported',
    gr_workcompleted: 'Inspected the machine, replaced the damaged hose and tested operation.',
    gr_subtotal: 325,
    gr_gstrate: 15,
    gr_gstamount: 48.75,
    gr_total: 373.75,
}
const lines = [
    { gr_chargeableinvoicelineid: '33333333-3333-4333-8333-333333333331', gr_linekey: 'line-labour', gr_linetype: 122830000, gr_description: 'Labour', gr_quantity: 2.5, gr_unitprice: 105, gr_extendedprice: 262.5, gr_sortorder: 0 },
    { gr_chargeableinvoicelineid: '33333333-3333-4333-8333-333333333332', gr_linekey: 'line-parts', gr_linetype: 122830001, gr_description: 'Hydraulic hose', gr_quantity: 1, gr_unitprice: 62.5, gr_extendedprice: 62.5, gr_sortorder: 1 },
]

test('approval typography matches the GreenTree-calibrated invoice line sizing', () => {
    const common = calculateApprovalLineLayout(9)
    assert.equal(common.fontSize, 9.96)
    assert.equal(common.rowHeight, 11.55)
    assert.equal(common.totalsTop, 625.95)
    const dense = calculateApprovalLineLayout(15)
    assert.equal(dense.fontSize, 8.5)
    assert.equal(TEMPLATE_VERSION, 'liftrucks-manager-template-v8')
})

test('approval content applies active story, change, removal and addition amendments', () => {
    const corrections = [
        { gr_chargeableinvoicecorrectionid: 'story', gr_correctiontype: 122830001, gr_requestedtext: 'Photos confirm the hose failed in service.', gr_comparisonstatus: 122830000 },
        { gr_chargeableinvoicecorrectionid: 'change', _gr_sourceline_value: 'older-revision-line', gr_originalsnapshot: JSON.stringify({ gr_linekey: lines[0].gr_linekey }), gr_correctiontype: 122830002, gr_requesteddescription: 'Labour - revised', gr_requestedquantity: 3, gr_requestedunitprice: 105, gr_comparisonstatus: 122830000 },
        { gr_chargeableinvoicecorrectionid: 'remove', _gr_sourceline_value: lines[1].gr_chargeableinvoicelineid, gr_correctiontype: 122830004, gr_comparisonstatus: 122830000 },
        { gr_chargeableinvoicecorrectionid: 'add', gr_correctiontype: 122830003, gr_requestedlinetype: 122830002, gr_requesteddescription: 'Consumables', gr_requestedquantity: 1, gr_requestedunitprice: 20, gr_comparisonstatus: 122830000 },
    ]
    const effective = effectiveApprovalContent({ review, revision, lines, corrections })
    assert.match(effective.workCompleted, /Photos confirm the hose failed in service/)
    assert.deepEqual(effective.lines.map((line) => line.description), ['Labour - revised', 'Consumables'])
    assert.equal(effective.subtotal, 335)
    assert.equal(effective.gstAmount, 50.25)
    assert.equal(effective.total, 385.25)
    assert.equal(effective.amendmentCount, 4)
})

test('story-only approval preserves authoritative GreenTree rounding', () => {
    const effective = effectiveApprovalContent({
        review,
        revision: { ...revision, gr_subtotal: 3515.44, gr_gstamount: 527.33, gr_total: 4042.77 },
        lines: [{ ...lines[0], gr_quantity: 33.4803809524, gr_unitprice: 105, gr_extendedprice: 3515.44 }],
        corrections: [{ gr_chargeableinvoicecorrectionid: 'story-only', gr_correctiontype: 122830001, gr_requestedtext: 'Additional customer context.', gr_comparisonstatus: 122830000 }],
    })
    assert.equal(effective.subtotal, 3515.44)
    assert.equal(effective.gstAmount, 527.33)
    assert.equal(effective.total, 4042.77)
})

test('approval PDF fills the manager-supplied invoice template with reviewed amendment values', async () => {
    const snapshot = approvalSnapshot({ review, revision, lines })
    const pdf = await renderApprovalPdf(snapshot, new Date('2026-08-11T02:30:00.000Z'))
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
    assert.ok(pdf.length < 5 * 1024 * 1024)
    const { getDocument, OPS } = await import('../api/node_modules/pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = getDocument({ data: new Uint8Array(pdf), disableWorker: true, isEvalSupported: false, verbosity: 0 })
    const document = await loadingTask.promise
    const text = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        text.push(content.items.map((item) => item.str).join(' '))
        const operators = await page.getOperatorList()
        const imageCount = operators.fnArray.filter((operator) =>
            operator === OPS.paintImageXObject || operator === OPS.paintInlineImageXObject).length
        assert.ok(imageCount >= 2, 'the template background and Liftrucks logo must both be embedded')
    }
    await loadingTask.destroy()
    const joined = text.join(' ')
    assert.match(joined, /PROVISIONAL QUOTATION/)
    assert.doesNotMatch(joined, /CUSTOMER PO APPROVAL|NOT A TAX INVOICE/)
    assert.doesNotMatch(joined, /INV-TEST/)
    assert.match(joined, /Build Run Repair - Service/)
    assert.match(joined, /PO Box 197/)
    assert.match(joined, /Visyboard NZ Ltd/)
    assert.match(joined, /Wiri South Auckland/)
    assert.match(joined, /Hydraulic hose/)
    assert.match(joined, /\$373\.75/)
    assert.match(joined, /PO-4508217044/)
    assert.doesNotMatch(joined, /642596|Hubtex Australia/)
})

test('approval snapshot recovers party blocks from immutable extraction evidence', () => {
    const sourceLines = [
        { text: 'Order No : 4508216971', words: [{ text: 'Order', x: 398 }, { text: 'No', x: 427 }] },
        { text: 'Build Run Repair - Service Visyboard NZ Ltd', words: [{ text: 'Build', x: 49 }, { text: 'Run', x: 81 }, { text: 'Repair', x: 108 }, { text: '-', x: 149 }, { text: 'Service', x: 156 }, { text: 'Visyboard', x: 338 }, { text: 'NZ', x: 399 }, { text: 'Ltd', x: 418 }] },
        { text: 'PO Box 197 Rosscommon Rd', words: [{ text: 'PO', x: 49 }, { text: 'Box', x: 67 }, { text: '197', x: 87 }, { text: 'Rosscommon', x: 338 }, { text: 'Rd', x: 405 }] },
        { text: 'Description Quantity Price Total', words: [{ text: 'Description', x: 16 }, { text: 'Quantity', x: 307 }] },
    ]
    const snapshot = approvalSnapshot({
        review,
        revision: { ...revision, gr_customersnapshot: null, gr_sitesnapshot: null, gr_extractionjson: JSON.stringify({ pages: [{ lines: sourceLines }] }) },
        lines,
    })
    assert.deepEqual(snapshot.customerBlock, ['Build Run Repair - Service', 'PO Box 197'])
    assert.deepEqual(snapshot.siteBlock, ['Visyboard NZ Ltd', 'Rosscommon Rd'])
})

test('approval snapshot and hash are stable for the same reviewed revision', () => {
    const first = approvalSnapshot({ review, revision, lines })
    const second = approvalSnapshot({ review, revision, lines: [...lines].reverse() })
    assert.deepEqual(first, second)
    assert.equal(service.canonicalSnapshotHash(first), service.canonicalSnapshotHash(second))
    assert.match(service.safeFilename('145156 / unsafe'), /^PO-approval-145156-unsafe\.pdf$/)
})

test('approval request requires bounded review, revision and ETag contracts', () => {
    assert.deepEqual(service.requestContract({
        reviewId: review.gr_chargeableinvoicereviewid,
        revisionId: revision.gr_chargeableinvoicerevisionid,
        reviewEtag: 'W/"42"',
    }), {
        reviewId: review.gr_chargeableinvoicereviewid,
        revisionId: revision.gr_chargeableinvoicerevisionid,
        reviewEtag: 'W/"42"',
    })
    assert.equal(service.requestContract({
        reviewId: 'aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa',
        revisionId: revision.gr_chargeableinvoicerevisionid,
        reviewEtag: '"43"',
    }).reviewId, 'aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa')
    assert.match(service.requestContract({ reviewId: '../bad', revisionId: 'bad', reviewEtag: '*' }).error, /Refresh/)
})

test('finalisation atomically completes the document and appends its activity', () => {
    const batch = service.finalizationBatch(review, revision.gr_chargeableinvoicerevisionid,
        '33333333-3333-4333-8333-333333333333', 'W/"42"', new Date('2026-08-11T02:30:00.000Z'))
    assert.match(batch.payload, /gr_uploadstatus":122830001/)
    assert.match(batch.payload, /If-Match: W\/"42"/)
    assert.match(batch.payload, /Approval PDF generated/)
    assert.match(batch.payload, /gr_event":122830012/)
})
