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

export function currentNewZealandDateOnly(now: Date = new Date()) {
    return newZealandDateOnly(now)
}

export function addCalendarYearsDateOnly(value: string, years: number) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match || !Number.isInteger(years)) return ''
    const sourceYear = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const source = new Date(Date.UTC(sourceYear, month - 1, day))
    if (source.getUTCFullYear() !== sourceYear || source.getUTCMonth() !== month - 1 || source.getUTCDate() !== day) return ''
    const targetYear = sourceYear + years
    const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
    return `${String(targetYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export function defaultWofExpiryDate(now: Date = new Date()) {
    return addCalendarYearsDateOnly(currentNewZealandDateOnly(now), 1)
}
