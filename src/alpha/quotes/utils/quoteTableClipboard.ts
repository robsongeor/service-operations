export type QuoteTableLine = {
    description: string
    quantity: number
    unitPrice: number
    extendedPrice: number
}

export type QuoteTableTotals = {
    subtotal: number
    gst: number
    total: number
    gstRatePercent: number
}

export type QuoteTableClipboardContent = {
    html: string
    plainText: string
}

export function isCopyableQuoteLine(line: { description: string; quantity: number; unitPrice: number }) {
    return Boolean(
        line.description.trim()
        && Number.isFinite(line.quantity)
        && line.quantity >= 0.01
        && Number.isFinite(line.unitPrice)
        && line.unitPrice >= 0,
    )
}

function escapeHtml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function plainCell(value: string) {
    return value.replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function quantity(value: number) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function money(value: number) {
    return value.toFixed(2)
}

function percentage(value: number) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

export function buildQuoteTableClipboard(
    lines: QuoteTableLine[],
    totals: QuoteTableTotals,
): QuoteTableClipboardContent {
    const gstLabel = `GST (${percentage(totals.gstRatePercent)}%)`
    const headerStyle = 'border:1px solid #555;padding:6px 8px;background:#eeeeee;color:#222;font-weight:bold;'
    const textCellStyle = 'border:1px solid #555;padding:6px 8px;text-align:left;'
    const numberCellStyle = 'border:1px solid #555;padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;'
    const totalLabelStyle = 'padding:5px 8px;text-align:right;'
    const totalValueStyle = 'padding:5px 8px;text-align:right;font-variant-numeric:tabular-nums;'
    const finalLabelStyle = `${totalLabelStyle}border-top:2px solid #333;font-weight:bold;`
    const finalValueStyle = `${totalValueStyle}border-top:2px solid #333;font-weight:bold;`
    const rows = lines.map((line) => `<tr><td style="${textCellStyle}">${escapeHtml(line.description.trim())}</td><td style="${numberCellStyle}">${quantity(line.quantity)}</td><td style="${numberCellStyle}">${money(line.unitPrice)}</td><td style="${numberCellStyle}">${money(line.extendedPrice)}</td></tr>`).join('')
    const html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:#222;"><thead><tr><th style="${headerStyle}text-align:left;">Description</th><th style="${headerStyle}text-align:right;">Qty</th><th style="${headerStyle}text-align:right;">Unit Price / $</th><th style="${headerStyle}text-align:right;">Extended Price / $</th></tr></thead><tbody>${rows}<tr><td colspan="3" style="${totalLabelStyle}padding-top:10px;">Subtotal</td><td style="${totalValueStyle}padding-top:10px;">${money(totals.subtotal)}</td></tr><tr><td colspan="3" style="${totalLabelStyle}">${gstLabel}</td><td style="${totalValueStyle}">${money(totals.gst)}</td></tr><tr><td colspan="3" style="${finalLabelStyle}">Total</td><td style="${finalValueStyle}">${money(totals.total)}</td></tr></tbody></table>`
    const plainRows = lines.map((line) => [
        plainCell(line.description),
        quantity(line.quantity),
        money(line.unitPrice),
        money(line.extendedPrice),
    ].join('\t'))
    const plainText = [
        'Description\tQty\tUnit Price / $\tExtended Price / $',
        ...plainRows,
        '\t\t\t',
        `Subtotal\t\t\t${money(totals.subtotal)}`,
        `${gstLabel}\t\t\t${money(totals.gst)}`,
        `Total\t\t\t${money(totals.total)}`,
    ].join('\n')
    return { html, plainText }
}

export async function copyQuoteTable(content: QuoteTableClipboardContent) {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
            await navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([content.html], { type: 'text/html' }),
                'text/plain': new Blob([content.plainText], { type: 'text/plain' }),
            })])
            return
        } catch {
            // Fall through to plain text for browsers or permissions without rich clipboard support.
        }
    }
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
    await navigator.clipboard.writeText(content.plainText)
}
