import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

export type LiftrucksInvoiceLine = {
    type: 'Labour' | 'Parts' | 'Other'
    description: string
    quantity: number
    unitPrice: number
    extendedPrice: number
}

export type LiftrucksInvoiceSnapshot = {
    documentNumber: string
    documentDate: string
    jobNumber: string
    orderNumber?: string
    customer: string
    siteName: string
    siteAddress: string
    headline: string
    fleet?: string
    make?: string
    model?: string
    serial?: string
    dateOfJob?: string
    repairDescription: string
    workRequired: string
    lines: LiftrucksInvoiceLine[]
    subtotal: number
    gstRatePercent: number
    gstAmount: number
    total: number
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const BLACK = rgb(0.08, 0.08, 0.08)
const LINE_START_OFFSET = 510
const LINE_REGION_HEIGHT = 150
const GREEN_TREE_BODY_SIZE = 9.96
const GREEN_TREE_FIELD_SIZE = 10.92
export const MAX_LIFTTRUCKS_INVOICE_LINES = 20

const safeText = (value?: string | number | null) => String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const dateOnly = (value?: string | null) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(safeText(value))
    return match ? `${match[3]}/${match[2]}/${match[1]}` : safeText(value)
}

const money = (value: number) => `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const number = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(5)))

function wrapText(value: string, font: PDFFont, size: number, width: number) {
    const words = safeText(value).split(' ').filter(Boolean)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (!current || font.widthOfTextAtSize(next, size) <= width) current = next
        else { lines.push(current); current = word }
    }
    if (current) lines.push(current)
    return lines
}

export function calculateInvoiceLineLayout(lineCount: number) {
    const safeCount = Math.max(1, lineCount)
    const rowHeight = Math.min(11.55, LINE_REGION_HEIGHT / safeCount)
    return {
        rowHeight,
        fontSize: Math.max(7.5, Math.min(GREEN_TREE_BODY_SIZE, rowHeight - 1.5)),
        totalsOffset: LINE_START_OFFSET + lineCount * rowHeight + 12,
    }
}

export async function renderLiftrucksInvoicePdf(
    snapshot: LiftrucksInvoiceSnapshot,
    assets: { template: ArrayBuffer; logo: ArrayBuffer },
) {
    if (snapshot.lines.length > MAX_LIFTTRUCKS_INVOICE_LINES) {
        throw new Error(`The invoice template supports at most ${MAX_LIFTTRUCKS_INVOICE_LINES} quote lines.`)
    }
    const pdf = await PDFDocument.create()
    pdf.setTitle(`Provisional quotation - ${safeText(snapshot.jobNumber || snapshot.documentNumber)}`)
    pdf.setSubject('Provisional quotation for customer purchase-order approval - not a tax invoice')
    pdf.setAuthor('Liftrucks NZ Ltd')
    pdf.setCreator('Service Operations quote-po-request-v1')
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const background = await pdf.embedPng(assets.template)
    const logo = await pdf.embedJpg(assets.logo)
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page.drawImage(background, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT })
    const logoWidth = 170
    const logoHeight = logoWidth * logo.height / logo.width
    page.drawImage(logo, { x: 38, y: PAGE_HEIGHT - 20 - logoHeight, width: logoWidth, height: logoHeight })

    const top = (value: unknown, x: number, offset: number, options: { font?: typeof regular, size?: number } = {}) => {
        const shown = safeText(value as string)
        if (!shown) return
        const font = options.font ?? regular
        const size = options.size ?? GREEN_TREE_BODY_SIZE
        page.drawText(shown, { x, y: PAGE_HEIGHT - offset - size, size, font, color: BLACK })
    }
    const right = (value: string, boundary: number, offset: number, options: { font?: typeof regular, size?: number } = {}) => {
        const font = options.font ?? regular
        const size = options.size ?? GREEN_TREE_BODY_SIZE
        top(value, boundary - font.widthOfTextAtSize(value, size), offset, { font, size })
    }
    const fitted = (value: unknown, x: number, offset: number, width: number, options: { font?: typeof regular, size?: number, minimum?: number } = {}) => {
        const shown = safeText(value as string)
        const font = options.font ?? regular
        let size = options.size ?? GREEN_TREE_BODY_SIZE
        while (size > (options.minimum ?? 8) && font.widthOfTextAtSize(shown, size) > width) size -= .25
        top(shown, x, offset, { font, size })
        return size
    }
    const wrapped = (value: string, x: number, offset: number, width: number, height: number, initialSize = GREEN_TREE_BODY_SIZE) => {
        let size = initialSize
        let lineHeight = size + 1.2
        let lines = wrapText(value, regular, size, width)
        while (lines.length * lineHeight > height && size > 8) {
            size -= .25
            lineHeight = size + 1.2
            lines = wrapText(value, regular, size, width)
        }
        lines.slice(0, Math.floor(height / lineHeight)).forEach((line, index) => top(line, x, offset + index * lineHeight, { size }))
    }

    top('PROVISIONAL QUOTATION', 38, 20 + logoHeight + 6, { font: bold, size: 8 })
    fitted(snapshot.documentNumber, 465, 37, 76, { size: GREEN_TREE_FIELD_SIZE, minimum: 9 })
    fitted(dateOnly(snapshot.documentDate), 465, 60, 76, { size: GREEN_TREE_FIELD_SIZE, minimum: 9 })
    fitted(snapshot.jobNumber, 465, 105, 76, { size: GREEN_TREE_FIELD_SIZE, minimum: 9 })
    fitted(snapshot.orderNumber, 465, 127, 76, { size: GREEN_TREE_FIELD_SIZE, minimum: 9 })
    fitted(snapshot.customer, 49, 157, 494, { font: bold, size: 12, minimum: 9.5 })
    fitted(snapshot.siteName, 49, 174, 494, { font: bold, size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    fitted(snapshot.siteAddress, 49, 190, 494, { size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    const headlineSize = fitted(snapshot.headline, 24, 269, 520, { size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    const headlineWidth = Math.min(regular.widthOfTextAtSize(safeText(snapshot.headline), headlineSize), 520)
    if (headlineWidth) page.drawLine({ start: { x: 24, y: PAGE_HEIGHT - 281 }, end: { x: 24 + headlineWidth, y: PAGE_HEIGHT - 281 }, thickness: .45, color: BLACK })
    fitted(snapshot.fleet, 82.5, 284, 155, { size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    fitted(snapshot.make, 82.5, 295.5, 155, { size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    fitted(snapshot.model, 82.5, 307, 155, { size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    fitted(snapshot.serial, 82.5, 318.5, 155, { size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    fitted(dateOnly(snapshot.dateOfJob), 409, 295.5, 126, { size: GREEN_TREE_FIELD_SIZE, minimum: 8.5 })
    wrapped(snapshot.repairDescription || snapshot.headline, 24, 351, 520, 28)
    fitted(`Machine Location: ${snapshot.siteAddress || snapshot.siteName}`, 24, 391, 520, { size: GREEN_TREE_BODY_SIZE, minimum: 8 })
    fitted(`Fleet No: ${snapshot.fleet ?? ''}`, 24, 405, 520, { size: GREEN_TREE_BODY_SIZE, minimum: 8 })
    page.drawRectangle({ x: 20, y: PAGE_HEIGHT - 442, width: 155, height: 40, color: rgb(1, 1, 1) })
    top('Work Required :', 24, 420, { font: bold, size: GREEN_TREE_FIELD_SIZE })
    wrapped(snapshot.workRequired, 24, 435, 520, 69)

    const { rowHeight, fontSize: lineSize, totalsOffset } = calculateInvoiceLineLayout(snapshot.lines.length)
    snapshot.lines.forEach((line, index) => {
        const offset = LINE_START_OFFSET + index * rowHeight
        fitted(line.type, 25, offset, 54, { size: lineSize, minimum: 7.5 })
        fitted(line.description, 86, offset, 245, { size: lineSize, minimum: 7.5 })
        right(number(line.quantity), 381, offset, { size: lineSize })
        right(money(line.unitPrice), 459, offset, { size: lineSize })
        right(money(line.extendedPrice), 548, offset, { size: lineSize })
    })
    top('Subtotal', 405, totalsOffset, { size: GREEN_TREE_FIELD_SIZE })
    top(`GST (${number(snapshot.gstRatePercent)}%)`, 405, totalsOffset + 15, { size: GREEN_TREE_FIELD_SIZE })
    top('Total', 405, totalsOffset + 34, { font: bold, size: GREEN_TREE_FIELD_SIZE })
    right(money(snapshot.subtotal), 548, totalsOffset, { size: GREEN_TREE_FIELD_SIZE })
    right(money(snapshot.gstAmount), 548, totalsOffset + 15, { size: GREEN_TREE_FIELD_SIZE })
    right(money(snapshot.total), 548, totalsOffset + 34, { font: bold, size: GREEN_TREE_FIELD_SIZE })

    return new Blob([new Uint8Array(await pdf.save({ useObjectStreams: false }))], { type: 'application/pdf' })
}
