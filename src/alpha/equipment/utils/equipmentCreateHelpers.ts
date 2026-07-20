export function normalizeCustomerName(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export { deriveSiteNameFromAddress } from '../../shared/siteName'

export type SpreadsheetRow = {
    jobNumber: string
    date: string
    mechanic: string
    model: string
    identifier: string
    customer: string
    description: string
    address: string
    contactDetails: string
    status: string
    comments: string
    orderNumber: string
    inSo: string
}

export type IdentifierClassification =
    | { kind: 'fleet'; value: string; warning?: string }
    | { kind: 'serial'; value: string; warning?: string }
    | { kind: 'unresolved'; value: string; warning: string }
    | { kind: 'missing'; value: string; warning: string }

export type SpreadsheetParseResult =
    | { ok: true; row: SpreadsheetRow; warnings: string[] }
    | { ok: false; error: string }

const SPREADSHEET_HEADERS = ['job number', 'date', 'mechanic', 'model', 'fleet number', 'customer']

export function isSpreadsheetHeader(values: string[]) {
    return SPREADSHEET_HEADERS.every((header, index) => normalizeCustomerName(values[index] ?? '') === header)
}

export function parseSpreadsheetRow(text: string): SpreadsheetParseResult {
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
    const nonEmptyLines = lines.filter((line) => line.trim())
    if (nonEmptyLines.length === 0) return { ok: false, error: 'Paste one complete spreadsheet row first.' }
    if (nonEmptyLines.length > 1) return { ok: false, error: 'Paste one spreadsheet row at a time.' }

    const values = nonEmptyLines[0].split('\t').map((value) => value.trim())
    if (isSpreadsheetHeader(values)) return { ok: false, error: 'This appears to be the spreadsheet header. Copy a data row instead.' }
    if (values.length < 6) return { ok: false, error: 'This row has fewer columns than expected. Copy the complete spreadsheet row.' }

    const valueAt = (index: number) => values[index] ?? ''
    const row: SpreadsheetRow = {
        jobNumber: valueAt(0), date: valueAt(1), mechanic: valueAt(2), model: valueAt(3), identifier: valueAt(4),
        customer: valueAt(5), description: valueAt(6), address: valueAt(7), contactDetails: valueAt(8), status: valueAt(9),
        comments: valueAt(10), orderNumber: valueAt(11), inSo: valueAt(12),
    }
    const warnings: string[] = []
    if (values.length > 13) warnings.push('Additional spreadsheet columns were ignored.')
    if (!row.model) warnings.push('Model was not found in this row.')
    if (!row.customer) warnings.push('Customer was not found in this row.')
    if (!row.address) warnings.push('Address was not found in this row.')
    return { ok: true, row, warnings }
}

export function classifyEquipmentIdentifier(value: string): IdentifierClassification {
    const trimmed = value.trim()
    if (!trimmed) return { kind: 'missing', value: '', warning: 'No equipment identifier was found. Enter a Fleet Number or Serial Number before saving.' }
    if (/[\\/;,]|\s+(?:and|&|or)\s+/i.test(trimmed)) return { kind: 'unresolved', value: trimmed, warning: 'Multiple identifiers were detected. Choose or enter one identifier manually.' }
    if (/^(fn|vfl|#)/i.test(trimmed)) return { kind: 'fleet', value: trimmed, warning: 'Identifier suggested as Fleet Number.' }
    if (/^\d{8,}$/.test(trimmed)) return { kind: 'serial', value: trimmed, warning: 'Identifier suggested as Serial Number.' }
    return { kind: 'fleet', value: trimmed, warning: 'Identifier was suggested as Fleet Number. Please review it.' }
}
