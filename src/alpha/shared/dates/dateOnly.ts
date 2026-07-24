export const NEW_ZEALAND_TIME_ZONE = 'Pacific/Auckland'

export function dateOnlyInTimeZone(value: string | Date, timeZone: string) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const parts = new Intl.DateTimeFormat('en-NZ', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
    const year = part('year')
    const month = part('month')
    const day = part('day')
    return year && month && day ? `${year}-${month}-${day}` : ''
}

export function newZealandDateOnly(value: string | Date) {
    return dateOnlyInTimeZone(value, NEW_ZEALAND_TIME_ZONE)
}
