import {
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    type ChargeableInvoiceCorrectionType,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceLineType,
    type ChargeableInvoiceRevision,
} from '../types/chargeableInvoice.types.ts'

export type ChargeableInvoiceCorrectionDraft = {
    type: ChargeableInvoiceCorrectionType
    fieldKey: string
    requestedText: string
    sourceLineId: string
    requestedLineType: ChargeableInvoiceLineType | null
    requestedDescription: string
    requestedQuantity: string
    requestedUnitPrice: string
}

const headerFields: Record<string, keyof ChargeableInvoiceRevision> = {
    invoiceDate: 'gr_invoicedate', headline: 'gr_headline', meter: 'gr_meter',
    dateOfJob: 'gr_dateofjob', serviceInterval: 'gr_serviceinterval', nextDue: 'gr_nextdue',
    subtotal: 'gr_subtotal', gstAmount: 'gr_gstamount', total: 'gr_total',
}

const storyFields: Record<string, keyof ChargeableInvoiceRevision> = {
    repairDescription: 'gr_repairdescription', workCompleted: 'gr_workcompleted',
}

function optionalNumber(value: string, label: string) {
    if (!value.trim()) return { value: null }
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return { value: null, error: `${label} must be a non-negative number.` }
    return { value: parsed }
}

export function buildChargeableInvoiceCorrectionFields(
    draft: ChargeableInvoiceCorrectionDraft,
    revision: ChargeableInvoiceRevision,
    lines: ChargeableInvoiceLine[],
) {
    const common = {
        gr_correctiontype: draft.type,
        gr_comparisonstatus: CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING,
    }
    if (draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD) {
        const field = headerFields[draft.fieldKey]
        if (!field) return { error: 'Choose a supported invoice header field.' }
        if (!draft.requestedText.trim()) return { error: 'Enter the requested header value.' }
        return { fields: { ...common, gr_fieldkey: draft.fieldKey, gr_originalsnapshot: String(revision[field] ?? ''), gr_requestedtext: draft.requestedText.trim() } }
    }
    if (draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY) {
        const field = storyFields[draft.fieldKey]
        if (!field) return { error: 'Choose the story section to correct.' }
        if (!draft.requestedText.trim()) return { error: 'Enter the requested story text.' }
        return { fields: { ...common, gr_fieldkey: draft.fieldKey, gr_originalsnapshot: String(revision[field] ?? ''), gr_requestedtext: draft.requestedText.trim() } }
    }
    const sourceLine = lines.find((line) => line.gr_chargeableinvoicelineid === draft.sourceLineId)
    if (draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE) {
        if (!sourceLine) return { error: 'Choose the source line to remove.' }
        return { sourceLineId: sourceLine.gr_chargeableinvoicelineid, fields: { ...common, gr_originalsnapshot: JSON.stringify(sourceLine) } }
    }
    if (draft.type !== CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE && !sourceLine) {
        return { error: 'Choose the source line to change.' }
    }
    const quantity = optionalNumber(draft.requestedQuantity, 'Quantity')
    if (quantity.error) return { error: quantity.error }
    const unitPrice = optionalNumber(draft.requestedUnitPrice, 'Unit price')
    if (unitPrice.error) return { error: unitPrice.error }
    const description = draft.requestedDescription.trim()
    if (description.length > 4000) return { error: 'Requested description must be 4,000 characters or fewer.' }
    if (draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE && (!draft.requestedLineType || !description)) {
        return { error: 'Choose a line type and enter the requested description.' }
    }
    if (draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE
        && draft.requestedLineType == null && !description && quantity.value == null && unitPrice.value == null) {
        return { error: 'Enter at least one requested line change.' }
    }
    return {
        sourceLineId: sourceLine?.gr_chargeableinvoicelineid,
        fields: {
            ...common,
            gr_originalsnapshot: sourceLine ? JSON.stringify(sourceLine) : null,
            gr_requestedlinetype: draft.requestedLineType,
            gr_requesteddescription: description || null,
            gr_requestedquantity: quantity.value,
            gr_requestedunitprice: unitPrice.value,
        },
    }
}

export const chargeableInvoiceCorrectionFieldOptions = {
    headers: Object.keys(headerFields),
    stories: Object.keys(storyFields),
}
