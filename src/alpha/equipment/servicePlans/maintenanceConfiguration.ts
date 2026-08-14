import type { Equipment } from '../../jobs/types/equipment.types'
import {
    SERVICE_INTERVAL_HOURS,
    SERVICE_TYPES,
    type PlannedServiceType,
    type ServiceType,
} from './equipmentServicePlan.types.ts'

export const POWER_TYPES = { ICE: 122830000, ELECTRIC: 122830001, OTHER_UNKNOWN: 122830002 } as const
export const SERVICE_PROGRAMMES = { ICE_STANDARD: 122830000, ELECTRIC_STANDARD: 122830001, CUSTOM: 122830002 } as const
export const MAINTENANCE_PROFILES = { HIGH_USAGE: 122830000, STANDARD: 122830001, LOW_USAGE: 122830002, CUSTOM: 122830003 } as const

export type PowerType = typeof POWER_TYPES[keyof typeof POWER_TYPES]
export type ServiceProgramme = typeof SERVICE_PROGRAMMES[keyof typeof SERVICE_PROGRAMMES]
export type MaintenanceProfile = typeof MAINTENANCE_PROFILES[keyof typeof MAINTENANCE_PROFILES]
export type MaintenanceInterval = { unit: 'weeks' | 'months' | 'days'; value: number }

export type EquipmentMaintenanceSetupInput = {
    powerType: PowerType
    serviceProgramme: ServiceProgramme
    maintenanceProfile: MaintenanceProfile
    customAEnabled: boolean
    customBEnabled: boolean
    customCEnabled: boolean
    customAIntervalDays: number | null
    customBIntervalDays: number | null
    customCIntervalDays: number | null
}

const ALL_LEVELS: PlannedServiceType[] = [SERVICE_TYPES.A, SERVICE_TYPES.B, SERVICE_TYPES.C]

const PROFILE_INTERVALS: Record<Exclude<MaintenanceProfile, typeof MAINTENANCE_PROFILES.CUSTOM>, Record<PlannedServiceType, MaintenanceInterval>> = {
    [MAINTENANCE_PROFILES.HIGH_USAGE]: {
        [SERVICE_TYPES.A]: { unit: 'weeks', value: 6 },
        [SERVICE_TYPES.B]: { unit: 'months', value: 6 },
        [SERVICE_TYPES.C]: { unit: 'months', value: 12 },
    },
    [MAINTENANCE_PROFILES.STANDARD]: {
        [SERVICE_TYPES.A]: { unit: 'months', value: 3 },
        [SERVICE_TYPES.B]: { unit: 'months', value: 12 },
        [SERVICE_TYPES.C]: { unit: 'months', value: 24 },
    },
    [MAINTENANCE_PROFILES.LOW_USAGE]: {
        [SERVICE_TYPES.A]: { unit: 'months', value: 6 },
        [SERVICE_TYPES.B]: { unit: 'months', value: 24 },
        [SERVICE_TYPES.C]: { unit: 'months', value: 48 },
    },
}

export type ResolvedMaintenanceConfiguration = {
    powerType: PowerType
    programme: ServiceProgramme
    profile: MaintenanceProfile
    activeServiceTypes: PlannedServiceType[]
    serviceLevels: Partial<Record<PlannedServiceType, { hours: number; timeInterval: MaintenanceInterval }>>
}

function customEnabled(equipment: Partial<Equipment>, serviceType: PlannedServiceType) {
    if (serviceType === SERVICE_TYPES.A) return equipment.gr_customaenabled !== false
    if (serviceType === SERVICE_TYPES.B) return equipment.gr_custombenabled === true
    return equipment.gr_customcenabled !== false
}

function customIntervalDays(equipment: Partial<Equipment>, serviceType: PlannedServiceType) {
    if (serviceType === SERVICE_TYPES.A) return equipment.gr_customaintervaldays
    if (serviceType === SERVICE_TYPES.B) return equipment.gr_custombintervaldays
    return equipment.gr_customcintervaldays
}

export function resolveMaintenanceConfiguration(equipment?: Partial<Equipment> | null): ResolvedMaintenanceConfiguration {
    const powerType = equipment?.gr_powertype ?? POWER_TYPES.OTHER_UNKNOWN
    const programme = equipment?.gr_serviceprogramme ?? SERVICE_PROGRAMMES.ICE_STANDARD
    const profile = equipment?.gr_maintenanceprofile ?? MAINTENANCE_PROFILES.STANDARD
    const activeServiceTypes = programme === SERVICE_PROGRAMMES.ELECTRIC_STANDARD
        ? [SERVICE_TYPES.A, SERVICE_TYPES.C]
        : programme === SERVICE_PROGRAMMES.CUSTOM
            ? ALL_LEVELS.filter((serviceType) => equipment ? customEnabled(equipment, serviceType) : serviceType === SERVICE_TYPES.A)
            : ALL_LEVELS
    const safeActiveTypes = activeServiceTypes.length ? activeServiceTypes : [SERVICE_TYPES.A]
    const serviceLevels: ResolvedMaintenanceConfiguration['serviceLevels'] = {}
    for (const serviceType of safeActiveTypes) {
        const customDays = equipment ? customIntervalDays(equipment, serviceType) : null
        const timeInterval = profile === MAINTENANCE_PROFILES.CUSTOM
            ? { unit: 'days' as const, value: customDays && customDays > 0 ? customDays : 1 }
            : PROFILE_INTERVALS[profile][serviceType]
        serviceLevels[serviceType] = { hours: SERVICE_INTERVAL_HOURS[serviceType], timeInterval }
    }
    return { powerType, programme, profile, activeServiceTypes: safeActiveTypes, serviceLevels }
}

export function isServiceTypeEnabled(equipment: Partial<Equipment> | null | undefined, serviceType: ServiceType) {
    return serviceType === SERVICE_TYPES.NONE || resolveMaintenanceConfiguration(equipment).activeServiceTypes.includes(serviceType)
}

export function resolveSatisfiedServiceLevels(equipment: Partial<Equipment> | null | undefined, serviceType: ServiceType) {
    if (serviceType === SERVICE_TYPES.NONE) return []
    const active = new Set(resolveMaintenanceConfiguration(equipment).activeServiceTypes)
    if (!active.has(serviceType)) return [serviceType]
    const completedIndex = ALL_LEVELS.indexOf(serviceType)
    return ALL_LEVELS.slice(0, completedIndex + 1).filter((type) => active.has(type))
}

export function calculateNextDueDate(completedDate: string, interval: MaintenanceInterval) {
    const date = new Date(`${completedDate.slice(0, 10)}T12:00:00Z`)
    if (Number.isNaN(date.getTime())) return null
    if (interval.unit === 'months') date.setUTCMonth(date.getUTCMonth() + interval.value)
    else date.setUTCDate(date.getUTCDate() + interval.value * (interval.unit === 'weeks' ? 7 : 1))
    return date.toISOString().slice(0, 10)
}

export function formatMaintenanceInterval(interval: MaintenanceInterval) {
    return `${interval.value} ${interval.unit === 'days' ? 'days' : interval.unit === 'weeks' ? 'weeks' : 'months'}`
}

export function validateMaintenanceConfiguration(equipment: Equipment) {
    const resolved = resolveMaintenanceConfiguration(equipment)
    if (!resolved.activeServiceTypes.length) return 'At least one service level must remain enabled.'
    if (resolved.profile === MAINTENANCE_PROFILES.CUSTOM) {
        for (const serviceType of resolved.activeServiceTypes) {
            if ((customIntervalDays(equipment, serviceType) ?? 0) <= 0) return 'Enter a positive custom interval for every enabled service level.'
        }
    }
    return null
}
