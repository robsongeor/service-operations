const CORRECTION_TYPES = {
    HEADER_FIELD: 122830000,
    STORY: 122830001,
    CHANGE_LINE: 122830002,
    ADD_LINE: 122830003,
    REMOVE_LINE: 122830004,
}

const COMPARISONS = {
    OUTSTANDING: 122830000,
    MATCHED_IN_REVISION: 122830001,
    NOT_MADE: 122830002,
}

const HEADER_FIELDS = {
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

function canonical(value) {
    return value == null ? '' : String(value).replace(/\s+/g, ' ').trim().toLowerCase()
}

function close(left, right) {
    return left != null && right != null && Math.abs(left - right) <= 0.02
}

function matchesRequestedLine(correction, line) {
    return (correction.gr_requestedlinetype == null || correction.gr_requestedlinetype === line.gr_linetype)
        && (!correction.gr_requesteddescription || canonical(correction.gr_requesteddescription) === canonical(line.gr_description))
        && (correction.gr_requestedquantity == null || close(correction.gr_requestedquantity, line.gr_quantity))
        && (correction.gr_requestedunitprice == null || close(correction.gr_requestedunitprice, line.gr_unitprice))
}

function sourceLineKey(correction) {
    if (!correction.gr_originalsnapshot) return null
    try {
        const source = JSON.parse(correction.gr_originalsnapshot)
        return typeof source?.gr_linekey === 'string' && source.gr_linekey ? source.gr_linekey : null
    } catch {
        return null
    }
}

function result(correction, matched, reason, matchedLineKey) {
    return {
        correctionId: correction.gr_chargeableinvoicecorrectionid,
        etag: correction['@odata.etag'],
        comparison: matched ? COMPARISONS.MATCHED_IN_REVISION : COMPARISONS.NOT_MADE,
        matchedLineKey,
        reason,
    }
}

function compareUnresolvedCorrections(corrections, candidateRevision, candidateLines) {
    return corrections
        .filter((correction) => correction.gr_comparisonstatus === COMPARISONS.OUTSTANDING
            || correction.gr_comparisonstatus === COMPARISONS.NOT_MADE)
        .map((correction) => {
            if (correction.gr_correctiontype === CORRECTION_TYPES.HEADER_FIELD) {
                const field = correction.gr_fieldkey ? HEADER_FIELDS[correction.gr_fieldkey] : undefined
                if (!field || !correction.gr_requestedtext) return result(correction, false, 'The header correction is incomplete or unsupported.')
                const matched = canonical(candidateRevision[field]) === canonical(correction.gr_requestedtext)
                return result(correction, matched, matched ? 'The requested header value is present.' : 'The requested header value is not present.')
            }
            if (correction.gr_correctiontype === CORRECTION_TYPES.STORY) {
                const requested = canonical(correction.gr_requestedtext)
                const isWorkAmendment = correction.gr_fieldkey === 'workCompleted'
                const candidateValues = isWorkAmendment
                    ? [candidateRevision.gr_workcompleted]
                    : [candidateRevision.gr_repairdescription, candidateRevision.gr_workcompleted]
                const matched = !!requested && candidateValues.some((value) => {
                    const candidate = canonical(value)
                    return isWorkAmendment ? candidate.includes(requested) : candidate === requested
                })
                const label = isWorkAmendment ? 'work-completed amendment' : 'requested story text'
                return result(correction, matched, matched ? `The ${label} is present.` : `The ${label} is not present.`)
            }
            if (correction.gr_correctiontype === CORRECTION_TYPES.ADD_LINE) {
                const matches = candidateLines.filter((line) => matchesRequestedLine(correction, line))
                return result(correction, matches.length === 1, matches.length === 1 ? 'One requested new line is present.' : 'The requested new line is missing or ambiguous.', matches.length === 1 ? matches[0].gr_linekey : undefined)
            }
            const lineKey = sourceLineKey(correction)
            if (!lineKey) return result(correction, false, 'The source line snapshot for this correction is unavailable.')
            const candidate = candidateLines.find((line) => line.gr_linekey === lineKey)
            if (correction.gr_correctiontype === CORRECTION_TYPES.REMOVE_LINE) {
                return result(correction, !candidate, candidate ? 'The source line is still present.' : 'The source line was removed.')
            }
            if (correction.gr_correctiontype === CORRECTION_TYPES.CHANGE_LINE) {
                const matched = !!candidate && matchesRequestedLine(correction, candidate)
                return result(correction, matched, matched ? 'The requested line values are present.' : 'The requested line values are not present.', matched ? candidate.gr_linekey : undefined)
            }
            return result(correction, false, 'The correction type is unsupported.')
        })
}

module.exports = { COMPARISONS, compareUnresolvedCorrections }
