import type { Equipment } from '../../jobs/types/equipment.types'
import {
    EQUIPMENT_COMPLIANCE_STATUSES,
    isEquipmentComplianceStatus,
    type EquipmentComplianceStatus,
} from '../compliance/equipmentCompliance.ts'
import type { MaintenanceProfile, PowerType, ServiceProgramme } from '../servicePlans/maintenanceConfiguration.ts'
import { MAINTENANCE_PROFILES, SERVICE_PROGRAMMES } from '../servicePlans/maintenanceConfiguration.ts'
import {
    isEquipmentOwnershipType,
    type EquipmentOwnershipType,
} from './equipmentOwnership.types.ts'
import {
    isEquipmentSiteCheckAvailability,
    type EquipmentSiteCheckAvailability,
} from './equipmentSiteCheckAvailability.types.ts'

export type EquipmentUpdateInput = {
    fleet: string
    make: string
    model: string
    serial: string
    siteId: string
    registrationNumber: string
    complianceStatus: EquipmentComplianceStatus
    wofRequired: boolean
    currentWofExpiry: string
    regoExpiry: string
    powerType: PowerType
    serviceProgramme: ServiceProgramme
    maintenanceProfile: MaintenanceProfile
    ownershipType: EquipmentOwnershipType | null
    siteCheckAvailability: EquipmentSiteCheckAvailability | null
    customAEnabled: boolean
    customBEnabled: boolean
    customCEnabled: boolean
    customAIntervalDays: string
    customBIntervalDays: string
    customCIntervalDays: string
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
    if (!isEquipmentComplianceStatus(input.complianceStatus)) {
        throw new Error('Select a valid Compliance Status.')
    }
    if (input.ownershipType != null && !isEquipmentOwnershipType(input.ownershipType)) {
        throw new Error('Select a valid Equipment Ownership.')
    }
    if (input.siteCheckAvailability != null
        && !isEquipmentSiteCheckAvailability(input.siteCheckAvailability)) {
        throw new Error('Select a valid Site Check Availability.')
    }
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
    const enabled = input.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM
        ? [input.customAEnabled, input.customBEnabled, input.customCEnabled]
        : input.serviceProgramme === SERVICE_PROGRAMMES.ICE_STANDARD ? [true, true, true] : [true, false, true]
    if (!enabled.some(Boolean)) throw new Error('At least one service level must remain enabled.')
    if (input.maintenanceProfile === MAINTENANCE_PROFILES.CUSTOM) {
        const intervals = [input.customAIntervalDays, input.customBIntervalDays, input.customCIntervalDays]
        if (enabled.some((isEnabled, index) => isEnabled && (!Number.isInteger(Number(intervals[index])) || Number(intervals[index]) <= 0))) {
            throw new Error('Enter a positive whole-day custom interval for every enabled service level.')
        }
    }

    return {
        ...input,
        fleet: input.fleet.trim(),
        make: input.make.trim(),
        model: input.model.trim(),
        serial: input.serial.trim(),
        siteId: input.siteId.trim(),
        registrationNumber,
        wofRequired: input.complianceStatus === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED,
        currentWofExpiry,
        regoExpiry,
        customAIntervalDays: input.customAIntervalDays.trim(),
        customBIntervalDays: input.customBIntervalDays.trim(),
        customCIntervalDays: input.customCIntervalDays.trim(),
    }
}

export type EquipmentSortKey = 'fleet' | 'customer' | 'site' | 'make' | 'model' | 'serial' | 'jobs' | 'dataStatus'
export type SortDirection = 'asc' | 'desc'

export type EquipmentRecord = Equipment
