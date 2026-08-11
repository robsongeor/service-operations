import type { GreenTreeInvoiceCandidate } from '../domain/greenTreeInvoiceExtraction.ts'
import type { ChargeableInvoiceMatchStatus } from '../types/chargeableInvoice.types.ts'

const MAX_PDF_BYTES = 5 * 1024 * 1024

export type ChargeableInvoicePreviewJob = {
    gr_jobid: string
    gr_jobnumber: string
    gr_description?: string | null
    _gr_site_value?: string | null
    _gr_equipment_value?: string | null
    gr_Site?: {
        gr_siteid: string
        gr_name: string
        gr_Customer?: { gr_customerid: string; gr_name: string } | null
    } | null
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet?: string | null
        gr_make?: string | null
        gr_model?: string | null
        gr_serial?: string | null
    } | null
}

export type ChargeableInvoicePreview = {
    file: { fileName: string; byteLength: number; contentType: 'application/pdf' }
    candidate: GreenTreeInvoiceCandidate
    match: {
        status: ChargeableInvoiceMatchStatus
        job: ChargeableInvoicePreviewJob | null
        reason: string | null
    }
    duplicate: {
        kind: 'new' | 'revision' | 'retry' | 'conflict' | 'unresolved'
        proposedRevisionNumber?: number
        review?: {
            gr_chargeableinvoicereviewid: string
            gr_invoicenumber: string
            gr_importstatus: number
            _gr_currentrevision_value?: string | null
        } | null
        reason: string | null
    }
}

export class ChargeableInvoicePreviewError extends Error {
    readonly status: number

    constructor(message: string, status: number) {
        super(message)
        this.name = 'ChargeableInvoicePreviewError'
        this.status = status
    }
}

export function validateChargeableInvoicePdf(file: Pick<File, 'name' | 'size' | 'type'>) {
    if (!file.name.trim() || !file.name.toLowerCase().endsWith('.pdf')) return 'Choose a PDF invoice.'
    if (file.type.toLowerCase() !== 'application/pdf') return 'Only PDF invoices are supported.'
    if (file.size < 1) return 'The selected PDF is empty.'
    if (file.size > MAX_PDF_BYTES) return 'Each PDF must be no larger than 5 MiB.'
    return null
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer)
    const chunkSize = 32_768
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return btoa(binary)
}

export async function previewChargeableInvoicePdf(accessToken: string, file: File) {
    const validation = validateChargeableInvoicePdf(file)
    if (validation) throw new Error(validation)
    const response = await fetch('/api/chargeableinvoicepreview', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            byteLength: file.size,
            base64: arrayBufferToBase64(await file.arrayBuffer()),
        }),
    })
    const body = await response.json().catch(() => null) as (ChargeableInvoicePreview & { error?: string }) | null
    if (!response.ok) throw new ChargeableInvoicePreviewError(body?.error || 'Invoice preview could not be completed.', response.status)
    if (!body?.candidate || !body.match || !body.file || !body.duplicate) throw new Error('Invoice preview returned an invalid response.')
    return body
}

export async function lookupChargeableInvoiceJob(accessToken: string, jobNumber: string) {
    const response = await fetch('/api/chargeableinvoicepreview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'jobLookup', jobNumber: jobNumber.trim() }),
    })
    const body = await response.json().catch(() => null) as { match?: ChargeableInvoicePreview['match']; error?: string } | null
    if (!response.ok) throw new ChargeableInvoicePreviewError(body?.error || 'Job lookup could not be completed.', response.status)
    if (!body?.match) throw new Error('Job lookup returned an invalid response.')
    return body.match
}

export async function importChargeableInvoicePdf(
    accessToken: string,
    file: File,
    decision: 'new' | 'revision' | 'retry',
    job: ChargeableInvoicePreviewJob,
) {
    const response = await fetch('/api/chargeableinvoicepreview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'import', decision, jobId: job.gr_jobid, jobNumber: job.gr_jobnumber,
            fileName: file.name, contentType: file.type, byteLength: file.size,
            base64: arrayBufferToBase64(await file.arrayBuffer()),
        }),
    })
    const body = await response.json().catch(() => null) as { imported?: boolean; reviewId?: string; revisionNumber?: number; error?: string } | null
    if (!response.ok) throw new ChargeableInvoicePreviewError(body?.error || 'Invoice import could not be completed.', response.status)
    if (!body?.imported || !body.reviewId || !body.revisionNumber) throw new Error('Invoice import returned an invalid response.')
    return body
}
