import {
    SERVICE_INTERVAL_HOURS,
    SERVICE_TYPES,
    type EquipmentServicePlan,
    type PlannedServiceType,
    type ServicePlanCompletion,
    type ServiceType,
} from './equipmentServicePlan.types'

const SERVICE_ORDER: PlannedServiceType[] = [SERVICE_TYPES.A, SERVICE_TYPES.B, SERVICE_TYPES.C]

export function getPlansToUpdate(serviceType: ServiceType): PlannedServiceType[] {
    if (serviceType === SERVICE_TYPES.NONE) return []
    const completedIndex = SERVICE_ORDER.indexOf(serviceType)
    return completedIndex < 0 ? [] : SERVICE_ORDER.slice(0, completedIndex + 1)
}

export function calculateNextDueHours(serviceType: PlannedServiceType, completedHours: number) {
    return completedHours + SERVICE_INTERVAL_HOURS[serviceType]
}

export function applyServiceCompletion(
    plans: EquipmentServicePlan[],
    completion: ServicePlanCompletion,
): EquipmentServicePlan[] {
    const types = new Set(getPlansToUpdate(completion.serviceType))
    return plans.map((plan) => types.has(plan.gr_servicetype) ? {
        ...plan,
        gr_lastcompleteddate: completion.completedDate,
        gr_lastcompletedhours: completion.hourMeter,
        gr_nextduehours: calculateNextDueHours(plan.gr_servicetype, completion.hourMeter),
        gr_LastCompletedJob: { gr_jobid: completion.jobId },
    } : plan)
}

export function calculateIncreasingHourMeter(currentHours: number | null | undefined, jobHours: number) {
    return Math.max(currentHours ?? 0, jobHours)
}
