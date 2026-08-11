import {
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceCorrectionComparison,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceLineDraft,
    type ChargeableInvoiceRevisionSnapshot,
} from '../types/chargeableInvoice.types.ts'
import { normalizeGreenTreeText } from './greenTreeInvoiceExtraction.ts'

export type ChargeableInvoiceCorrectionResult = {
    correctionId: string
    comparison: ChargeableInvoiceCorrectionComparison
    matchedLineKey?: string
    reason: string
}

const HEADER_FIELDS: Record<string, keyof ChargeableInvoiceRevisionSnapshot> = {
    invoiceNumber: 'gr_invoicenumber',
    invoiceDate: 'gr_invoicedate',
    rawOrderNumber: 'gr_rawordernumber',
    greenTreeReference: 'gr_greentreereference',
    account: 'gr_accountsnapshot',
    customer: 'gr_customersnapshot',
    site: 'gr_sitesnapshot',
    headline: 'gr_headline',
    fleet: 'gr_fleet',
    make: 'gr_make',
    model: 'gr_model',
    serial: 'gr_serial',
    meter: 'gr_meter',
    dateOfJob: 'gr_dateofjob',
    serviceInterval: 'gr_serviceinterval',
    nextDue: 'gr_nextdue',
    subtotal: 'gr_subtotal',
    gstRate: 'gr_gstrate',
    gstAmount: 'gr_gstamount',
    total: 'gr_total',
}

function canonical(value: unknown) {
    return normalizeGreenTreeText(value == null ? '' : String(value)).toLowerCase()
}

function close(left: number | null | undefined, right: number | null | undefined) {
    return left != null && right != null && Math.abs(left - right) <= 0.02
}

function matchesRequestedLine(correction: ChargeableInvoiceCorrection, line: ChargeableInvoiceLineDraft) {
    return (correction.gr_requestedlinetype == null || correction.gr_requestedlinetype === line.gr_linetype)
        && (!correction.gr_requesteddescription || canonical(correction.gr_requesteddescription) === canonical(line.gr_description))
        && (correction.gr_requestedquantity == null || close(correction.gr_requestedquantity, line.gr_quantity))
        && (correction.gr_requestedunitprice == null || close(correction.gr_requestedunitprice, line.gr_unitprice))
}

function result(correctionId: string, matched: boolean, reason: string, matchedLineKey?: string): ChargeableInvoiceCorrectionResult {
    return {
        correctionId,
        comparison: matched
            ? CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION
            : CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE,
        matchedLineKey,
        reason,
    }
}

export function compareOutstandingCorrections(
    corrections: ChargeableInvoiceCorrection[],
    sourceLines: ChargeableInvoiceLine[],
    candidateRevision: ChargeableInvoiceRevisionSnapshot,
    candidateLines: ChargeableInvoiceLineDraft[],
) {
    const sourceById = new Map(sourceLines.map((line) => [line.gr_chargeableinvoicelineid, line]))
    return corrections
        .filter((correction) => correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING)
        .map((correction): ChargeableInvoiceCorrectionResult => {
            const id = correction.gr_chargeableinvoicecorrectionid
            if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD) {
                const field = correction.gr_fieldkey ? HEADER_FIELDS[correction.gr_fieldkey] : undefined
                if (!field || !correction.gr_requestedtext) return result(id, false, 'The header correction is incomplete or unsupported.')
                const matched = canonical(candidateRevision[field]) === canonical(correction.gr_requestedtext)
                return result(id, matched, matched ? 'The requested header value is present.' : 'The requested header value is not present.')
            }
            if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY) {
                const requested = canonical(correction.gr_requestedtext)
                const matched = !!requested && [candidateRevision.gr_repairdescription, candidateRevision.gr_workcompleted]
                    .some((value) => canonical(value) === requested)
                return result(id, matched, matched ? 'The requested story text is present.' : 'The requested story text is not present.')
            }
            if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE) {
                const matches = candidateLines.filter((line) => matchesRequestedLine(correction, line))
                return result(id, matches.length === 1, matches.length === 1 ? 'One requested new line is present.' : 'The requested new line is missing or ambiguous.', matches.length === 1 ? matches[0].gr_linekey : undefined)
            }
            const source = correction._gr_sourceline_value ? sourceById.get(correction._gr_sourceline_value) : undefined
            if (!source) return result(id, false, 'The source line for this correction is unavailable.')
            const candidate = candidateLines.find((line) => line.gr_linekey === source.gr_linekey)
            if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE) {
                return result(id, !candidate, candidate ? 'The source line is still present.' : 'The source line was removed.')
            }
            if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE) {
                const matched = !!candidate && matchesRequestedLine(correction, candidate)
                return result(id, matched, matched ? 'The requested line values are present.' : 'The requested line values are not present.', matched ? candidate?.gr_linekey : undefined)
            }
            return result(id, false, 'The correction type is unsupported.')
        })
}
