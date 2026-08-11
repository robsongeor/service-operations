const assert = require('node:assert/strict')
const test = require('node:test')
const { approvalSnapshot, renderApprovalPdf, TEMPLATE_VERSION } = require('../api/services/chargeableInvoiceApprovalPdf')
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
    gr_greentreereference: '145156',
    gr_dateofjob: '2026-08-10',
    gr_meter: 1234,
    gr_headline: 'Hydraulic leak reported',
    gr_workcompleted: 'Inspected the machine, replaced the damaged hose and tested operation.',
    gr_subtotal: 325,
    gr_gstrate: 15,
    gr_gstamount: 48.75,
    gr_total: 373.75,
}
const lines = [
    { gr_linekey: 'line-labour', gr_linetype: 122830000, gr_description: 'Labour', gr_quantity: 2.5, gr_unitprice: 105, gr_extendedprice: 262.5, gr_sortorder: 0 },
    { gr_linekey: 'line-parts', gr_linetype: 122830001, gr_description: 'Hydraulic hose', gr_quantity: 1, gr_unitprice: 62.5, gr_extendedprice: 62.5, gr_sortorder: 1 },
]

test('approval PDF contains the approval-only marker, reviewed values and version', async () => {
    const snapshot = approvalSnapshot({ review, revision, lines })
    const pdf = await renderApprovalPdf(snapshot, new Date('2026-08-11T02:30:00.000Z'))
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
    assert.ok(pdf.length < 5 * 1024 * 1024)
    const { getDocument } = await import('../api/node_modules/pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = getDocument({ data: new Uint8Array(pdf), disableWorker: true, isEvalSupported: false, verbosity: 0 })
    const document = await loadingTask.promise
    const text = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        text.push(content.items.map((item) => item.str).join(' '))
    }
    await loadingTask.destroy()
    const joined = text.join(' ')
    assert.match(joined, /FOR CUSTOMER PO APPROVAL - NOT A TAX INVOICE/)
    assert.match(joined, /Example Customer/)
    assert.match(joined, /Hydraulic hose/)
    assert.match(joined, /\$373\.75/)
    assert.match(joined, new RegExp(TEMPLATE_VERSION))
    assert.match(joined, /Revision 2/)
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
