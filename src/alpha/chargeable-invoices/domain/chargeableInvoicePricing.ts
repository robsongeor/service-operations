import {
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceRevision,
} from '../types/chargeableInvoice.types.ts'

export type ChargeableInvoiceAmendedTotals = {
    adjustedSubtotal: number | null
    adjustedGst: number | null
    adjustedTotal: number | null
    totalChange: number | null
    complete: boolean
    hasPricingChanges: boolean
}

function currency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function lineTotal(line: ChargeableInvoiceLine) {
    if (line.gr_extendedprice != null) return line.gr_extendedprice
    return line.gr_quantity != null && line.gr_unitprice != null
        ? currency(line.gr_quantity * line.gr_unitprice) : null
}

function active(correction: ChargeableInvoiceCorrection) {
    return correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING
        || correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE
}

export function buildChargeableInvoiceAmendedTotals(
    revision: ChargeableInvoiceRevision,
    lines: ChargeableInvoiceLine[],
    corrections: ChargeableInvoiceCorrection[],
): ChargeableInvoiceAmendedTotals {
    const activePricing = corrections.filter((correction) => active(correction)
        && (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE
            || correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE
            || correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE))
    if (!activePricing.length) {
        return {
            adjustedSubtotal: revision.gr_subtotal ?? null,
            adjustedGst: revision.gr_gstamount ?? null,
            adjustedTotal: revision.gr_total ?? null,
            totalChange: revision.gr_total == null ? null : 0,
            complete: revision.gr_subtotal != null && revision.gr_gstamount != null && revision.gr_total != null,
            hasPricingChanges: false,
        }
    }

    const linesById = new Map(lines.map((line) => [line.gr_chargeableinvoicelineid, line]))
    const latestBySource = new Map<string, ChargeableInvoiceCorrection>()
    const additions: ChargeableInvoiceCorrection[] = []
    for (const correction of activePricing) {
        if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE) additions.push(correction)
        else if (correction._gr_sourceline_value) latestBySource.set(correction._gr_sourceline_value, correction)
    }

    let complete = revision.gr_subtotal != null
    let adjustment = 0
    for (const [sourceId, correction] of latestBySource) {
        const source = linesById.get(sourceId)
        const original = source ? lineTotal(source) : null
        if (!source || original == null) { complete = false; continue }
        if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE) {
            adjustment -= original
            continue
        }
        const quantity = correction.gr_requestedquantity ?? source.gr_quantity
        const rate = correction.gr_requestedunitprice ?? source.gr_unitprice
        if (quantity == null || rate == null) { complete = false; continue }
        adjustment += currency(quantity * rate) - original
    }
    for (const correction of additions) {
        if (correction.gr_requestedquantity == null || correction.gr_requestedunitprice == null) {
            complete = false
            continue
        }
        adjustment += currency(correction.gr_requestedquantity * correction.gr_requestedunitprice)
    }

    if (!complete || revision.gr_subtotal == null) {
        return { adjustedSubtotal: null, adjustedGst: null, adjustedTotal: null, totalChange: null, complete: false, hasPricingChanges: true }
    }
    const adjustedSubtotal = currency(revision.gr_subtotal + adjustment)
    const gstRate = revision.gr_gstrate ?? (revision.gr_subtotal && revision.gr_gstamount != null
        ? revision.gr_gstamount / revision.gr_subtotal * 100 : null)
    if (gstRate == null) {
        return { adjustedSubtotal, adjustedGst: null, adjustedTotal: null, totalChange: null, complete: false, hasPricingChanges: true }
    }
    const adjustedGst = currency(adjustedSubtotal * gstRate / 100)
    const adjustedTotal = currency(adjustedSubtotal + adjustedGst)
    return {
        adjustedSubtotal,
        adjustedGst,
        adjustedTotal,
        totalChange: revision.gr_total == null ? null : currency(adjustedTotal - revision.gr_total),
        complete: true,
        hasPricingChanges: true,
    }
}
