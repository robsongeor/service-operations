import {
    CHARGEABLE_INVOICE_LINE_TYPES,
    type ChargeableInvoiceLineDraft,
    type ChargeableInvoiceLineType,
    type ChargeableInvoiceRevisionSnapshot,
} from '../types/chargeableInvoice.types.ts'

export type GreenTreeExtractionIssue = {
    code: string
    severity: 'error' | 'warning'
    message: string
    field?: string
    lineKey?: string
}

export type GreenTreeLineCandidate = {
    type: string
    description: string
    quantity?: string | number | null
    unitPrice?: string | number | null
    extendedPrice?: string | number | null
    rawText?: string | null
    confidence?: number | null
}

export type GreenTreeInvoiceCandidate = {
    invoiceNumber?: string | null
    invoiceDate?: string | null
    rawOrderNumber?: string | null
    greenTreeReference?: string | null
    accountSnapshot?: string | null
    customerSnapshot?: string | null
    siteSnapshot?: string | null
    headline?: string | null
    fleet?: string | null
    make?: string | null
    model?: string | null
    serial?: string | null
    meter?: string | number | null
    dateOfJob?: string | null
    serviceInterval?: string | null
    nextDue?: string | null
    repairDescription?: string | null
    workCompleted?: string | null
    subtotal?: string | number | null
    gstRate?: string | number | null
    gstAmount?: string | number | null
    total?: string | number | null
    lines: GreenTreeLineCandidate[]
    extractionVersion: string
    sourceEvidence: unknown
}

export type GreenTreeExtractionResult = {
    revision: ChargeableInvoiceRevisionSnapshot
    lines: ChargeableInvoiceLineDraft[]
    issues: GreenTreeExtractionIssue[]
}

const MONEY_TOLERANCE = 0.02

export function normalizeGreenTreeText(value: string | null | undefined) {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
}

export function parseGreenTreeMoney(value: string | number | null | undefined) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    const normalized = normalizeGreenTreeText(value)
    if (!normalized) return null
    const negative = /^\(.*\)$/.test(normalized)
    const stripped = normalized.replace(/[,$()\s]/g, '')
    if (!/^[+-]?\d+(?:\.\d{1,5})?$/.test(stripped)) return null
    const parsed = Number(stripped)
    return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : null
}

export function parseGreenTreeDateOnly(value: string | null | undefined) {
    const normalized = normalizeGreenTreeText(value)
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(normalized)
    if (!match) return null
    const day = Number(match[1])
    const month = Number(match[2])
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    const candidate = new Date(Date.UTC(year, month - 1, day))
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
        return null
    }
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function canonicalLineType(value: string): ChargeableInvoiceLineType {
    const normalized = normalizeGreenTreeText(value).toLowerCase()
    if (normalized === 'labour' || normalized === 'labor') return CHARGEABLE_INVOICE_LINE_TYPES.LABOUR
    if (normalized === 'parts' || normalized === 'part') return CHARGEABLE_INVOICE_LINE_TYPES.PARTS
    return CHARGEABLE_INVOICE_LINE_TYPES.OTHER
}

function stableHash(value: string) {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
}

export function buildStableInvoiceLineKeys(lines: Array<Pick<GreenTreeLineCandidate, 'type' | 'description'>>) {
    const counts = new Map<string, number>()
    return lines.map((line) => {
        const type = canonicalLineType(line.type)
        const canonical = `${type}|${normalizeGreenTreeText(line.description).toLowerCase()}`
        const base = `line-${stableHash(canonical)}`
        const occurrence = (counts.get(base) ?? 0) + 1
        counts.set(base, occurrence)
        return occurrence === 1 ? base : `${base}-${occurrence}`
    })
}

function moneyIssue(
    issues: GreenTreeExtractionIssue[],
    field: string,
    raw: string | number | null | undefined,
) {
    const value = parseGreenTreeMoney(raw)
    if (raw != null && normalizeGreenTreeText(String(raw)) && value == null) {
        issues.push({ code: 'invalid-number', severity: 'error', field, message: `${field} is not a valid number.` })
    }
    return value
}

function differs(left: number, right: number) {
    return Math.abs(left - right) > MONEY_TOLERANCE
}

export function buildGreenTreeInvoiceExtraction(candidate: GreenTreeInvoiceCandidate): GreenTreeExtractionResult {
    const issues: GreenTreeExtractionIssue[] = []
    const invoiceNumber = normalizeGreenTreeText(candidate.invoiceNumber)
    const greenTreeReference = normalizeGreenTreeText(candidate.greenTreeReference)
    const invoiceDate = parseGreenTreeDateOnly(candidate.invoiceDate)
    if (!invoiceNumber) issues.push({ code: 'missing-invoice-number', severity: 'error', field: 'invoiceNumber', message: 'Invoice Number is required.' })
    if (!greenTreeReference) issues.push({ code: 'missing-reference', severity: 'error', field: 'greenTreeReference', message: 'GreenTree Our Ref is required.' })
    if (!invoiceDate) issues.push({ code: 'invalid-invoice-date', severity: 'error', field: 'invoiceDate', message: 'Invoice Date is missing or invalid.' })

    const keys = buildStableInvoiceLineKeys(candidate.lines)
    const lines = candidate.lines.map((line, index): ChargeableInvoiceLineDraft => {
        const quantity = moneyIssue(issues, `lines[${index}].quantity`, line.quantity)
        const unitPrice = moneyIssue(issues, `lines[${index}].unitPrice`, line.unitPrice)
        const extendedPrice = moneyIssue(issues, `lines[${index}].extendedPrice`, line.extendedPrice)
        const description = normalizeGreenTreeText(line.description)
        if (!description) issues.push({ code: 'missing-line-description', severity: 'error', lineKey: keys[index], message: 'Invoice line description is required.' })
        if (quantity != null && unitPrice != null && extendedPrice != null && differs(quantity * unitPrice, extendedPrice)) {
            issues.push({ code: 'line-total-mismatch', severity: 'warning', lineKey: keys[index], message: 'Quantity multiplied by unit price does not match the extracted line total.' })
        }
        return {
            gr_linekey: keys[index],
            gr_linetype: canonicalLineType(line.type),
            gr_description: description,
            gr_quantity: quantity,
            gr_unitprice: unitPrice,
            gr_extendedprice: extendedPrice,
            gr_sortorder: index,
            gr_confidence: line.confidence ?? null,
            gr_rawtext: line.rawText ?? null,
        }
    })

    const subtotal = moneyIssue(issues, 'subtotal', candidate.subtotal)
    const gstRate = moneyIssue(issues, 'gstRate', candidate.gstRate)
    const gstAmount = moneyIssue(issues, 'gstAmount', candidate.gstAmount)
    const total = moneyIssue(issues, 'total', candidate.total)
    const hasCompleteLineTotals = lines.every((line) => line.gr_extendedprice != null)
    const lineSubtotal = lines.reduce((sum, line) => sum + (line.gr_extendedprice ?? 0), 0)
    if (subtotal != null && hasCompleteLineTotals && differs(lineSubtotal, subtotal)) {
        issues.push({ code: 'subtotal-mismatch', severity: 'warning', field: 'subtotal', message: 'Extracted invoice lines do not add up to the extracted subtotal.' })
    }
    if (subtotal != null && gstAmount != null && total != null && differs(subtotal + gstAmount, total)) {
        issues.push({ code: 'invoice-total-mismatch', severity: 'error', field: 'total', message: 'Subtotal plus GST does not match the extracted total.' })
    }
    if (subtotal != null && gstRate != null && gstAmount != null && differs(subtotal * gstRate / 100, gstAmount)) {
        issues.push({ code: 'gst-mismatch', severity: 'warning', field: 'gstAmount', message: 'Extracted GST does not match the extracted subtotal and GST rate.' })
    }

    const confidences = candidate.lines.flatMap((line) => line.confidence == null ? [] : [line.confidence])
    const averageConfidence = confidences.length
        ? confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length
        : null
    const revision: ChargeableInvoiceRevisionSnapshot = {
        gr_extractionversion: candidate.extractionVersion,
        gr_extractionconfidence: averageConfidence,
        gr_invoicenumber: invoiceNumber,
        gr_invoicedate: invoiceDate ?? '',
        gr_rawordernumber: normalizeGreenTreeText(candidate.rawOrderNumber) || null,
        gr_greentreereference: greenTreeReference,
        gr_accountsnapshot: normalizeGreenTreeText(candidate.accountSnapshot) || null,
        gr_customersnapshot: normalizeGreenTreeText(candidate.customerSnapshot) || null,
        gr_sitesnapshot: normalizeGreenTreeText(candidate.siteSnapshot) || null,
        gr_headline: normalizeGreenTreeText(candidate.headline) || null,
        gr_fleet: normalizeGreenTreeText(candidate.fleet) || null,
        gr_make: normalizeGreenTreeText(candidate.make) || null,
        gr_model: normalizeGreenTreeText(candidate.model) || null,
        gr_serial: normalizeGreenTreeText(candidate.serial) || null,
        gr_meter: moneyIssue(issues, 'meter', candidate.meter),
        gr_dateofjob: candidate.dateOfJob ? parseGreenTreeDateOnly(candidate.dateOfJob) : null,
        gr_serviceinterval: normalizeGreenTreeText(candidate.serviceInterval) || null,
        gr_nextdue: normalizeGreenTreeText(candidate.nextDue) || null,
        gr_repairdescription: normalizeGreenTreeText(candidate.repairDescription) || null,
        gr_workcompleted: normalizeGreenTreeText(candidate.workCompleted) || null,
        gr_subtotal: subtotal,
        gr_gstrate: gstRate,
        gr_gstamount: gstAmount,
        gr_total: total,
        gr_extractionjson: JSON.stringify(candidate.sourceEvidence),
    }
    if (candidate.dateOfJob && !revision.gr_dateofjob) {
        issues.push({ code: 'invalid-job-date', severity: 'error', field: 'dateOfJob', message: 'Date of Job is invalid.' })
    }
    return { revision, lines, issues }
}
