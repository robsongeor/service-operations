import type { Equipment } from '../../jobs/types/equipment.types'

export type EquipmentUpdateInput = {
    fleet: string
    make: string
    model: string
    serial: string
    siteId: string
    registrationNumber: string
    wofRequired: boolean
    currentWofExpiry: string
    regoExpiry: string
}

export type EquipmentCreateInitialValues = Partial<EquipmentUpdateInput> & {
    customerId?: string
    customerName?: string
    siteName?: string
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDateOnly(value: string) {
    if (!DATE_ONLY_PATTERN.test(value)) return false
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
}

export function toEquipmentDateOnlyValue(value?: string | null) {
    if (!value) return ''
    const dateOnly = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/)?.[1] ?? ''
    return isValidDateOnly(dateOnly) ? dateOnly : ''
}

export function normalizeEquipmentInput(input: EquipmentUpdateInput): EquipmentUpdateInput {
    const registrationNumber = input.registrationNumber.trim()
    const rawCurrentWofExpiry = input.currentWofExpiry.trim()
    const currentWofExpiry = toEquipmentDateOnlyValue(rawCurrentWofExpiry)
    if (rawCurrentWofExpiry && !currentWofExpiry) {
        throw new Error('Current WOF Expiry must be a valid date.')
    }
    const rawRegoExpiry = input.regoExpiry.trim()
    const regoExpiry = toEquipmentDateOnlyValue(rawRegoExpiry)
    if (rawRegoExpiry && !regoExpiry) {
        throw new Error('REGO Expiry must be a valid date.')
    }

    return {
        ...input,
        fleet: input.fleet.trim(),
        make: input.make.trim(),
        model: input.model.trim(),
        serial: input.serial.trim(),
        siteId: input.siteId.trim(),
        registrationNumber,
        wofRequired: registrationNumber ? true : input.wofRequired,
        currentWofExpiry,
        regoExpiry,
    }
}

export type EquipmentSortKey = 'fleet' | 'customer' | 'site' | 'make' | 'model' | 'serial'
export type SortDirection = 'asc' | 'desc'

export type EquipmentRecord = Equipment
