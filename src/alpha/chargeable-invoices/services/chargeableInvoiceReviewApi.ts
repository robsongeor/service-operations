import {
    CHARGEABLE_INVOICE_IMPORT_STATUSES,
    CHARGEABLE_INVOICE_DISPOSITIONS,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_DOCUMENT_TYPES,
    CHARGEABLE_INVOICE_UPLOAD_STATUSES,
    type ChargeableInvoiceActivity,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceDocument,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceReview,
    type ChargeableInvoiceRevision,
    type ChargeableInvoiceTechnician,
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
import { buildMailtoUrl } from '../../jobs/utils/technicianMailto.ts'

const API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? 'https://invalid.local'}/api/data/v9.2`
const MAX_QUEUE_RECORDS = 500
const MAX_DETAIL_RECORDS = 500
const MAX_TECHNICIANS = 200
export const MAX_CHARGEABLE_INVOICE_PHOTOS = 20
export const MAX_CHARGEABLE_INVOICE_PHOTO_BYTES = 5 * 1024 * 1024

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
    '_gr_photorequesttechnician_value',
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
    const technicianUrl = new URL(`${API_URL}/gr_mechanics`)
    technicianUrl.searchParams.set('$select', 'gr_mechanicid,gr_name,gr_email,statecode')
    technicianUrl.searchParams.set('$filter', 'statecode eq 0')
    technicianUrl.searchParams.set('$orderby', 'gr_name asc')
    const [review, revisions, corrections, documents, activities, technicians] = await Promise.all([
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
            'createdon',
        ].join(','), reviewId, 'createdon asc'), MAX_DETAIL_RECORDS),
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
        readAll<ChargeableInvoiceTechnician>(accessToken, technicianUrl.toString(), MAX_TECHNICIANS),
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
    return { review, revisions, lines, corrections, documents, activities, technicians }
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

function assertPhotoWorkflow(review: ChargeableInvoiceReview) {
    if (!review.gr_reviewstartedon) throw new Error('Start the review before requesting or uploading photos.')
    if (review.gr_disposition != null) throw new Error('Photos cannot be changed on a historical review.')
    if (review.gr_photosrequired !== true) throw new Error('Record that supporting photos are required before continuing.')
}

export function buildChargeableInvoicePhotoRequestMailto(
    review: ChargeableInvoiceReview,
    technician: ChargeableInvoiceTechnician,
) {
    const firstName = technician.gr_name.trim().split(/\s+/)[0] || 'there'
    const equipment = [review.gr_Equipment?.gr_make, review.gr_Equipment?.gr_model].filter(Boolean).join(' ').trim()
    const subject = `Photos required - Job ${review.gr_Job?.gr_jobnumber || review.gr_greentreereference} - Invoice ${review.gr_invoicenumber}`
    const body = [
        `Hi ${firstName},`, '',
        'Please reply with the supporting photos for the completed work below.', '',
        `Job: ${review.gr_Job?.gr_jobnumber || review.gr_greentreereference}`,
        `Invoice: ${review.gr_invoicenumber}`,
        `Customer: ${review.gr_Customer?.gr_name || 'Not recorded'}`,
        `Site: ${review.gr_Site?.gr_name || 'Not recorded'}`,
        `Equipment: ${[equipment, review.gr_Equipment?.gr_fleet ? `Fleet ${review.gr_Equipment.gr_fleet}` : '', review.gr_Equipment?.gr_serial ? `Serial ${review.gr_Equipment.gr_serial}` : ''].filter(Boolean).join(' - ') || 'Not recorded'}`,
        review.gr_Job?.gr_description ? `Work: ${review.gr_Job.gr_description.replace(/\s+/g, ' ').trim().slice(0, 600)}` : '', '',
        'This draft has not been sent automatically.', '', 'Thanks',
    ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
    return buildMailtoUrl({ recipient: technician.gr_email || '', subject, body })
}

export function saveChargeableInvoicePhotoTechnician(
    accessToken: string,
    review: ChargeableInvoiceReview,
    technician: ChargeableInvoiceTechnician,
) {
    assertPhotoWorkflow(review)
    if (technician.statecode !== 0) throw new Error('Choose an active technician.')
    if (!technician.gr_mechanicid) throw new Error('Choose a technician.')
    return applyTransition(accessToken, review, {
        fields: { 'gr_PhotoRequestTechnician@odata.bind': `/gr_mechanics(${technician.gr_mechanicid})` },
        event: 122830006,
        name: 'Photo request technician selected',
        detail: `Technician selected: ${technician.gr_name.trim()}.`,
    })
}

export async function prepareChargeableInvoicePhotoRequest(
    accessToken: string,
    workspace: ChargeableInvoiceWorkspace,
) {
    const review = workspace.review
    assertPhotoWorkflow(review)
    const technician = workspace.technicians.find((item) => item.gr_mechanicid.toLowerCase()
        === review._gr_photorequesttechnician_value?.toLowerCase())
    if (!technician) throw new Error('Select and save an active technician before preparing the photo request.')
    const mailto = buildChargeableInvoicePhotoRequestMailto(review, technician)
    const next = await applyTransition(accessToken, review, {
        fields: {
            gr_photorequestpreparedon: new Date().toISOString(),
            gr_photosstatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.REQUESTED,
        },
        event: 122830007,
        name: 'Photo request prepared',
        detail: `An unsent email draft was prepared for ${technician.gr_name.trim()}.`,
    })
    return { workspace: next, mailto }
}

type PreparedSupportingPhoto = {
    file: File
    contentType: 'image/jpeg' | 'image/png' | 'image/heic' | 'image/heif'
    hash: string
}

function detectedPhotoType(bytes: Uint8Array): PreparedSupportingPhoto['contentType'] | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') {
        const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase()
        if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic'
        if (['mif1', 'msf1', 'heif'].includes(brand)) return 'image/heif'
    }
    return null
}

function allowedExtension(fileName: string, contentType: PreparedSupportingPhoto['contentType']) {
    const extension = fileName.trim().toLowerCase().match(/\.[^.]+$/)?.[0]
    return contentType === 'image/jpeg' ? extension === '.jpg' || extension === '.jpeg'
        : contentType === 'image/png' ? extension === '.png'
            : contentType === 'image/heic' ? extension === '.heic'
                : extension === '.heif'
}

async function sha256Hex(buffer: ArrayBuffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function validateChargeableInvoiceSupportingPhotos(
    files: File[],
    documents: ChargeableInvoiceDocument[],
) {
    if (!files.length) throw new Error('Choose at least one supporting photo.')
    const existing = documents.filter((document) => document.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO
        && document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE)
    if (files.length + existing.length > MAX_CHARGEABLE_INVOICE_PHOTOS) {
        throw new Error(`A review may retain at most ${MAX_CHARGEABLE_INVOICE_PHOTOS} supporting photos.`)
    }
    const hashes = new Set(existing.map((document) => document.gr_sourcesnapshothash).filter(Boolean))
    const prepared: PreparedSupportingPhoto[] = []
    for (const file of files) {
        if (!file.name.trim() || file.name.length > 255 || file.size < 1 || file.size > MAX_CHARGEABLE_INVOICE_PHOTO_BYTES) {
            throw new Error('Each supporting photo must have a valid name and be no larger than 5 MiB.')
        }
        const buffer = await file.arrayBuffer()
        if (buffer.byteLength !== file.size) throw new Error('A supporting photo changed while it was being validated.')
        const contentType = detectedPhotoType(new Uint8Array(buffer))
        if (!contentType || !allowedExtension(file.name, contentType)
            || file.type && file.type.toLowerCase() !== contentType) {
            throw new Error('Supporting photos must be valid JPG, PNG, HEIC or HEIF files with matching extensions.')
        }
        const hash = await sha256Hex(buffer)
        if (hashes.has(hash)) throw new Error('The same supporting photo is already present or selected more than once.')
        hashes.add(hash)
        prepared.push({ file, contentType, hash })
    }
    return prepared
}

function photoFinalizationBatch(review: ChargeableInvoiceReview, documentIds: string[]) {
    if (!review['@odata.etag']) throw new Error('Refresh the invoice review before uploading photos.')
    const boundary = `batch_${crypto.randomUUID().replaceAll('-', '')}`
    const changeset = `changeset_${crypto.randomUUID().replaceAll('-', '')}`
    const requests: string[] = []
    const add = (contentId: number, method: string, path: string, body: Record<string, unknown>, extraHeaders: string[] = []) => requests.push([
        `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', `Content-ID: ${contentId}`, '',
        `${method} ${path} HTTP/1.1`, 'Content-Type: application/json;type=entry', ...extraHeaders, '', JSON.stringify(body),
    ].join('\r\n'))
    documentIds.forEach((id, index) => add(index + 1, 'PATCH', `gr_chargeableinvoicedocuments(${id})`, {
        gr_uploadstatus: CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE,
        gr_uploaderror: null,
    }))
    const reviewContentId = documentIds.length + 1
    add(reviewContentId, 'PATCH', `gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`, {
        gr_photosstatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
    }, [`If-Match: ${review['@odata.etag']}`])
    add(reviewContentId + 1, 'POST', 'gr_chargeableinvoiceactivities', {
        gr_name: 'Photos received',
        'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`,
        ...(review._gr_currentrevision_value ? { 'gr_Revision@odata.bind': `/gr_chargeableinvoicerevisions(${review._gr_currentrevision_value})` } : {}),
        gr_event: 122830008,
        gr_detail: `${documentIds.length} supporting photo${documentIds.length === 1 ? '' : 's'} uploaded.`,
        gr_occurredon: new Date().toISOString(),
    })
    return {
        boundary,
        payload: [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, '', ...requests, `--${changeset}--`, `--${boundary}--`, ''].join('\r\n'),
    }
}

async function markPhotoDocumentsFailed(accessToken: string, documentIds: string[]) {
    await Promise.all(documentIds.map((id) => fetch(`${API_URL}/gr_chargeableinvoicedocuments(${id})`, {
        method: 'PATCH', headers: { ...headers(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gr_uploadstatus: CHARGEABLE_INVOICE_UPLOAD_STATUSES.FAILED,
            gr_uploaderror: 'Supporting photo upload did not complete. Select the files and retry.',
        }),
    }).catch(() => null)))
}

export async function uploadChargeableInvoiceSupportingPhotos(
    accessToken: string,
    workspace: ChargeableInvoiceWorkspace,
    files: File[],
) {
    const review = workspace.review
    assertPhotoWorkflow(review)
    if (!review._gr_photorequesttechnician_value || !workspace.technicians.some((technician) =>
        technician.gr_mechanicid.toLowerCase() === review._gr_photorequesttechnician_value?.toLowerCase())) {
        throw new Error('Select and save an active photo-request technician before uploading photos.')
    }
    const prepared = await validateChargeableInvoiceSupportingPhotos(files, workspace.documents)
    const documentIds: string[] = []
    try {
        for (const photo of prepared) {
            const create = await fetch(`${API_URL}/gr_chargeableinvoicedocuments`, {
                method: 'POST', headers: { ...headers(accessToken), 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify({
                    gr_name: photo.file.name.trim(),
                    'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${review.gr_chargeableinvoicereviewid})`,
                    ...(review._gr_currentrevision_value ? { 'gr_Revision@odata.bind': `/gr_chargeableinvoicerevisions(${review._gr_currentrevision_value})` } : {}),
                    gr_documenttype: CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO,
                    gr_contenttype: photo.contentType,
                    gr_bytecount: photo.file.size,
                    gr_sourcesnapshothash: photo.hash,
                    gr_uploadstatus: CHARGEABLE_INVOICE_UPLOAD_STATUSES.PENDING,
                }),
            })
            if (!create.ok) throw safeError(create.status, 'creating supporting photo metadata')
            const document = await create.json() as { gr_chargeableinvoicedocumentid?: string }
            if (!document.gr_chargeableinvoicedocumentid) throw new Error('Dataverse returned invalid supporting photo metadata.')
            documentIds.push(document.gr_chargeableinvoicedocumentid)
            const upload = await fetch(`${API_URL}/gr_chargeableinvoicedocuments(${document.gr_chargeableinvoicedocumentid})/gr_file?x-ms-file-name=${encodeURIComponent(photo.file.name.trim())}`, {
                method: 'PATCH', headers: { ...headers(accessToken), 'Content-Type': 'application/octet-stream' }, body: photo.file,
            })
            if (!upload.ok) throw safeError(upload.status, 'uploading a supporting photo')
        }
    } catch (error) {
        await markPhotoDocumentsFailed(accessToken, documentIds)
        throw error
    }
    const batch = photoFinalizationBatch(review, documentIds)
    let response: Response
    try {
        response = await fetch(`${API_URL}/$batch`, {
            method: 'POST', headers: { ...headers(accessToken), 'Content-Type': `multipart/mixed;boundary=${batch.boundary}` }, body: batch.payload,
        })
    } catch {
        try {
            const reconciled = await fetchChargeableInvoiceWorkspace(accessToken, review.gr_chargeableinvoicereviewid)
            if (documentIds.every((id) => reconciled.documents.some((document) => document.gr_chargeableinvoicedocumentid === id
                && document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE))
                && reconciled.review.gr_photosstatus === CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED) return reconciled
        } catch { /* preserve unknown outcome */ }
        throw new Error('The supporting photo upload outcome is unknown. Refresh the review before retrying.')
    }
    const responseText = await response.text()
    const nestedFailure = [...responseText.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((match) => Number(match[1])).find((status) => status >= 400)
    if (!response.ok || nestedFailure) {
        await markPhotoDocumentsFailed(accessToken, documentIds)
        throw safeError(nestedFailure || response.status, 'finalising supporting photos')
    }
    return fetchChargeableInvoiceWorkspace(accessToken, review.gr_chargeableinvoicereviewid)
}

export async function downloadChargeableInvoiceDocument(accessToken: string, document: ChargeableInvoiceDocument) {
    if (document.gr_uploadstatus !== CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE) {
        throw new Error('Only complete invoice documents can be downloaded.')
    }
    const response = await fetch(`${API_URL}/gr_chargeableinvoicedocuments(${document.gr_chargeableinvoicedocumentid})/gr_file/$value`, {
        headers: headers(accessToken),
    })
    if (!response.ok) throw safeError(response.status, 'downloading the invoice document')
    const blob = await response.blob()
    if (blob.size !== document.gr_bytecount) throw new Error('The downloaded document size does not match Dataverse metadata.')
    return blob
}

export async function generateChargeableInvoiceApprovalPdf(
    accessToken: string,
    workspace: ChargeableInvoiceWorkspace,
) {
    const review = workspace.review
    if (!review.gr_reviewstartedon) throw new Error('Start the review before generating an approval PDF.')
    if (review.gr_disposition != null) throw new Error('Approval PDFs cannot be generated for a historical review.')
    if (review.gr_porequired !== true) throw new Error('Record that a customer PO is required before generating an approval PDF.')
    if (!review._gr_currentrevision_value || !review['@odata.etag']) {
        throw new Error('Refresh the invoice review before generating an approval PDF.')
    }
    if (workspace.corrections.some((correction) =>
        correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING
        || correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE)) {
        throw new Error('Resolve all outstanding invoice corrections before generating the approval PDF.')
    }
    const response = await fetch('/api/chargeableinvoiceapproval', {
        method: 'POST',
        headers: { ...headers(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reviewId: review.gr_chargeableinvoicereviewid,
            revisionId: review._gr_currentrevision_value,
            reviewEtag: review['@odata.etag'],
        }),
    })
    const body = await response.json().catch(() => null) as { error?: string } | null
    if (!response.ok) {
        if ([400, 409, 412].includes(response.status) && body?.error) throw new Error(body.error)
        if (response.status === 401) throw new Error('Your session expired while generating the approval PDF. Sign in again and retry.')
        if (response.status === 403) throw new Error('Chargeable Invoice Manager access is required.')
        throw new Error(body?.error || 'The approval PDF could not be generated safely.')
    }
    return fetchChargeableInvoiceWorkspace(accessToken, review.gr_chargeableinvoicereviewid)
}

export const chargeableInvoiceReviewApiTest = { trustedNextLink, transitionBatch, photoFinalizationBatch, detectedPhotoType }
