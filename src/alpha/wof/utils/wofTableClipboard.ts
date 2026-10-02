export type WofTableClipboardRow = {
    status: 'Due Soon' | 'Expired'
    expiry: string
    equipment: string
    rego: string
    customer: string
    site: string
    jobNumber: string
}

export type WofTableClipboardContent = {
    html: string
    plainText: string
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

export function buildWofTableClipboard(rows: WofTableClipboardRow[]): WofTableClipboardContent {
    const headers = ['Status', 'WOF Expiry', 'Equipment', 'REGO', 'Customer', 'Site', 'Job Number']
    const headerStyle = 'border:1px solid #777;padding:6px 8px;background:#eeeeee;color:#222;font-weight:bold;text-align:left;'
    const cellStyle = 'border:1px solid #777;padding:6px 8px;text-align:left;vertical-align:top;'
    const htmlRows = rows.map((row) => {
        const cells = [row.status, row.expiry, row.equipment, row.rego, row.customer, row.site, row.jobNumber]
        return `<tr>${cells.map((value) => `<td style="${cellStyle}">${escapeHtml(value)}</td>`).join('')}</tr>`
    }).join('')
    const html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;color:#222;"><thead><tr>${headers.map((header) => `<th style="${headerStyle}">${header}</th>`).join('')}</tr></thead><tbody>${htmlRows}</tbody></table>`
    const plainText = [
        headers.join('\t'),
        ...rows.map((row) => [row.status, row.expiry, row.equipment, row.rego, row.customer, row.site, row.jobNumber]
            .map(plainCell)
            .join('\t')),
    ].join('\n')
    return { html, plainText }
}

export async function copyWofTable(content: WofTableClipboardContent) {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
            await navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([content.html], { type: 'text/html' }),
                'text/plain': new Blob([content.plainText], { type: 'text/plain' }),
            })])
            return
        } catch {
            // Fall through when the browser permits plain text but not rich clipboard content.
        }
    }
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
    await navigator.clipboard.writeText(content.plainText)
}
