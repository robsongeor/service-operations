import {
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    CHARGEABLE_INVOICE_LINE_TYPES,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceLine,
    type ChargeableInvoiceWorkspace,
} from '../types/chargeableInvoice.types.ts'

const FIELD_LABELS: Record<string, string> = {
    invoiceNumber: 'Invoice number', invoiceDate: 'Invoice date', rawOrderNumber: 'Order No evidence',
    greenTreeReference: 'GreenTree reference', account: 'Account', customer: 'Customer', site: 'Site',
    headline: 'Headline', fleet: 'Fleet', make: 'Make', model: 'Model', serial: 'Serial', meter: 'Meter',
    dateOfJob: 'Date of Job', serviceInterval: 'Service interval', nextDue: 'Next due',
    subtotal: 'Subtotal', gstRate: 'GST rate', gstAmount: 'GST amount', total: 'Total',
    repairDescription: 'Description of repair work', workCompleted: 'Work completed',
}

function text(value: unknown) {
    return value == null || String(value).trim() === '' ? 'Not recorded' : String(value).trim()
}

function lineType(value?: number | null) {
    return value === CHARGEABLE_INVOICE_LINE_TYPES.LABOUR ? 'Labour'
        : value === CHARGEABLE_INVOICE_LINE_TYPES.PARTS ? 'Parts'
            : value === CHARGEABLE_INVOICE_LINE_TYPES.OTHER ? 'Other' : 'Not specified'
}

function money(value?: number | null) {
    return value == null ? 'Not specified' : `$${value.toFixed(2)}`
}

function sourceLine(correction: ChargeableInvoiceCorrection): Partial<ChargeableInvoiceLine> | null {
    if (!correction.gr_originalsnapshot) return null
    try {
        const parsed = JSON.parse(correction.gr_originalsnapshot) as Partial<ChargeableInvoiceLine>
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

function lineSummary(line: Partial<ChargeableInvoiceLine> | null) {
    if (!line) return 'Source line unavailable'
    return [
        lineType(line.gr_linetype), text(line.gr_description),
        line.gr_quantity == null ? '' : `Qty ${line.gr_quantity}`,
        line.gr_unitprice == null ? '' : `Unit ${money(line.gr_unitprice)}`,
    ].filter(Boolean).join(' | ')
}

function requestedLine(correction: ChargeableInvoiceCorrection) {
    return [
        correction.gr_requestedlinetype == null ? '' : `Type: ${lineType(correction.gr_requestedlinetype)}`,
        correction.gr_requesteddescription ? `Description: ${correction.gr_requesteddescription.trim()}` : '',
        correction.gr_requestedquantity == null ? '' : `Quantity: ${correction.gr_requestedquantity}`,
        correction.gr_requestedunitprice == null ? '' : `Unit price: ${money(correction.gr_requestedunitprice)}`,
    ].filter(Boolean)
}

function correctionLines(correction: ChargeableInvoiceCorrection, index: number) {
    const status = correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE
        ? 'Not made in latest revision' : 'Outstanding'
    const label = FIELD_LABELS[correction.gr_fieldkey || ''] || correction.gr_fieldkey || 'Unspecified field'
    if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD
        || correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY) {
        return [
            `${index}. ${correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY ? 'STORY' : 'HEADER'} — ${label}`,
            `Status: ${status}`,
            `Current: ${text(correction.gr_originalsnapshot)}`,
            `Requested: ${text(correction.gr_requestedtext)}`,
        ]
    }
    if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE) {
        return [`${index}. REMOVE LINE`, `Status: ${status}`, `Remove: ${lineSummary(sourceLine(correction))}`]
    }
    if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE) {
        return [`${index}. ADD LINE`, `Status: ${status}`, ...requestedLine(correction).map((item) => `Requested ${item}`)]
    }
    if (correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE) {
        return [
            `${index}. CHANGE LINE`, `Status: ${status}`, `Current: ${lineSummary(sourceLine(correction))}`,
            ...requestedLine(correction).map((item) => `Requested ${item}`),
        ]
    }
    return [`${index}. UNSUPPORTED CORRECTION`, `Status: ${status}`, 'Review this correction manually.']
}

export function unresolvedChargeableInvoiceCorrections(corrections: ChargeableInvoiceCorrection[]) {
    return corrections
        .filter((correction) => correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING
            || correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE)
        .sort((left, right) => (left.createdon || left.gr_chargeableinvoicecorrectionid)
            .localeCompare(right.createdon || right.gr_chargeableinvoicecorrectionid))
}

export function buildChargeableInvoiceCorrectionInstructions(workspace: ChargeableInvoiceWorkspace) {
    const corrections = unresolvedChargeableInvoiceCorrections(workspace.corrections)
    if (!corrections.length) throw new Error('There are no unresolved correction instructions to prepare.')
    const revision = workspace.revisions.find((item) =>
        item.gr_chargeableinvoicerevisionid === workspace.review._gr_currentrevision_value) ?? workspace.revisions[0]
    const sections = corrections.map((correction, index) => correctionLines(correction, index + 1).join('\n'))
    const invoice = workspace.review.gr_invoicenumber.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'
    return {
        count: corrections.length,
        fileName: `${invoice}-correction-instructions.txt`,
        text: [
            'CHARGEABLE INVOICE CORRECTION INSTRUCTIONS',
            '==========================================',
            `Invoice: ${workspace.review.gr_invoicenumber}`,
            `Job: ${workspace.review.gr_Job?.gr_jobnumber || workspace.review.gr_greentreereference}`,
            `Customer: ${workspace.review.gr_Customer?.gr_name || 'Not recorded'}`,
            `Site: ${workspace.review.gr_Site?.gr_name || 'Not recorded'}`,
            `Current revision: ${revision?.gr_revisionnumber ?? 'Not recorded'}`,
            '',
            ...sections.flatMap((section, index) => index === sections.length - 1 ? [section] : [section, '']),
            '',
            'Prepared for manual handoff. This file has not been sent automatically.',
        ].join('\n'),
    }
}
