const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const TEMPLATE_VERSION = 'liftrucks-manager-template-v5'
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const BLACK = rgb(0.08, 0.08, 0.08)
const TEMPLATE_BACKGROUND = readFileSync(join(__dirname, '..', 'assets', 'chargeable-invoice-approval-template.png'))
const LIFTRUCKS_LOGO = readFileSync(join(__dirname, '..', 'assets', 'liftrucks-invoice-logo.jpg'))
const LOGO_WIDTH = 170
const LOGO_LEFT = 38
const LOGO_TOP = 20

function safeText(value, fallback = '') {
    const text = value == null ? '' : String(value)
    return text
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/[^\x20-\x7e\xa0-\xff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || fallback
}

function formatDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(safeText(value))
    return match ? `${match[3]}/${match[2]}/${match[1]}` : safeText(value, 'Not recorded')
}

function formatMoney(value) {
    return Number.isFinite(value)
        ? `$${Number(value).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '-'
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return '-'
    return Number(value).toLocaleString('en-NZ', { maximumFractionDigits: 4 })
}

function wrapText(text, font, size, width) {
    const words = safeText(text, 'Not recorded').split(' ')
    const lines = []
    let line = ''
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (!line || font.widthOfTextAtSize(candidate, size) <= width) line = candidate
        else {
            lines.push(line)
            line = word
        }
    }
    if (line) lines.push(line)
    return lines
}

const CORRECTION_TYPES = {
    STORY: 122830001,
    CHANGE_LINE: 122830002,
    ADD_LINE: 122830003,
    REMOVE_LINE: 122830004,
}
const ACTIVE_CORRECTION_STATUSES = new Set([122830000, 122830002])

function lineTotal(quantity, unitPrice, fallback) {
    if (Number.isFinite(quantity) && Number.isFinite(unitPrice)) {
        return Math.round((Number(quantity) * Number(unitPrice) + Number.EPSILON) * 100) / 100
    }
    return Number.isFinite(fallback) ? Number(fallback) : null
}

function effectiveApprovalContent(input) {
    const sourceLines = [...input.lines].sort((left, right) => left.gr_sortorder - right.gr_sortorder)
    const active = (input.corrections || []).filter((correction) =>
        ACTIVE_CORRECTION_STATUSES.has(correction.gr_comparisonstatus))
    const latestBySource = new Map()
    const latestByLineKey = new Map()
    const additions = []
    const storyAmendments = []
    for (const correction of active) {
        if (correction.gr_correctiontype === CORRECTION_TYPES.STORY && correction.gr_requestedtext) {
            storyAmendments.push(correction)
        } else if (correction.gr_correctiontype === CORRECTION_TYPES.ADD_LINE) {
            additions.push(correction)
        } else if (correction._gr_sourceline_value) {
            latestBySource.set(correction._gr_sourceline_value.toLowerCase(), correction)
            try {
                const source = JSON.parse(correction.gr_originalsnapshot || 'null')
                if (typeof source?.gr_linekey === 'string' && source.gr_linekey) {
                    latestByLineKey.set(source.gr_linekey, correction)
                }
            } catch { /* malformed historic snapshots do not override current lines */ }
        }
    }
    const lines = []
    for (const source of sourceLines) {
        const correction = latestBySource.get(String(source.gr_chargeableinvoicelineid || '').toLowerCase())
            || latestByLineKey.get(source.gr_linekey)
        if (correction?.gr_correctiontype === CORRECTION_TYPES.REMOVE_LINE) continue
        const quantity = correction?.gr_correctiontype === CORRECTION_TYPES.CHANGE_LINE
            ? correction.gr_requestedquantity ?? source.gr_quantity : source.gr_quantity
        const unitPrice = correction?.gr_correctiontype === CORRECTION_TYPES.CHANGE_LINE
            ? correction.gr_requestedunitprice ?? source.gr_unitprice : source.gr_unitprice
        lines.push({
            key: safeText(source.gr_linekey),
            type: correction?.gr_requestedlinetype ?? source.gr_linetype,
            description: safeText(correction?.gr_requesteddescription || source.gr_description),
            quantity: quantity ?? null,
            unitPrice: unitPrice ?? null,
            extendedPrice: lineTotal(quantity, unitPrice, source.gr_extendedprice),
        })
    }
    for (const correction of additions) {
        lines.push({
            key: `addition-${correction.gr_chargeableinvoicecorrectionid}`,
            type: correction.gr_requestedlinetype,
            description: safeText(correction.gr_requesteddescription),
            quantity: correction.gr_requestedquantity ?? null,
            unitPrice: correction.gr_requestedunitprice ?? null,
            extendedPrice: lineTotal(correction.gr_requestedquantity, correction.gr_requestedunitprice, null),
        })
    }
    const workCompleted = [safeText(input.revision.gr_workcompleted),
        ...storyAmendments.map((correction) => safeText(correction.gr_requestedtext))].filter(Boolean).join('\n\n')
    const sourceLineTotal = (line) => lineTotal(line?.gr_quantity, line?.gr_unitprice, line?.gr_extendedprice)
    const summedSourceSubtotal = sourceLines.every((line) => Number.isFinite(sourceLineTotal(line)))
        ? Math.round((sourceLines.reduce((sum, line) => sum + sourceLineTotal(line), 0) + Number.EPSILON) * 100) / 100
        : null
    const sourceSubtotal = Number.isFinite(input.revision.gr_subtotal)
        ? Number(input.revision.gr_subtotal) : summedSourceSubtotal
    const pricingCorrections = active.filter((correction) => [
        CORRECTION_TYPES.CHANGE_LINE, CORRECTION_TYPES.ADD_LINE, CORRECTION_TYPES.REMOVE_LINE,
    ].includes(correction.gr_correctiontype))
    let adjustment = 0
    let pricingComplete = sourceSubtotal != null
    for (const correction of pricingCorrections) {
        if (correction.gr_correctiontype === CORRECTION_TYPES.ADD_LINE) {
            const added = lineTotal(correction.gr_requestedquantity, correction.gr_requestedunitprice, null)
            if (added == null) pricingComplete = false
            else adjustment += added
            continue
        }
        let snapshot = null
        try { snapshot = JSON.parse(correction.gr_originalsnapshot || 'null') } catch { /* handled below */ }
        const source = sourceLines.find((line) =>
            String(line.gr_chargeableinvoicelineid || '').toLowerCase() === String(correction._gr_sourceline_value || '').toLowerCase()
            || (snapshot?.gr_linekey && line.gr_linekey === snapshot.gr_linekey))
        const original = sourceLineTotal(source)
        if (!source || original == null) { pricingComplete = false; continue }
        if (correction.gr_correctiontype === CORRECTION_TYPES.REMOVE_LINE) {
            adjustment -= original
            continue
        }
        const replacement = lineTotal(correction.gr_requestedquantity ?? source.gr_quantity,
            correction.gr_requestedunitprice ?? source.gr_unitprice, null)
        if (replacement == null) pricingComplete = false
        else adjustment += replacement - original
    }
    const subtotal = pricingCorrections.length
        ? (pricingComplete ? Math.round((sourceSubtotal + adjustment + Number.EPSILON) * 100) / 100 : null)
        : sourceSubtotal
    const gstRate = Number.isFinite(input.revision.gr_gstrate) ? Number(input.revision.gr_gstrate) : null
    const gstAmount = !pricingCorrections.length && Number.isFinite(input.revision.gr_gstamount)
        ? Number(input.revision.gr_gstamount)
        : subtotal != null && gstRate != null
            ? Math.round((subtotal * gstRate / 100 + Number.EPSILON) * 100) / 100 : null
    const total = !pricingCorrections.length && Number.isFinite(input.revision.gr_total)
        ? Number(input.revision.gr_total)
        : subtotal != null && gstAmount != null
            ? Math.round((subtotal + gstAmount + Number.EPSILON) * 100) / 100 : null
    return { workCompleted, lines, subtotal, gstRate, gstAmount, total, amendmentCount: active.length }
}

function approvalSnapshot(input) {
    const revision = input.revision
    const effective = effectiveApprovalContent(input)
    return {
        templateVersion: TEMPLATE_VERSION,
        reviewId: input.review.gr_chargeableinvoicereviewid,
        revisionId: revision.gr_chargeableinvoicerevisionid,
        revisionNumber: revision.gr_revisionnumber,
        invoiceNumber: safeText(revision.gr_invoicenumber),
        invoiceDate: revision.gr_invoicedate || null,
        orderNumber: safeText(revision.gr_rawordernumber),
        jobNumber: safeText(input.review.gr_Job?.gr_jobnumber || revision.gr_greentreereference),
        customer: safeText(input.review.gr_Customer?.gr_name || revision.gr_customersnapshot),
        site: safeText(input.review.gr_Site?.gr_name || revision.gr_sitesnapshot),
        fleet: safeText(input.review.gr_Equipment?.gr_fleet || revision.gr_fleet),
        make: safeText(input.review.gr_Equipment?.gr_make || revision.gr_make),
        model: safeText(input.review.gr_Equipment?.gr_model || revision.gr_model),
        serial: safeText(input.review.gr_Equipment?.gr_serial || revision.gr_serial),
        meter: revision.gr_meter ?? null,
        dateOfJob: revision.gr_dateofjob || null,
        serviceInterval: safeText(revision.gr_serviceinterval),
        nextDue: revision.gr_nextdue || null,
        headline: safeText(revision.gr_headline),
        repairDescription: safeText(revision.gr_repairdescription),
        workCompleted: effective.workCompleted,
        lines: effective.lines,
        subtotal: effective.subtotal,
        gstRate: effective.gstRate,
        gstAmount: effective.gstAmount,
        total: effective.total,
        amendmentCount: effective.amendmentCount,
    }
}

async function renderApprovalPdf(snapshot, generatedAt = new Date()) {
    const pdf = await PDFDocument.create()
    pdf.setTitle(`Customer PO approval - ${safeText(snapshot.jobNumber)}`)
    pdf.setSubject('Customer purchase-order approval document - not a tax invoice')
    pdf.setAuthor('Liftrucks NZ Ltd')
    pdf.setCreator(`Service Operations ${TEMPLATE_VERSION}`)
    pdf.setProducer(`Service Operations ${TEMPLATE_VERSION}`)
    pdf.setCreationDate(generatedAt)
    pdf.setModificationDate(generatedAt)
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const background = await pdf.embedPng(TEMPLATE_BACKGROUND)
    const logo = await pdf.embedJpg(LIFTRUCKS_LOGO)
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page.drawImage(background, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT })
    const logoHeight = LOGO_WIDTH * (logo.height / logo.width)
    page.drawImage(logo, {
        x: LOGO_LEFT, y: PAGE_HEIGHT - LOGO_TOP - logoHeight, width: LOGO_WIDTH, height: logoHeight,
    })

    const drawTop = (value, x, top, options = {}) => {
        const font = options.font || regular
        const size = options.size || 7.5
        const shown = safeText(value)
        if (!shown) return
        page.drawText(shown, { x, y: PAGE_HEIGHT - top - size, size, font, color: options.color || BLACK })
    }
    const drawRightTop = (value, right, top, options = {}) => {
        const font = options.font || regular
        const size = options.size || 7.5
        const shown = safeText(value)
        if (!shown) return
        drawTop(shown, right - font.widthOfTextAtSize(shown, size), top, { ...options, font, size })
    }
    const drawFitted = (value, x, top, width, options = {}) => {
        const font = options.font || regular
        let size = options.size || 7.5
        const shown = safeText(value)
        if (!shown) return
        while (size > (options.minimumSize || 5.5) && font.widthOfTextAtSize(shown, size) > width) size -= 0.25
        drawTop(shown, x, top, { ...options, font, size })
    }
    const drawWrappedRegion = (value, x, top, width, height, options = {}) => {
        const font = options.font || regular
        let size = options.size || 7
        let lineHeight
        let lines
        do {
            lineHeight = size + (options.leading || 1.2)
            lines = wrapText(value, font, size, width)
            if (lines.length * lineHeight <= height || size <= (options.minimumSize || 5.25)) break
            size -= 0.25
        } while (true)
        for (const [index, line] of lines.slice(0, Math.floor(height / lineHeight)).entries()) {
            drawTop(line, x, top + index * lineHeight, { font, size })
        }
    }

    drawTop('FOR CUSTOMER PO APPROVAL - NOT A TAX INVOICE', LOGO_LEFT, LOGO_TOP + logoHeight + 6, { font: bold, size: 8 })
    drawFitted(snapshot.invoiceNumber, 465, 39, 76, { size: 8 })
    drawFitted(formatDateOnly(snapshot.invoiceDate), 465, 62, 76, { size: 8 })
    drawFitted(snapshot.jobNumber, 465, 107, 76, { size: 8 })
    drawFitted(snapshot.orderNumber, 465, 129, 76, { size: 8 })

    drawFitted(snapshot.customer, 49, 159, 205, { font: bold, size: 9 })
    drawFitted(snapshot.site, 338, 159, 205, { font: bold, size: 9 })

    drawFitted(snapshot.headline, 24, 271, 520, { size: 8, minimumSize: 5.5 })
    const headlineWidth = Math.min(regular.widthOfTextAtSize(safeText(snapshot.headline), 8), 520)
    if (headlineWidth) {
        page.drawLine({
            start: { x: 24, y: PAGE_HEIGHT - 281 }, end: { x: 24 + headlineWidth, y: PAGE_HEIGHT - 281 },
            thickness: 0.45, color: BLACK,
        })
    }
    drawFitted(snapshot.fleet, 82.5, 286, 155, { size: 7.5 })
    drawFitted(snapshot.make, 82.5, 297.5, 155, { size: 7.5 })
    drawFitted(snapshot.model, 82.5, 309, 155, { size: 7.5 })
    drawFitted(snapshot.serial, 82.5, 320.5, 155, { size: 7.5 })
    drawFitted(snapshot.meter == null ? '' : formatNumber(snapshot.meter), 409, 286, 126, { size: 7.5 })
    drawFitted(formatDateOnly(snapshot.dateOfJob), 409, 297.5, 126, { size: 7.5 })
    drawFitted(snapshot.serviceInterval, 409, 309, 126, { size: 7.5 })
    drawFitted(snapshot.nextDue ? formatDateOnly(snapshot.nextDue) : '', 409, 320.5, 126, { size: 7.5 })

    drawWrappedRegion(snapshot.repairDescription || snapshot.headline, 24, 353, 520, 28, { size: 7.5 })
    drawFitted(`Machine Location: ${snapshot.site}`, 24, 393, 520, { size: 7.5 })
    drawFitted(`Fleet No: ${snapshot.fleet}`, 24, 407, 520, { size: 7.5 })
    drawWrappedRegion(snapshot.workCompleted || snapshot.repairDescription, 24, 430, 520, 69, { size: 7 })

    const rows = snapshot.lines || []
    if (rows.length > 15) throw new Error('The invoice template supports at most 15 amended lines.')
    const rowHeight = Math.max(6.4, Math.min(10.5, 98 / Math.max(rows.length, 1)))
    const lineSize = Math.max(5.2, Math.min(7.5, rowHeight - 2.1))
    for (const [index, line] of rows.slice(0, 15).entries()) {
        const top = 510 + index * rowHeight
        const type = line.type === 122830000 ? 'Labour' : line.type === 122830001 ? 'Parts' : 'Other'
        drawFitted(type, 25, top, 54, { size: lineSize, minimumSize: 4.75 })
        drawFitted(line.description, 86, top, 245, { size: lineSize, minimumSize: 4.75 })
        drawRightTop(formatNumber(line.quantity), 381, top, { size: lineSize })
        drawRightTop(formatMoney(line.unitPrice), 459, top, { size: lineSize })
        drawRightTop(formatMoney(line.extendedPrice), 548, top, { size: lineSize })
    }

    drawTop('Subtotal', 405, 615, { size: 8 })
    drawTop(`GST (${Number.isFinite(snapshot.gstRate) ? `${formatNumber(snapshot.gstRate)}%` : ''})`, 405, 628, { size: 8 })
    drawTop('Total', 405, 645, { font: bold, size: 8.5 })
    drawRightTop(formatMoney(snapshot.subtotal), 548, 615, { size: 8 })
    drawRightTop(formatMoney(snapshot.gstAmount), 548, 628, { size: 8 })
    drawRightTop(formatMoney(snapshot.total), 548, 645, { font: bold, size: 8.5 })

    return Buffer.from(await pdf.save({ useObjectStreams: false }))
}

module.exports = {
    TEMPLATE_VERSION,
    approvalSnapshot,
    renderApprovalPdf,
    effectiveApprovalContent,
    safeText,
}
