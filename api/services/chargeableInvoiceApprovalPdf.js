const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

const TEMPLATE_VERSION = 'liftrucks-approval-v1'
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BLACK = rgb(0.08, 0.08, 0.08)
const MUTED = rgb(0.36, 0.38, 0.41)
const RED = rgb(0.84, 0.08, 0.08)
const AMBER = rgb(1, 0.76, 0.16)
const LIGHT_GREY = rgb(0.95, 0.95, 0.95)

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

function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return 'Not recorded'
    return new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date).replace(',', '') + ' NZ time'
}

function formatMoney(value) {
    return Number.isFinite(value) ? `$${Number(value).toFixed(2)}` : '-'
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

function approvalSnapshot(input) {
    const revision = input.revision
    return {
        templateVersion: TEMPLATE_VERSION,
        reviewId: input.review.gr_chargeableinvoicereviewid,
        revisionId: revision.gr_chargeableinvoicerevisionid,
        revisionNumber: revision.gr_revisionnumber,
        invoiceNumber: safeText(revision.gr_invoicenumber),
        invoiceDate: revision.gr_invoicedate || null,
        jobNumber: safeText(input.review.gr_Job?.gr_jobnumber || revision.gr_greentreereference),
        customer: safeText(input.review.gr_Customer?.gr_name || revision.gr_customersnapshot),
        site: safeText(input.review.gr_Site?.gr_name || revision.gr_sitesnapshot),
        fleet: safeText(input.review.gr_Equipment?.gr_fleet || revision.gr_fleet),
        make: safeText(input.review.gr_Equipment?.gr_make || revision.gr_make),
        model: safeText(input.review.gr_Equipment?.gr_model || revision.gr_model),
        serial: safeText(input.review.gr_Equipment?.gr_serial || revision.gr_serial),
        meter: revision.gr_meter ?? null,
        dateOfJob: revision.gr_dateofjob || null,
        headline: safeText(revision.gr_headline),
        repairDescription: safeText(revision.gr_repairdescription),
        workCompleted: safeText(revision.gr_workcompleted),
        lines: [...input.lines]
            .sort((left, right) => left.gr_sortorder - right.gr_sortorder)
            .map((line) => ({
                key: safeText(line.gr_linekey), type: line.gr_linetype,
                description: safeText(line.gr_description), quantity: line.gr_quantity ?? null,
                unitPrice: line.gr_unitprice ?? null, extendedPrice: line.gr_extendedprice ?? null,
            })),
        subtotal: revision.gr_subtotal ?? null,
        gstRate: revision.gr_gstrate ?? null,
        gstAmount: revision.gr_gstamount ?? null,
        total: revision.gr_total ?? null,
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

    let page
    let y
    let pageNumber = 0
    const addPage = () => {
        page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        pageNumber += 1
        y = PAGE_HEIGHT - MARGIN
        page.drawText('LIF', { x: MARGIN, y: y - 18, size: 25, font: bold, color: BLACK })
        const lifWidth = bold.widthOfTextAtSize('LIF', 25)
        page.drawText('T', { x: MARGIN + lifWidth - 1, y: y - 18, size: 25, font: bold, color: RED })
        const liftWidth = bold.widthOfTextAtSize('LIFT', 25)
        page.drawText('RUCKS', { x: MARGIN + liftWidth - 2, y: y - 18, size: 25, font: bold, color: BLACK })
        page.drawText(`Page ${pageNumber}`, { x: PAGE_WIDTH - MARGIN - 38, y: y - 14, size: 8, font: regular, color: MUTED })
        y -= 42
        page.drawRectangle({ x: MARGIN, y: y - 27, width: CONTENT_WIDTH, height: 30, color: AMBER })
        const marker = 'FOR CUSTOMER PO APPROVAL - NOT A TAX INVOICE'
        page.drawText(marker, {
            x: MARGIN + (CONTENT_WIDTH - bold.widthOfTextAtSize(marker, 12)) / 2,
            y: y - 17, size: 12, font: bold, color: BLACK,
        })
        y -= 43
    }
    const ensure = (height) => { if (y - height < 75) addPage() }
    const drawLine = (label, value, x, labelWidth, valueWidth) => {
        page.drawText(label, { x, y, size: 9, font: bold, color: BLACK })
        const shown = safeText(value, 'Not recorded')
        const clipped = wrapText(shown, regular, 9, valueWidth)[0]
        page.drawText(clipped, { x: x + labelWidth, y, size: 9, font: regular, color: BLACK })
    }
    const section = (title, text) => {
        const lines = wrapText(text, regular, 9, CONTENT_WIDTH)
        ensure(23 + lines.length * 12)
        page.drawText(title, { x: MARGIN, y, size: 10, font: bold, color: BLACK })
        y -= 14
        for (const line of lines) {
            page.drawText(line, { x: MARGIN, y, size: 9, font: regular, color: BLACK })
            y -= 12
        }
        y -= 7
    }

    addPage()
    const leftX = MARGIN
    const rightX = MARGIN + 275
    drawLine('Job Date:', formatDateOnly(snapshot.dateOfJob || snapshot.invoiceDate), leftX, 92, 160)
    drawLine('Customer:', snapshot.customer, rightX, 62, 155)
    y -= 14
    drawLine('Estimate Number:', snapshot.jobNumber, leftX, 92, 160)
    drawLine('Site:', snapshot.site, rightX, 62, 155)
    y -= 14
    drawLine('Job Reference No:', snapshot.jobNumber, leftX, 92, 160)
    drawLine('Fleet No:', snapshot.fleet, rightX, 62, 155)
    y -= 14
    drawLine('Document Ref:', snapshot.invoiceNumber, leftX, 92, 160)
    drawLine('Hours:', snapshot.meter == null ? '' : formatNumber(snapshot.meter), rightX, 62, 155)
    y -= 22

    section('Fault Reported', snapshot.headline)
    section('Work Required / Completed', snapshot.workCompleted || snapshot.repairDescription)

    ensure(52)
    const columns = [MARGIN, MARGIN + 255, MARGIN + 320, MARGIN + 405, MARGIN + CONTENT_WIDTH]
    const row = (values, height, options = {}) => {
        ensure(height)
        if (options.fill) page.drawRectangle({ x: MARGIN, y: y - height + 3, width: CONTENT_WIDTH, height, color: options.fill })
        page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: MARGIN + CONTENT_WIDTH, y: y + 3 }, thickness: options.thick ? 1.4 : 0.65, color: BLACK })
        for (const x of columns) page.drawLine({ start: { x, y: y + 3 }, end: { x, y: y - height + 3 }, thickness: 0.65, color: BLACK })
        values.forEach((value, index) => {
            const font = options.bold ? bold : regular
            const text = safeText(value, '-')
            const width = columns[index + 1] - columns[index] - 8
            const textWidth = font.widthOfTextAtSize(text, 8.5)
            const x = options.numeric?.includes(index) ? columns[index + 1] - textWidth - 4 : columns[index] + 4
            page.drawText(text, { x: Math.max(columns[index] + 4, x), y: y - height + 9, size: 8.5, font, color: options.red ? RED : BLACK })
        })
        y -= height
    }
    row(['Description', 'Qty', 'Unit Price', 'Extended Price'], 24, { bold: true, fill: LIGHT_GREY, thick: true })
    for (const line of snapshot.lines) {
        const descriptions = wrapText(line.description, regular, 8.5, columns[1] - columns[0] - 8)
        const height = Math.max(20, descriptions.length * 10 + 8)
        row([descriptions[0], formatNumber(line.quantity), formatMoney(line.unitPrice), formatMoney(line.extendedPrice)], height, { numeric: [1, 2, 3] })
        for (let index = 1; index < descriptions.length; index += 1) {
            page.drawText(descriptions[index], { x: MARGIN + 4, y: y + height - 11 - index * 10, size: 8.5, font: regular, color: BLACK })
        }
    }
    page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: MARGIN + CONTENT_WIDTH, y: y + 3 }, thickness: 0.65, color: BLACK })
    y -= 14
    ensure(62)
    const totalsX = MARGIN + 320
    const totalRow = (label, value, red = false) => {
        page.drawText(label, { x: totalsX, y, size: 9, font: red ? bold : regular, color: red ? RED : BLACK })
        const shown = formatMoney(value)
        page.drawText(shown, { x: MARGIN + CONTENT_WIDTH - (red ? bold : regular).widthOfTextAtSize(shown, 9), y, size: 9, font: red ? bold : regular, color: red ? RED : BLACK })
        y -= 15
    }
    totalRow('Sub Total', snapshot.subtotal)
    totalRow(`GST ${Number.isFinite(snapshot.gstRate) ? `${formatNumber(snapshot.gstRate)}%` : ''}`.trim(), snapshot.gstAmount)
    page.drawLine({ start: { x: totalsX, y: y + 6 }, end: { x: MARGIN + CONTENT_WIDTH, y: y + 6 }, thickness: 1.1, color: BLACK })
    totalRow('Total', snapshot.total, true)

    ensure(76)
    y -= 12
    page.drawText(`Template: ${TEMPLATE_VERSION}`, { x: MARGIN, y, size: 7.5, font: regular, color: MUTED })
    y -= 11
    page.drawText(`Generated: ${formatDateTime(generatedAt)} | Revision ${snapshot.revisionNumber}`, { x: MARGIN, y, size: 7.5, font: regular, color: MUTED })
    y -= 20
    page.drawText('Liftrucks NZ Ltd - Camson Hoist Hire Ltd', { x: MARGIN, y, size: 8.5, font: bold, color: BLACK })
    y -= 12
    page.drawText('114 Captain Springs Road, Onehunga, Auckland | Phone 09 634 2140 | www.liftrucks.co.nz', { x: MARGIN, y, size: 8, font: regular, color: BLACK })

    return Buffer.from(await pdf.save({ useObjectStreams: false }))
}

module.exports = {
    TEMPLATE_VERSION,
    approvalSnapshot,
    renderApprovalPdf,
    safeText,
}
