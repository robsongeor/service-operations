const assert = require('node:assert/strict')
const test = require('node:test')
const endpoint = require('../api/chargeableinvoicepreview/index')

const originalFetch = global.fetch
const originalEnvironment = {
    DATAVERSE_URL: process.env.DATAVERSE_URL,
    VITE_DATAVERSE_URL: process.env.VITE_DATAVERSE_URL,
    CHARGEABLE_INVOICE_PREVIEW_ENABLED: process.env.CHARGEABLE_INVOICE_PREVIEW_ENABLED,
    CHARGEABLE_INVOICE_MALWARE_SCANNING_READY: process.env.CHARGEABLE_INVOICE_MALWARE_SCANNING_READY,
}

function restoreEnvironment() {
    for (const [name, value] of Object.entries(originalEnvironment)) {
        if (value == null) delete process.env[name]
        else process.env[name] = value
    }
    global.fetch = originalFetch
}

function makePdf(lines) {
    const escaped = lines.map((line) => line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)'))
    const commands = ['BT', '/F1 12 Tf', '72 720 Td']
    escaped.forEach((line, index) => {
        if (index) commands.push('0 -16 Td')
        commands.push(`(${line}) Tj`)
    })
    commands.push('ET')
    const stream = commands.join('\n')
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf))
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xref = Buffer.byteLength(pdf)
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (let index = 1; index <= objects.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(pdf)
}

function request(pdf, overrides = {}) {
    return {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
            fileName: 'invoice.pdf',
            contentType: 'application/pdf',
            byteLength: pdf.length,
            base64: pdf.toString('base64'),
        },
        ...overrides,
    }
}

async function invoke(input) {
    const context = {}
    await endpoint(context, input)
    return context.res
}

test.afterEach(restoreEnvironment)

test('invoice preview rejects anonymous callers before reading a PDF or calling Dataverse', { concurrency: false }, async () => {
    let fetchCalls = 0
    global.fetch = async () => { fetchCalls += 1; throw new Error('unexpected fetch') }
    const response = await invoke({ method: 'POST', headers: {}, body: {} })
    assert.equal(response.status, 401)
    assert.equal(fetchCalls, 0)
})

test('invoice preview requires manager table access and returns no role internals', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    global.fetch = async (url) => String(url).endsWith('/WhoAmI')
        ? Response.json({ UserId: 'office-user' })
        : new Response('', { status: 403 })
    const response = await invoke(request(makePdf(['Invoice No VFL00001'])))
    assert.equal(response.status, 403)
    assert.match(response.body, /Manager access is required/)
    assert.doesNotMatch(response.body, /systemuserroles|privilege/i)
})

test('invoice preview stays disabled until both server release gates are enabled', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    delete process.env.CHARGEABLE_INVOICE_PREVIEW_ENABLED
    delete process.env.CHARGEABLE_INVOICE_MALWARE_SCANNING_READY
    let fetchCalls = 0
    global.fetch = async (url) => {
        fetchCalls += 1
        return String(url).endsWith('/WhoAmI') ? Response.json({ UserId: 'manager' }) : Response.json({ value: [] })
    }
    const response = await invoke(request(makePdf(['Invoice No VFL00001'])))
    assert.equal(response.status, 503)
    assert.equal(fetchCalls, 2)
    assert.match(response.body, /malware-scanning readiness/i)
})

test('invoice preview validates declared bytes, MIME type, extension, and PDF signature', () => {
    const valid = makePdf(['Invoice No VFL00001'])
    assert.equal(endpoint._test.validatePdfBody(request(valid).body).buffer.length, valid.length)
    assert.match(endpoint._test.validatePdfBody({ ...request(valid).body, contentType: 'text/plain' }).error, /Only PDF/i)
    assert.match(endpoint._test.validatePdfBody({ ...request(valid).body, byteLength: valid.length + 1 }).error, /does not match/i)
    const fake = Buffer.from('not a pdf')
    assert.match(endpoint._test.validatePdfBody(request(fake).body).error, /does not match/i)
})

test('authenticated preview extracts labelled text and performs one exact bounded Job query', { concurrency: false }, async () => {
    process.env.DATAVERSE_URL = 'https://example.crm.dynamics.com'
    process.env.CHARGEABLE_INVOICE_PREVIEW_ENABLED = 'true'
    process.env.CHARGEABLE_INVOICE_MALWARE_SCANNING_READY = 'true'
    const urls = []
    global.fetch = async (url, options) => {
        urls.push(String(url))
        assert.equal(options.headers.Authorization, 'Bearer valid-token')
        if (String(url).endsWith('/WhoAmI')) return Response.json({ UserId: 'manager' })
        if (String(url).includes('gr_chargeableinvoicereviews')) return Response.json({ value: [] })
        return Response.json({ value: [{ gr_jobid: 'job-id', gr_jobnumber: '145156' }] })
    }
    const pdf = makePdf([
        'Tax Invoice',
        'Invoice No VFL00001',
        'Date 27/07/26',
        'Our Ref 145156',
        'Order No PO candidate',
        'Labour Service labour 1.00 100.00 100.00',
        'Subtotal 100.00',
        'GST 15% 15.00',
        'Invoice Total 115.00',
    ])
    const layout = await endpoint._test.extractPdfLayout(pdf)
    assert.equal(layout.length, 1)
    const response = await invoke(request(pdf))
    assert.equal(response.status, 200)
    const body = JSON.parse(response.body)
    assert.equal(body.candidate.invoiceNumber, 'VFL00001')
    assert.equal(body.candidate.greenTreeReference, '145156')
    assert.equal(body.candidate.rawOrderNumber, 'PO candidate')
    assert.equal(body.candidate.lines.length, 1)
    assert.equal(body.match.status, 122830000)
    assert.equal(body.match.job.gr_jobid, 'job-id')
    assert.equal(body.duplicate.kind, 'new')
    assert.equal(body.duplicate.proposedRevisionNumber, 1)
    assert.equal(urls.length, 4)
    const jobUrl = new URL(urls.find((url) => url.includes('/gr_jobs?')))
    assert.equal(jobUrl.searchParams.get('$filter'), "gr_jobnumber eq '145156'")
    assert.equal(jobUrl.searchParams.get('$top'), '2')
})

test('duplicate lookup distinguishes a new revision from a recoverable failed import', { concurrency: false }, async () => {
    const review = { gr_chargeableinvoicereviewid: '00000000-0000-0000-0000-000000000001', gr_invoicenumber: 'VFL00001', gr_importstatus: 122830001 }
    global.fetch = async (url) => String(url).includes('gr_chargeableinvoicerevisions')
        ? Response.json({ value: [{ gr_revisionnumber: 3 }] })
        : Response.json({ value: [review] })
    const revision = await endpoint._test.existingInvoice('VFL00001', 'https://example.crm.dynamics.com', 'Bearer token')
    assert.equal(revision.kind, 'revision')
    assert.equal(revision.proposedRevisionNumber, 4)
    review.gr_importstatus = 122830002
    const retry = await endpoint._test.existingInvoice('VFL00001', 'https://example.crm.dynamics.com', 'Bearer token')
    assert.equal(retry.kind, 'retry')
    assert.equal(retry.proposedRevisionNumber, 4)
})

test('server import normalization rejects unbalanced totals and finalization uses one change set', () => {
    assert.throws(() => endpoint._test.normalizedImport({
        invoiceNumber: 'VFL00001', invoiceDate: '27/07/26', greenTreeReference: '145156',
        subtotal: '100', gstAmount: '15', total: '120', lines: [], extractionVersion: 'test', sourceEvidence: {},
    }), /do not balance/i)
    const normalized = endpoint._test.normalizedImport({
        invoiceNumber: 'VFL00001', invoiceDate: '27/07/26', greenTreeReference: '145156',
        subtotal: '100', gstAmount: '15', total: '115',
        lines: [{ type: 'Labour', description: 'Service labour', quantity: '1', unitPrice: '100', extendedPrice: '100' }],
        extractionVersion: 'test', sourceEvidence: {},
    })
    const batch = endpoint._test.finalizationBatch('review-id', 'W/"1"', 'document-id', 2, normalized, false)
    assert.match(batch.payload, /POST gr_chargeableinvoicerevisions/)
    assert.match(batch.payload, /POST gr_chargeableinvoicelines/)
    assert.match(batch.payload, /PATCH gr_chargeableinvoicedocuments/)
    assert.match(batch.payload, /PATCH gr_chargeableinvoicereviews/)
    assert.match(batch.payload, /If-Match: W\/"1"/)
    assert.match(batch.payload, /"gr_importstatus":122830001/)
})

test('unknown finalization outcomes are reconciled by the immutable review/revision key', { concurrency: false }, async () => {
    global.fetch = async (url) => {
        const parsed = new URL(String(url))
        assert.equal(parsed.searchParams.get('$filter'), '_gr_review_value eq review-id and gr_revisionnumber eq 2')
        assert.equal(parsed.searchParams.get('$top'), '2')
        return Response.json({ value: [{ gr_chargeableinvoicerevisionid: 'revision-id', gr_revisionnumber: 2 }] })
    }
    assert.equal(await endpoint._test.reconcileFinalization('https://example.crm.dynamics.com', 'Bearer token', 'review-id', 2), true)
    global.fetch = async () => Response.json({ value: [] })
    assert.equal(await endpoint._test.reconcileFinalization('https://example.crm.dynamics.com', 'Bearer token', 'review-id', 2), false)
})

test('exact Job matching reports zero and duplicate results without selecting one', { concurrency: false }, async () => {
    const calls = []
    global.fetch = async (url) => {
        calls.push(String(url))
        return Response.json({ value: calls.length === 1 ? [] : [{ gr_jobid: 'one' }, { gr_jobid: 'two' }] })
    }
    const unmatched = await endpoint._test.exactJobMatch('145156', 'https://example.crm.dynamics.com', 'Bearer token')
    const ambiguous = await endpoint._test.exactJobMatch('145156', 'https://example.crm.dynamics.com', 'Bearer token')
    assert.equal(unmatched.status, 122830002)
    assert.equal(ambiguous.status, 122830003)
    assert.equal(ambiguous.job, null)
})
