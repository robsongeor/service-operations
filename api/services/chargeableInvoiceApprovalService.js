const { createHash, randomBytes } = require('node:crypto')
const { jsonResponse, validateManager } = require('./chargeableInvoicePreviewService')
const { TEMPLATE_VERSION, approvalSnapshot, renderApprovalPdf } = require('./chargeableInvoiceApprovalPdf')

const DOCUMENT_TYPE_APPROVAL_PDF = 122830001
const UPLOAD_PENDING = 122830000
const UPLOAD_COMPLETE = 122830001
const UPLOAD_FAILED = 122830002
const IMPORT_ACTIVE = 122830001
const CORRECTION_OUTSTANDING = 122830000
const CORRECTION_NOT_MADE = 122830002
const ACTIVITY_APPROVAL_PDF_GENERATED = 122830012
const MAX_LINES = 200
const MAX_PDF_BYTES = 5 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ETAG = /^(?:W\/)?"[0-9]+"$/

class UnknownApprovalOutcomeError extends Error {}

function approvalEnabled() {
    return process.env.CHARGEABLE_INVOICE_APPROVAL_ENABLED === 'true'
}

function requestContract(body) {
    if (!body || typeof body !== 'object') return { error: 'The request body is invalid.' }
    const reviewId = typeof body.reviewId === 'string' ? body.reviewId.trim() : ''
    const revisionId = typeof body.revisionId === 'string' ? body.revisionId.trim() : ''
    const reviewEtag = typeof body.reviewEtag === 'string' ? body.reviewEtag.trim() : ''
    if (!UUID.test(reviewId) || !UUID.test(revisionId) || !ETAG.test(reviewEtag)) {
        return { error: 'Refresh the invoice review before generating its approval document.' }
    }
    return { reviewId, revisionId, reviewEtag }
}

async function dataverseResponse(url, authorization, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { Authorization: authorization, Accept: 'application/json', ...(options.headers || {}) },
    })
    const text = await response.text()
    if (!response.ok) {
        const error = new Error(`Dataverse request failed (${response.status}).`)
        error.status = response.status
        throw error
    }
    return { response, body: text ? JSON.parse(text) : null }
}

function selectUrl(origin, entitySet, id, select, expand) {
    const url = new URL(`${origin}/api/data/v9.2/${entitySet}(${id})`)
    url.searchParams.set('$select', select)
    if (expand) url.searchParams.set('$expand', expand)
    return url.toString()
}

async function readAuthoritativeSnapshot(origin, authorization, contract) {
    const reviewUrl = selectUrl(origin, 'gr_chargeableinvoicereviews', contract.reviewId, [
        'gr_chargeableinvoicereviewid', 'gr_name', 'gr_importstatus', 'gr_reviewstartedon',
        'gr_disposition', 'gr_porequired', '_gr_currentrevision_value',
    ].join(','), [
        'gr_Job($select=gr_jobnumber)', 'gr_Customer($select=gr_name)', 'gr_Site($select=gr_name)',
        'gr_Equipment($select=gr_fleet,gr_make,gr_model,gr_serial)',
    ].join(','))
    const revisionUrl = selectUrl(origin, 'gr_chargeableinvoicerevisions', contract.revisionId, [
        'gr_chargeableinvoicerevisionid', '_gr_review_value', 'gr_revisionnumber', 'gr_invoicenumber',
        'gr_invoicedate', 'gr_greentreereference', 'gr_customersnapshot', 'gr_sitesnapshot',
        'gr_headline', 'gr_fleet', 'gr_make', 'gr_model', 'gr_serial', 'gr_meter', 'gr_dateofjob',
        'gr_repairdescription', 'gr_workcompleted', 'gr_subtotal', 'gr_gstrate', 'gr_gstamount', 'gr_total',
    ].join(','))
    const linesUrl = new URL(`${origin}/api/data/v9.2/gr_chargeableinvoicelines`)
    linesUrl.searchParams.set('$select', 'gr_linekey,gr_linetype,gr_description,gr_quantity,gr_unitprice,gr_extendedprice,gr_sortorder')
    linesUrl.searchParams.set('$filter', `_gr_revision_value eq ${contract.revisionId}`)
    linesUrl.searchParams.set('$orderby', 'gr_sortorder asc')
    linesUrl.searchParams.set('$top', String(MAX_LINES + 1))
    const correctionsUrl = new URL(`${origin}/api/data/v9.2/gr_chargeableinvoicecorrections`)
    correctionsUrl.searchParams.set('$select', 'gr_chargeableinvoicecorrectionid')
    correctionsUrl.searchParams.set('$filter', `_gr_review_value eq ${contract.reviewId} and (gr_comparisonstatus eq ${CORRECTION_OUTSTANDING} or gr_comparisonstatus eq ${CORRECTION_NOT_MADE})`)
    correctionsUrl.searchParams.set('$top', '1')
    const [reviewResult, revisionResult, linesResult, correctionsResult] = await Promise.all([
        dataverseResponse(reviewUrl, authorization), dataverseResponse(revisionUrl, authorization),
        dataverseResponse(linesUrl.toString(), authorization), dataverseResponse(correctionsUrl.toString(), authorization),
    ])
    const review = reviewResult.body
    const revision = revisionResult.body
    const lines = linesResult.body?.value
    if (!review || !revision || !Array.isArray(lines) || !Array.isArray(correctionsResult.body?.value)) {
        throw new Error('Dataverse returned invalid approval-document data.')
    }
    const currentEtag = review['@odata.etag'] || reviewResult.response.headers.get('etag')
    if (!currentEtag || currentEtag !== contract.reviewEtag) {
        const error = new Error('The invoice review changed in Dataverse.')
        error.status = 412
        throw error
    }
    if (review.gr_importstatus !== IMPORT_ACTIVE || !review.gr_reviewstartedon || review.gr_disposition != null) {
        const error = new Error('The invoice review is not eligible for an approval document.')
        error.status = 409
        throw error
    }
    if (review.gr_porequired !== true) {
        const error = new Error('Record that a customer PO is required before generating its approval document.')
        error.status = 409
        throw error
    }
    if (review._gr_currentrevision_value?.toLowerCase() !== contract.revisionId.toLowerCase()
        || revision._gr_review_value?.toLowerCase() !== contract.reviewId.toLowerCase()) {
        const error = new Error('The selected invoice revision is no longer current.')
        error.status = 412
        throw error
    }
    if (lines.length > MAX_LINES) throw new Error('The invoice has too many lines to render safely.')
    if (correctionsResult.body.value.length) {
        const error = new Error('Resolve all outstanding invoice corrections before generating the approval document.')
        error.status = 409
        throw error
    }
    return { review, revision, lines, currentEtag }
}

function canonicalSnapshotHash(snapshot) {
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
}

function safeFilename(value) {
    const token = String(value || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    return `PO-approval-${token || 'invoice'}.pdf`
}

async function findExisting(origin, authorization, reviewId, revisionId, hash) {
    const url = new URL(`${origin}/api/data/v9.2/gr_chargeableinvoicedocuments`)
    url.searchParams.set('$select', 'gr_chargeableinvoicedocumentid,gr_name,_gr_review_value,_gr_revision_value,gr_documenttype,gr_contenttype,gr_bytecount,gr_templateversion,gr_sourcesnapshothash,gr_uploadstatus,gr_filename,createdon')
    url.searchParams.set('$filter', [
        `_gr_review_value eq ${reviewId}`, `_gr_revision_value eq ${revisionId}`,
        `gr_documenttype eq ${DOCUMENT_TYPE_APPROVAL_PDF}`, `gr_uploadstatus eq ${UPLOAD_COMPLETE}`,
        `gr_templateversion eq '${TEMPLATE_VERSION}'`, `gr_sourcesnapshothash eq '${hash}'`,
    ].join(' and '))
    url.searchParams.set('$orderby', 'createdon desc')
    url.searchParams.set('$top', '2')
    const result = await dataverseResponse(url.toString(), authorization)
    if (!Array.isArray(result.body?.value)) throw new Error('Dataverse returned invalid approval-document data.')
    return result.body.value[0] || null
}

function finalizationBatch(review, revisionId, documentId, reviewEtag, generatedAt) {
    const boundary = `batch_${randomBytes(12).toString('hex')}`
    const changeset = `changeset_${randomBytes(12).toString('hex')}`
    const requests = []
    const add = (contentId, method, path, body, extraHeaders = []) => requests.push([
        `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', `Content-ID: ${contentId}`, '',
        `${method} ${path} HTTP/1.1`, 'Content-Type: application/json;type=entry', ...extraHeaders, '', JSON.stringify(body),
    ].join('\r\n'))
    add(1, 'PATCH', `gr_chargeableinvoicedocuments(${documentId})`, { gr_uploadstatus: UPLOAD_COMPLETE, gr_uploaderror: null })
    add(2, 'PATCH', `gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`, { gr_name: review.gr_name }, [`If-Match: ${reviewEtag}`])
    add(3, 'POST', 'gr_chargeableinvoiceactivities', {
        gr_name: 'Approval PDF generated',
        'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`,
        'gr_Revision@odata.bind': `/gr_chargeableinvoicerevisions(${revisionId})`,
        'gr_Document@odata.bind': `/gr_chargeableinvoicedocuments(${documentId})`,
        gr_event: ACTIVITY_APPROVAL_PDF_GENERATED,
        gr_detail: `Customer PO approval document generated using ${TEMPLATE_VERSION}.`,
        gr_occurredon: generatedAt.toISOString(),
    })
    return {
        boundary,
        payload: [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, '', ...requests, `--${changeset}--`, `--${boundary}--`, ''].join('\r\n'),
    }
}

async function markFailed(origin, authorization, documentId) {
    await fetch(`${origin}/api/data/v9.2/gr_chargeableinvoicedocuments(${documentId})`, {
        method: 'PATCH', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gr_uploadstatus: UPLOAD_FAILED,
            gr_uploaderror: 'Approval PDF generation did not complete. Refresh the review before retrying.',
        }),
    }).catch(() => {})
}

async function reconcileDocument(origin, authorization, documentId) {
    try {
        const result = await dataverseResponse(selectUrl(origin, 'gr_chargeableinvoicedocuments', documentId,
            'gr_chargeableinvoicedocumentid,gr_name,_gr_review_value,_gr_revision_value,gr_documenttype,gr_contenttype,gr_bytecount,gr_templateversion,gr_sourcesnapshothash,gr_uploadstatus,gr_filename,createdon'), authorization)
        return result.body?.gr_uploadstatus === UPLOAD_COMPLETE ? result.body : null
    } catch {
        return null
    }
}

async function generate(request) {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' })
    const manager = await validateManager(request)
    if (manager.error) return manager.error
    if (!approvalEnabled()) {
        return jsonResponse(503, { error: 'Approval PDF generation is not enabled in this environment.' })
    }
    const contract = requestContract(request.body)
    if (contract.error) return jsonResponse(400, { error: contract.error })
    let documentId = ''
    try {
        const source = await readAuthoritativeSnapshot(manager.origin, manager.authorization, contract)
        const snapshot = approvalSnapshot(source)
        const hash = canonicalSnapshotHash(snapshot)
        const existing = await findExisting(manager.origin, manager.authorization, contract.reviewId, contract.revisionId, hash)
        if (existing) return jsonResponse(200, { document: existing, generated: false })
        const generatedAt = new Date()
        const pdf = await renderApprovalPdf(snapshot, generatedAt)
        if (pdf.length < 1 || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
            throw new Error('The approval document did not pass PDF validation.')
        }
        const filename = safeFilename(snapshot.jobNumber || snapshot.invoiceNumber)
        const create = await dataverseResponse(`${manager.origin}/api/data/v9.2/gr_chargeableinvoicedocuments`, manager.authorization, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify({
                gr_name: filename, 'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${contract.reviewId})`,
                'gr_Revision@odata.bind': `/gr_chargeableinvoicerevisions(${contract.revisionId})`,
                gr_documenttype: DOCUMENT_TYPE_APPROVAL_PDF, gr_contenttype: 'application/pdf', gr_bytecount: pdf.length,
                gr_templateversion: TEMPLATE_VERSION, gr_sourcesnapshothash: hash, gr_uploadstatus: UPLOAD_PENDING,
            }),
        })
        documentId = create.body?.gr_chargeableinvoicedocumentid || ''
        if (!UUID.test(documentId)) throw new Error('Dataverse returned invalid approval-document metadata.')
        await dataverseResponse(`${manager.origin}/api/data/v9.2/gr_chargeableinvoicedocuments(${documentId})/gr_file?x-ms-file-name=${encodeURIComponent(filename)}`, manager.authorization, {
            method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: pdf,
        })
        const batch = finalizationBatch(source.review, contract.revisionId, documentId, source.currentEtag, generatedAt)
        let finalResponse
        try {
            finalResponse = await fetch(`${manager.origin}/api/data/v9.2/$batch`, {
                method: 'POST', headers: { Authorization: manager.authorization, Accept: 'application/json', 'Content-Type': `multipart/mixed;boundary=${batch.boundary}` }, body: batch.payload,
            })
        } catch {
            const reconciled = await reconcileDocument(manager.origin, manager.authorization, documentId)
            if (reconciled) return jsonResponse(200, { document: reconciled, generated: true })
            throw new UnknownApprovalOutcomeError()
        }
        const responseText = await finalResponse.text()
        const nestedFailure = [...responseText.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((match) => Number(match[1])).find((status) => status >= 400)
        if (!finalResponse.ok || nestedFailure) {
            const error = new Error(`Dataverse finalisation failed (${nestedFailure || finalResponse.status}).`)
            error.status = nestedFailure || finalResponse.status
            throw error
        }
        const reconciled = await reconcileDocument(manager.origin, manager.authorization, documentId)
        if (!reconciled) throw new UnknownApprovalOutcomeError()
        return jsonResponse(200, { document: reconciled, generated: true })
    } catch (error) {
        if (error instanceof UnknownApprovalOutcomeError) {
            return jsonResponse(503, { error: 'The approval PDF outcome is unknown. Refresh the review before retrying.' })
        }
        if (documentId) await markFailed(manager.origin, manager.authorization, documentId)
        if (error?.status === 412) return jsonResponse(412, { error: 'This invoice review changed in Dataverse. Refresh it before generating the approval PDF.' })
        if (error?.status === 409) return jsonResponse(409, { error: error.message })
        return jsonResponse(503, { error: 'The approval PDF could not be generated safely.' })
    }
}

module.exports = {
    generate,
    test: { approvalEnabled, requestContract, canonicalSnapshotHash, safeFilename, finalizationBatch },
}
