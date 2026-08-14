import {
    SERVICE_INTERVAL_HOURS,
    SERVICE_TYPES,
    type EquipmentServicePlan,
    type PlannedServiceType,
    type ServicePlanCompletion,
    type ServiceType,
} from './equipmentServicePlan.types.ts'
import type { Equipment } from '../../jobs/types/equipment.types'
import { calculateNextDueDate, resolveMaintenanceConfiguration, resolveSatisfiedServiceLevels } from './maintenanceConfiguration.ts'

const SERVICE_ORDER: PlannedServiceType[] = [SERVICE_TYPES.A, SERVICE_TYPES.B, SERVICE_TYPES.C]

export function getPlansToUpdate(serviceType: ServiceType, equipment?: Partial<Equipment> | null): PlannedServiceType[] {
    if (equipment) return resolveSatisfiedServiceLevels(equipment, serviceType)
    if (serviceType === SERVICE_TYPES.NONE) return []
    const completedIndex = SERVICE_ORDER.indexOf(serviceType)
    return completedIndex < 0 ? [] : SERVICE_ORDER.slice(0, completedIndex + 1)
}

export function selectSatisfiedServicePlans<T extends { gr_servicetype: PlannedServiceType }>(
    plans: T[],
    serviceType: ServiceType,
    equipment?: Partial<Equipment> | null,
): T[] {
    const requiredTypes = getPlansToUpdate(serviceType, equipment)
    const plansByType = new Map(plans.map((plan) => [plan.gr_servicetype, plan]))
    const missingType = requiredTypes.find((type) => !plansByType.has(type))
    if (missingType != null) {
        throw new Error('The Equipment maintenance schedule is incomplete. Save its maintenance setup in the Job completion dialog before retrying.')
    }
    return requiredTypes.map((type) => plansByType.get(type)!)
}

export function calculateNextDueHours(serviceType: PlannedServiceType, completedHours: number) {
    return completedHours + SERVICE_INTERVAL_HOURS[serviceType]
}

export function applyServiceCompletion(
    plans: EquipmentServicePlan[],
    completion: ServicePlanCompletion,
    equipment?: Partial<Equipment> | null,
): EquipmentServicePlan[] {
    const configuration = resolveMaintenanceConfiguration(equipment)
    const types = new Set(getPlansToUpdate(completion.serviceType, equipment))
    return plans.map((plan) => types.has(plan.gr_servicetype) ? {
        ...plan,
        gr_lastcompleteddate: completion.completedDate,
        gr_lastcompletedhours: completion.hourMeter,
        gr_nextduehours: calculateNextDueHours(plan.gr_servicetype, completion.hourMeter),
        gr_nextduedate: calculateNextDueDate(completion.completedDate, configuration.serviceLevels[plan.gr_servicetype]!.timeInterval),
        gr_LastCompletedJob: { gr_jobid: completion.jobId },
    } : plan)
}

export function calculateIncreasingHourMeter(currentHours: number | null | undefined, jobHours: number) {
    return Math.max(currentHours ?? 0, jobHours)
}
