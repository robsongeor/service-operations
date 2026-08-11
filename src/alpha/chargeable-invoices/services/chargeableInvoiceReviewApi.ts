import {
    CHARGEABLE_INVOICE_IMPORT_STATUSES,
    CHARGEABLE_INVOICE_DISPOSITIONS,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    type ChargeableInvoiceActivity,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceDocument,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceReview,
    type ChargeableInvoiceRevision,
    type ChargeableInvoiceWaitingOn,
    type ChargeableInvoiceWorkspace,
} from '../types/chargeableInvoice.types.ts'
import {
    getReadyToProcessBlockers,
    validateChargeableInvoiceRequirements,
    validateDoNotProcess,
    type ChargeableInvoiceRequirementsDraft,
} from '../domain/chargeableInvoiceState.ts'
import {
    buildChargeableInvoiceCorrectionFields,
    type ChargeableInvoiceCorrectionDraft,
} from '../domain/chargeableInvoiceCorrectionDraft.ts'

const API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? 'https://invalid.local'}/api/data/v9.2`
const MAX_QUEUE_RECORDS = 500
const MAX_DETAIL_RECORDS = 500

function headers(accessToken: string) {
    return { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
}

function safeError(status: number, action: string) {
    if (status === 401) return new Error(`Your session expired while ${action}. Sign in again and retry.`)
    if (status === 403) return new Error('Chargeable Invoice Manager access is required.')
    if (status === 412) return new Error('This invoice review changed in Dataverse. Refresh it before saving.')
    return new Error(`${action} failed safely (Dataverse ${status}).`)
}

function trustedNextLink(value: unknown) {
    if (typeof value !== 'string' || !value) return undefined
    const next = new URL(value)
    const root = new URL(API_URL)
    if (next.origin !== root.origin || !next.pathname.startsWith(`${root.pathname}/`)) {
        throw new Error('Dataverse returned an untrusted continuation link.')
    }
    return next.toString()
}

async function readAll<T>(accessToken: string, initialUrl: string, limit: number) {
    const records: T[] = []
    let nextUrl: string | undefined = initialUrl
    while (nextUrl) {
        const response = await fetch(nextUrl, { headers: headers(accessToken) })
        if (!response.ok) throw safeError(response.status, 'loading Chargeable Invoice Review data')
        const body = await response.json() as { value?: T[]; '@odata.nextLink'?: string }
        if (!Array.isArray(body.value)) throw new Error('Dataverse returned invalid Chargeable Invoice Review data.')
        records.push(...body.value)
        if (records.length > limit) throw new Error(`Chargeable Invoice Review returned more than ${limit} records. Narrow the scope before continuing.`)
        nextUrl = trustedNextLink(body['@odata.nextLink'])
    }
    return records
}

const reviewSelect = [
    'gr_chargeableinvoicereviewid', 'gr_name', 'gr_invoicenumber', 'gr_invoicedate',
    'gr_greentreereference', 'gr_matchstatus', 'gr_importstatus', 'gr_reviewstartedon',
    'gr_waitingon', 'gr_waitingnote', 'gr_porequired', 'gr_ponumber', 'gr_poreceivedon',
    'gr_photosrequired', 'gr_photosstatus', 'gr_photorequestpreparedon',
    'gr_porequestpreparedon', 'gr_disposition', 'gr_dispositionon', 'gr_dispositionreason',
    '_gr_job_value', '_gr_customer_value', '_gr_site_value', '_gr_equipment_value',
    '_gr_currentrevision_value', 'createdon', 'modifiedon',
].join(',')

const reviewExpand = [
    'gr_CurrentRevision($select=gr_chargeableinvoicerevisionid,gr_revisionnumber,gr_total,gr_rawordernumber,gr_headline,gr_dateofjob)',
    'gr_Job($select=gr_jobid,gr_jobnumber,gr_description)',
    'gr_Customer($select=gr_customerid,gr_name)',
    'gr_Site($select=gr_siteid,gr_name)',
    'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial)',
].join(',')

export async function fetchChargeableInvoiceReviews(accessToken: string) {
    const url = new URL(`${API_URL}/gr_chargeableinvoicereviews`)
    url.searchParams.set('$select', reviewSelect)
    url.searchParams.set('$expand', reviewExpand)
    url.searchParams.set('$filter', `gr_importstatus eq ${CHARGEABLE_INVOICE_IMPORT_STATUSES.ACTIVE}`)
    url.searchParams.set('$orderby', 'modifiedon desc')
    return readAll<ChargeableInvoiceReview>(accessToken, url.toString(), MAX_QUEUE_RECORDS)
}

async function fetchReview(accessToken: string, reviewId: string) {
    const url = new URL(`${API_URL}/gr_chargeableinvoicereviews(${reviewId})`)
    url.searchParams.set('$select', reviewSelect)
    url.searchParams.set('$expand', reviewExpand)
    const response = await fetch(url, { headers: headers(accessToken) })
    if (!response.ok) throw safeError(response.status, 'refreshing the invoice review')
    return response.json() as Promise<ChargeableInvoiceReview>
}

function detailUrl(entitySet: string, select: string, reviewId: string, orderby?: string) {
    const url = new URL(`${API_URL}/${entitySet}`)
    url.searchParams.set('$select', select)
    url.searchParams.set('$filter', `_gr_review_value eq ${reviewId}`)
    if (orderby) url.searchParams.set('$orderby', orderby)
    return url.toString()
}

export async function fetchChargeableInvoiceWorkspace(accessToken: string, reviewId: string): Promise<ChargeableInvoiceWorkspace> {
    const [review, revisions, corrections, documents, activities] = await Promise.all([
        fetchReview(accessToken, reviewId),
        readAll<ChargeableInvoiceRevision>(accessToken, detailUrl('gr_chargeableinvoicerevisions', [
            'gr_chargeableinvoicerevisionid', 'gr_name', '_gr_review_value', '_gr_sourcedocument_value',
            'gr_revisionnumber', 'gr_extractionversion', 'gr_extractionconfidence', 'gr_invoicenumber',
            'gr_invoicedate', 'gr_rawordernumber', 'gr_greentreereference', 'gr_accountsnapshot',
            'gr_customersnapshot', 'gr_sitesnapshot', 'gr_headline', 'gr_fleet', 'gr_make', 'gr_model',
            'gr_serial', 'gr_meter', 'gr_dateofjob', 'gr_serviceinterval', 'gr_nextdue',
            'gr_repairdescription', 'gr_workcompleted', 'gr_subtotal', 'gr_gstrate', 'gr_gstamount',
            'gr_total', 'gr_extractionjson', 'createdon',
        ].join(','), reviewId, 'gr_revisionnumber desc'), MAX_DETAIL_RECORDS),
        readAll<ChargeableInvoiceCorrection>(accessToken, detailUrl('gr_chargeableinvoicecorrections', [
            'gr_chargeableinvoicecorrectionid', '_gr_review_value', '_gr_sourcerevision_value',
            '_gr_sourceline_value', 'gr_correctiontype', 'gr_fieldkey', 'gr_originalsnapshot',
            'gr_requestedtext', 'gr_requestedlinetype', 'gr_requesteddescription',
            'gr_requestedquantity', 'gr_requestedunitprice', 'gr_comparisonstatus', '_gr_matchedrevision_value',
        ].join(','), reviewId), MAX_DETAIL_RECORDS),
        readAll<ChargeableInvoiceDocument>(accessToken, detailUrl('gr_chargeableinvoicedocuments', [
            'gr_chargeableinvoicedocumentid', 'gr_name', '_gr_review_value', '_gr_revision_value',
            'gr_documenttype', 'gr_contenttype', 'gr_bytecount', 'gr_templateversion',
            'gr_sourcesnapshothash', 'gr_uploadstatus', 'gr_uploaderror', 'gr_filename', 'createdon',
        ].join(','), reviewId, 'createdon desc'), MAX_DETAIL_RECORDS),
        readAll<ChargeableInvoiceActivity>(accessToken, detailUrl('gr_chargeableinvoiceactivities', [
            'gr_chargeableinvoiceactivityid', 'gr_name', '_gr_review_value', '_gr_revision_value',
            '_gr_document_value', '_gr_correction_value', 'gr_event', 'gr_detail', 'gr_occurredon',
            'createdon', '_createdby_value',
        ].join(','), reviewId, 'gr_occurredon desc'), MAX_DETAIL_RECORDS),
    ])
    if (revisions.length > 50) throw new Error('This review has more than 50 revisions and cannot be opened safely.')
    const revisionIds = revisions.map((item) => item.gr_chargeableinvoicerevisionid)
    const lines = revisionIds.length ? await readAll<ChargeableInvoiceLine>(accessToken, (() => {
        const url = new URL(`${API_URL}/gr_chargeableinvoicelines`)
        url.searchParams.set('$select', 'gr_chargeableinvoicelineid,_gr_revision_value,gr_linekey,gr_linetype,gr_description,gr_quantity,gr_unitprice,gr_extendedprice,gr_sortorder,gr_confidence,gr_rawtext')
        url.searchParams.set('$filter', revisionIds.map((id) => `_gr_revision_value eq ${id}`).join(' or '))
        url.searchParams.set('$orderby', 'gr_sortorder asc')
        return url.toString()
    })(), MAX_DETAIL_RECORDS) : []
    return { review, revisions, lines, corrections, documents, activities }
}

type ReviewTransition = {
    fields: Record<string, unknown>
    event: number
    name: string
    detail?: string
}

function transitionBatch(review: ChargeableInvoiceReview, transition: ReviewTransition) {
    if (!review['@odata.etag']) throw new Error('Refresh the invoice review before saving changes.')
    const boundary = `batch_${crypto.randomUUID().replaceAll('-', '')}`
    const changeset = `changeset_${crypto.randomUUID().replaceAll('-', '')}`
    const now = new Date().toISOString()
    const requests = [
        [
            `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', 'Content-ID: 1', '',
            `PATCH gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid}) HTTP/1.1`,
            'Content-Type: application/json;type=entry', `If-Match: ${review['@odata.etag']}`, '',
            JSON.stringify(transition.fields),
        ].join('\r\n'),
        [
            `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', 'Content-ID: 2', '',
            'POST gr_chargeableinvoiceactivities HTTP/1.1', 'Content-Type: application/json;type=entry', '',
            JSON.stringify({
                gr_name: transition.name,
                'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`,
                ...(review._gr_currentrevision_value ? { 'gr_Revision@odata.bind': `/gr_chargeableinvoicerevisions(${review._gr_currentrevision_value})` } : {}),
                gr_event: transition.event,
                gr_detail: transition.detail?.trim() || null,
                gr_occurredon: now,
            }),
        ].join('\r\n'),
    ]
    return {
        boundary,
        payload: [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, '', ...requests, `--${changeset}--`, `--${boundary}--`, ''].join('\r\n'),
    }
}

async function applyTransition(accessToken: string, review: ChargeableInvoiceReview, transition: ReviewTransition) {
    const batch = transitionBatch(review, transition)
    const response = await fetch(`${API_URL}/$batch`, {
        method: 'POST',
        headers: { ...headers(accessToken), 'Content-Type': `multipart/mixed;boundary=${batch.boundary}` },
        body: batch.payload,
    })
    const responseText = await response.text()
    const nestedStatuses = [...responseText.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((match) => Number(match[1]))
    const nestedFailure = nestedStatuses.find((status) => status >= 400)
    if (!response.ok || nestedFailure) {
        throw safeError(nestedFailure || response.status, 'saving the invoice review')
    }
    return fetchChargeableInvoiceWorkspace(accessToken, review.gr_chargeableinvoicereviewid)
}

export function startChargeableInvoiceReview(accessToken: string, review: ChargeableInvoiceReview) {
    if (review.gr_reviewstartedon) throw new Error('This invoice review has already been started.')
    return applyTransition(accessToken, review, {
        fields: { gr_reviewstartedon: new Date().toISOString() },
        event: 122830002,
        name: 'Review started',
    })
}

export function saveChargeableInvoiceWaiting(
    accessToken: string,
    review: ChargeableInvoiceReview,
    waitingOn: ChargeableInvoiceWaitingOn | null,
    waitingNote: string,
) {
    if (!review.gr_reviewstartedon) throw new Error('Start the review before changing Waiting.')
    if (waitingOn != null && !waitingNote.trim()) throw new Error('Enter a waiting note describing what is outstanding.')
    if (review.gr_disposition != null) throw new Error('A historical invoice review cannot be changed to Waiting.')
    return applyTransition(accessToken, review, {
        fields: { gr_waitingon: waitingOn, gr_waitingnote: waitingOn == null ? null : waitingNote.trim() },
        event: 122830005,
        name: waitingOn == null ? 'Waiting resolved' : 'Waiting changed',
        detail: waitingOn == null ? 'Waiting state resolved.' : waitingNote,
    })
}

export function saveChargeableInvoiceRequirements(
    accessToken: string,
    review: ChargeableInvoiceReview,
    draft: ChargeableInvoiceRequirementsDraft,
) {
    if (!review.gr_reviewstartedon) throw new Error('Start the review before recording PO or photo decisions.')
    if (review.gr_disposition != null) throw new Error('A historical invoice review cannot be changed.')
    const validation = validateChargeableInvoiceRequirements(draft)
    if (validation) throw new Error(validation)
    const photosStatus = draft.photosRequired === true
        ? draft.photosStatus ?? CHARGEABLE_INVOICE_PHOTO_STATUSES.NOT_REQUESTED
        : draft.photosRequired === false ? CHARGEABLE_INVOICE_PHOTO_STATUSES.NOT_REQUESTED : null
    return applyTransition(accessToken, review, {
        fields: {
            gr_porequired: draft.poRequired,
            gr_ponumber: draft.poRequired ? draft.poNumber.trim() || null : null,
            gr_poreceivedon: draft.poRequired && draft.poReceived ? review.gr_poreceivedon || new Date().toISOString() : null,
            gr_photosrequired: draft.photosRequired,
            gr_photosstatus: photosStatus,
        },
        event: 122830011,
        name: 'PO and photo requirements changed',
        detail: `PO required: ${draft.poRequired == null ? 'Undecided' : draft.poRequired ? 'Yes' : 'No'}; photos required: ${draft.photosRequired == null ? 'Undecided' : draft.photosRequired ? 'Yes' : 'No'}.`,
    })
}

export async function markChargeableInvoiceReady(accessToken: string, review: ChargeableInvoiceReview) {
    if (review.gr_disposition != null) throw new Error('This invoice review already has a terminal disposition.')
    const blockers = getReadyToProcessBlockers(review)
    if (blockers.length) throw new Error(blockers[0])
    const correctionUrl = new URL(`${API_URL}/gr_chargeableinvoicecorrections`)
    correctionUrl.searchParams.set('$select', 'gr_chargeableinvoicecorrectionid')
    correctionUrl.searchParams.set('$filter', `_gr_review_value eq ${review.gr_chargeableinvoicereviewid} and (gr_comparisonstatus eq ${CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING} or gr_comparisonstatus eq ${CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE})`)
    correctionUrl.searchParams.set('$top', '1')
    const correctionResponse = await fetch(correctionUrl, { headers: headers(accessToken) })
    if (!correctionResponse.ok) throw safeError(correctionResponse.status, 'checking outstanding invoice corrections')
    const correctionBody = await correctionResponse.json() as { value?: unknown[] }
    if (!Array.isArray(correctionBody.value)) throw new Error('Dataverse returned invalid correction status data.')
    if (correctionBody.value.length) throw new Error('Resolve all outstanding invoice corrections before marking Ready to Process.')
    return applyTransition(accessToken, review, {
        fields: { gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.READY_TO_PROCESS, gr_dispositionon: new Date().toISOString(), gr_dispositionreason: null },
        event: 122830015,
        name: 'Ready to process',
    })
}

export function markChargeableInvoiceDoNotProcess(accessToken: string, review: ChargeableInvoiceReview, reason: string) {
    if (review.gr_disposition != null) throw new Error('This invoice review already has a terminal disposition.')
    const candidate = { ...review, gr_dispositionreason: reason }
    const validation = validateDoNotProcess(candidate)
    if (validation) throw new Error(validation)
    return applyTransition(accessToken, review, {
        fields: { gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.DO_NOT_PROCESS, gr_dispositionon: new Date().toISOString(), gr_dispositionreason: reason.trim() },
        event: 122830016,
        name: 'Do not process',
        detail: reason,
    })
}

export async function createChargeableInvoiceCorrection(
    accessToken: string,
    workspace: ChargeableInvoiceWorkspace,
    draft: ChargeableInvoiceCorrectionDraft,
) {
    const review = workspace.review
    if (!review.gr_reviewstartedon) throw new Error('Start the review before adding a correction.')
    if (review.gr_disposition != null) throw new Error('Corrections cannot be added to a historical review.')
    if (!review['@odata.etag']) throw new Error('Refresh the invoice review before adding a correction.')
    const revision = workspace.revisions.find((item) => item.gr_chargeableinvoicerevisionid === review._gr_currentrevision_value)
        ?? workspace.revisions[0]
    if (!revision) throw new Error('The current invoice revision is unavailable.')
    const revisionLines = workspace.lines.filter((line) => line._gr_revision_value === revision.gr_chargeableinvoicerevisionid)
    const built = buildChargeableInvoiceCorrectionFields(draft, revision, revisionLines)
    if (built.error || !built.fields) throw new Error(built.error || 'The correction is invalid.')
    const boundary = `batch_${crypto.randomUUID().replaceAll('-', '')}`
    const changeset = `changeset_${crypto.randomUUID().replaceAll('-', '')}`
    const correctionName = `Correction - ${review.gr_invoicenumber} - ${new Date().toISOString()}`.slice(0, 200)
    const requests = [
        [
            `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', 'Content-ID: 1', '',
            `PATCH gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid}) HTTP/1.1`,
            'Content-Type: application/json;type=entry', `If-Match: ${review['@odata.etag']}`, '', JSON.stringify({ gr_name: review.gr_name }),
        ].join('\r\n'),
        [
            `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', 'Content-ID: 2', '',
            'POST gr_chargeableinvoicecorrections HTTP/1.1', 'Content-Type: application/json;type=entry', '',
            JSON.stringify({
                gr_name: correctionName,
                'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`,
                'gr_SourceRevision@odata.bind': `/gr_chargeableinvoicerevisions(${revision.gr_chargeableinvoicerevisionid})`,
                ...(built.sourceLineId ? { 'gr_SourceLine@odata.bind': `/gr_chargeableinvoicelines(${built.sourceLineId})` } : {}),
                ...built.fields,
            }),
        ].join('\r\n'),
        [
            `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', 'Content-ID: 3', '',
            'POST gr_chargeableinvoiceactivities HTTP/1.1', 'Content-Type: application/json;type=entry', '',
            JSON.stringify({
                gr_name: 'Correction added',
                'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`,
                'gr_Revision@odata.bind': `/gr_chargeableinvoicerevisions(${revision.gr_chargeableinvoicerevisionid})`,
                'gr_Correction@odata.bind': '$2',
                gr_event: 122830003,
                gr_detail: 'A structured correction was added for the current invoice revision.',
                gr_occurredon: new Date().toISOString(),
            }),
        ].join('\r\n'),
    ]
    const payload = [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, '', ...requests, `--${changeset}--`, `--${boundary}--`, ''].join('\r\n')
    const response = await fetch(`${API_URL}/$batch`, {
        method: 'POST', headers: { ...headers(accessToken), 'Content-Type': `multipart/mixed;boundary=${boundary}` }, body: payload,
    })
    const responseText = await response.text()
    const nestedFailure = [...responseText.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((match) => Number(match[1])).find((status) => status >= 400)
    if (!response.ok || nestedFailure) throw safeError(nestedFailure || response.status, 'adding the invoice correction')
    return fetchChargeableInvoiceWorkspace(accessToken, review.gr_chargeableinvoicereviewid)
}

export async function downloadChargeableInvoiceDocument(accessToken: string, document: ChargeableInvoiceDocument) {
    const response = await fetch(`${API_URL}/gr_chargeableinvoicedocuments(${document.gr_chargeableinvoicedocumentid})/gr_file/$value`, {
        headers: headers(accessToken),
    })
    if (!response.ok) throw safeError(response.status, 'downloading the invoice document')
    const blob = await response.blob()
    if (blob.size !== document.gr_bytecount) throw new Error('The downloaded document size does not match Dataverse metadata.')
    return blob
}

export const chargeableInvoiceReviewApiTest = { trustedNextLink, transitionBatch }
