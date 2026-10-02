import type { Equipment } from '../jobs/types/equipment.types.ts'

export const CUSTOMER_SITE_EQUIPMENT_CSV_COLUMNS = [
    'Fleet Number',
    'Serial Number',
    'Make',
    'Model',
    'Operational Status',
    'Customer',
    'Site',
    'Address',
    'Last Known Hours',
    'Reading Recorded Date',
] as const

function csvCell(value: unknown) {
    const raw = value == null ? '' : String(value)
    const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvRow(values: readonly unknown[]) {
    return values.map(csvCell).join(',')
}

function equipmentSortLabel(item: Equipment) {
    return item.gr_fleet?.trim() || item.gr_serial?.trim() || item.gr_equipmentid
}

export function customerSiteEquipmentCsvText(equipment: readonly Equipment[]) {
    const rows = [...equipment]
        .sort((left, right) => equipmentSortLabel(left).localeCompare(
            equipmentSortLabel(right),
            undefined,
            { numeric: true, sensitivity: 'base' },
        ))
        .map((item) => {
            const site = item.gr_Site
            return csvRow([
                item.gr_fleet,
                item.gr_serial,
                item.gr_make,
                item.gr_model,
                item.statecode === 0 ? 'Active' : item.statecode === 1 ? 'Inactive' : '',
                site?.gr_Customer?.gr_name,
                site?.gr_name,
                site?.gr_address,
                item.gr_currenthourmeter,
                item.gr_currenthourmeterrecordeddate?.slice(0, 10),
            ])
        })

    return `\uFEFF${csvRow(CUSTOMER_SITE_EQUIPMENT_CSV_COLUMNS)}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`
}

function safeFilenamePart(value: string, fallback: string) {
    const withoutControlCharacters = [...value]
        .filter((character) => character.charCodeAt(0) >= 32)
        .join('')
    return withoutControlCharacters
        .trim()
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '') || fallback
}

export function customerSiteEquipmentCsvFilename(customerName: string, siteName: string, date: string) {
    const customer = safeFilenamePart(customerName, 'Customer')
    const site = safeFilenamePart(siteName, 'Site')
    return `${customer} - ${site} - Equipment - ${date}.csv`
}
