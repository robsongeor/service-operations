export const HOUR_METER_READING_TYPES = {
    ACTUAL: 122830000,
    ESTIMATED: 122830001,
} as const

export type HourMeterReadingType = typeof HOUR_METER_READING_TYPES[keyof typeof HOUR_METER_READING_TYPES]

export const HOUR_METER_CLASSIFICATION_ENABLED = import.meta.env?.VITE_HOUR_METER_CLASSIFICATION_ENABLED === 'true'

export function getHourMeterReadingTypeLabel(type?: HourMeterReadingType | null) {
    return type === HOUR_METER_READING_TYPES.ESTIMATED ? 'Estimated' : 'Actual'
}
