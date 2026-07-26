import type { SignedInUserInfo } from '../../../auth/signedInUser'
import type { Equipment } from '../../jobs/types/equipment.types'
import { EQUIPMENT_COMPLIANCE_STATUSES } from '../compliance/equipmentCompliance'
import { MAINTENANCE_PROFILES, POWER_TYPES, SERVICE_PROGRAMMES } from '../servicePlans/maintenanceConfiguration'
import { normalizeEquipmentInput, type EquipmentUpdateInput } from '../types/equipmentManager.types'

export const BULK_EQUIPMENT_IMPORT_EMAIL = 'georger@liftrucks.co.nz'

export type BulkEquipmentRow = {
    rowNumber: number
    fleetNumber: string
    serialNumber: string
    make: string
    model: string
    registrationNumber: string
    currentWofExpiry: string
    errors: string[]
    existingDuplicates: {
        fleetNumber: boolean
        serialNumber: boolean
    }
}

export type BulkEquipmentReviewDecision = {
    ignoreFleetNumber: boolean
    ignoreSerialNumber: boolean
    selectedForImport: boolean
}

export type BulkEquipmentReviewedRow = {
    row: BulkEquipmentRow
    decision: BulkEquipmentReviewDecision
    effectiveFleetNumber: string
    effectiveSerialNumber: string
    errors: string[]
    valid: boolean
}

const normalized = (value?: string | null) => value?.trim().toLowerCase() ?? ''

export function canUseBulkEquipmentImport(user: SignedInUserInfo | null) {
    return normalized(user?.username) === BULK_EQUIPMENT_IMPORT_EMAIL
}

function isHeader(values: string[]) {
    const headers = values.map(normalized)
    return headers[0]?.includes('fleet')
        && headers[1]?.includes('serial')
        && (headers[4]?.includes('registration') || headers[4]?.includes('rego'))
        && headers[5]?.includes('wof')
}

export function parseBulkEquipmentDate(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    const local = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    const parts = iso
        ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
        : local
            ? { year: Number(local[3]), month: Number(local[2]), day: Number(local[1]) }
            : null
    if (!parts) return null
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() !== parts.month - 1 || date.getUTCDate() !== parts.day) return null
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function duplicateMessage(label: string, value: string) {
    return `Possible duplicate: ${label} ${value} already exists.`
}

export function createBulkEquipmentReviewDecision(): BulkEquipmentReviewDecision {
    return {
        ignoreFleetNumber: false,
        ignoreSerialNumber: false,
        selectedForImport: false,
    }
}

export function reviewBulkEquipmentRow(
    row: BulkEquipmentRow,
    decision: BulkEquipmentReviewDecision,
): BulkEquipmentReviewedRow {
    const effectiveFleetNumber = decision.ignoreFleetNumber ? '' : row.fleetNumber
    const effectiveSerialNumber = decision.ignoreSerialNumber ? '' : row.serialNumber
    const errors = [...row.errors]

    if (row.existingDuplicates.fleetNumber && !decision.ignoreFleetNumber) {
        errors.push(duplicateMessage('Fleet Number', row.fleetNumber))
    }
    if (row.existingDuplicates.serialNumber && !decision.ignoreSerialNumber) {
        errors.push(duplicateMessage('Serial Number', row.serialNumber))
    }
    if (!effectiveFleetNumber && !effectiveSerialNumber) {
        errors.push('This row cannot be imported because both Fleet Number and Serial Number would be blank.')
    }

    return {
        row,
        decision,
        effectiveFleetNumber,
        effectiveSerialNumber,
        errors,
        valid: errors.length === 0,
    }
}

export function parseBulkEquipmentRows(source: string, existingEquipment: Equipment[]): BulkEquipmentRow[] {
    const sourceLines = source.replace(/\r\n?/g, '\n').split('\n')
    const nonBlankLines = sourceLines
        .map((line, index) => ({ line, rowNumber: index + 1 }))
        .filter(({ line }) => line.trim())
    const dataLines = nonBlankLines.length && isHeader(nonBlankLines[0].line.split('\t'))
        ? nonBlankLines.slice(1)
        : nonBlankLines

    const rows = dataLines.map(({ line, rowNumber }) => {
        const values = line.split('\t').map((value) => value.trim())
        const expiry = parseBulkEquipmentDate(values[5] ?? '')
        const errors: string[] = []
        if (values.length > 6) errors.push(`Expected 6 columns but found ${values.length}.`)
        if (!values[0] && !values[1]) errors.push('Fleet Number or Serial Number is required.')
        if (expiry === null) errors.push('Invalid WOF expiry date.')
        return {
            rowNumber,
            fleetNumber: values[0] ?? '',
            serialNumber: values[1] ?? '',
            make: values[2] ?? '',
            model: values[3] ?? '',
            registrationNumber: values[4] ?? '',
            currentWofExpiry: expiry ?? '',
            errors,
            existingDuplicates: {
                fleetNumber: false,
                serialNumber: false,
            },
        }
    })

    const batchFields = [
        ['Fleet Number', (row: BulkEquipmentRow) => row.fleetNumber, (item: Equipment) => item.gr_fleet],
        ['Serial Number', (row: BulkEquipmentRow) => row.serialNumber, (item: Equipment) => item.gr_serial],
        ['Registration Number', (row: BulkEquipmentRow) => row.registrationNumber, (item: Equipment) => item.gr_registrationnumber],
    ] as const

    for (const [label, rowValue] of batchFields) {
        const batchValues = new Map<string, BulkEquipmentRow[]>()
        rows.forEach((row) => {
            const value = normalized(rowValue(row))
            if (value) batchValues.set(value, [...(batchValues.get(value) ?? []), row])
        })
        batchValues.forEach((matches) => {
            if (matches.length > 1) matches.forEach((row) => row.errors.push(`Duplicate ${label} within pasted rows.`))
        })
    }

    const existingFleetNumbers = new Set(existingEquipment.map((item) => item.gr_fleet).map(normalized).filter(Boolean))
    const existingSerialNumbers = new Set(existingEquipment.map((item) => item.gr_serial).map(normalized).filter(Boolean))
    const existingRegistrationNumbers = new Set(existingEquipment.map((item) => item.gr_registrationnumber).map(normalized).filter(Boolean))

    rows.forEach((row) => {
        row.existingDuplicates.fleetNumber = Boolean(normalized(row.fleetNumber) && existingFleetNumbers.has(normalized(row.fleetNumber)))
        row.existingDuplicates.serialNumber = Boolean(normalized(row.serialNumber) && existingSerialNumbers.has(normalized(row.serialNumber)))
        const registrationNumber = normalized(row.registrationNumber)
        if (registrationNumber && existingRegistrationNumbers.has(registrationNumber)) {
            row.errors.push(duplicateMessage('Registration Number', row.registrationNumber))
        }
    })

    return rows
}

export function bulkEquipmentRowInput(
    row: BulkEquipmentRow,
    siteId: string,
    decision: BulkEquipmentReviewDecision,
): EquipmentUpdateInput {
    const reviewed = reviewBulkEquipmentRow(row, decision)
    if (!reviewed.valid) {
        throw new Error(reviewed.errors.join(' '))
    }

    return normalizeEquipmentInput({
        fleet: reviewed.effectiveFleetNumber,
        serial: reviewed.effectiveSerialNumber,
        make: row.make,
        model: row.model,
        registrationNumber: row.registrationNumber,
        currentWofExpiry: row.currentWofExpiry,
        regoExpiry: '',
        complianceStatus: row.registrationNumber.trim()
            ? EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED
            : EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD,
        wofRequired: Boolean(row.registrationNumber.trim()),
        siteId: siteId.trim(),
        powerType: POWER_TYPES.OTHER_UNKNOWN,
        serviceProgramme: SERVICE_PROGRAMMES.ICE_STANDARD,
        maintenanceProfile: MAINTENANCE_PROFILES.STANDARD,
        ownershipType: null,
        siteCheckAvailability: null,
        customAEnabled: true,
        customBEnabled: false,
        customCEnabled: true,
        customAIntervalDays: '',
        customBIntervalDays: '',
        customCIntervalDays: '',
    })
}
