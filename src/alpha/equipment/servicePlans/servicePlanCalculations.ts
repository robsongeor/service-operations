import {
    SERVICE_INTERVAL_HOURS,
    SERVICE_TYPES,
    type EquipmentServicePlan,
    type PlannedServiceType,
    type ServicePlanCompletion,
    type ServiceType,
} from './equipmentServicePlan.types.ts'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Job } from '../../jobs/types/job.types'
import { calculateNextDueDate, resolveMaintenanceConfiguration, resolveSatisfiedServiceLevels } from './maintenanceConfiguration.ts'
import {
    calculateEquipmentUsageForecast,
    calculateUsageAdjustedServiceInterval,
    estimateUsageThresholdDate,
    resolveLatestHourMeterReading,
} from './equipmentUsageForecast.ts'

const SERVICE_ORDER: PlannedServiceType[] = [SERVICE_TYPES.A, SERVICE_TYPES.B, SERVICE_TYPES.C]

type ServiceHistoryBaseline = {
    serviceType: PlannedServiceType
    lastCompletedDate?: string | null
    lastCompletedHours?: number | null
}

function selectLatestSatisfyingBaseline<T extends ServiceHistoryBaseline>(
    baselines: T[],
    targetType: PlannedServiceType,
    equipment?: Partial<Equipment> | null,
) {
    return baselines
        .filter((candidate) => candidate.lastCompletedDate
            && resolveSatisfiedServiceLevels(equipment, candidate.serviceType).includes(targetType))
        .sort((left, right) => {
            const dateComparison = right.lastCompletedDate!.slice(0, 10)
                .localeCompare(left.lastCompletedDate!.slice(0, 10))
            return dateComparison || SERVICE_ORDER.indexOf(right.serviceType) - SERVICE_ORDER.indexOf(left.serviceType)
        })[0]
}

export function cascadeServiceHistoryBaselines<T extends ServiceHistoryBaseline>(
    baselines: T[],
    equipment?: Partial<Equipment> | null,
): T[] {
    return baselines.map((baseline) => {
        const latest = selectLatestSatisfyingBaseline(baselines, baseline.serviceType, equipment)
        return latest ? {
            ...baseline,
            lastCompletedDate: latest.lastCompletedDate,
            lastCompletedHours: latest.lastCompletedHours,
        } : baseline
    })
}

export function resolveEffectiveServicePlans(
    plans: EquipmentServicePlan[],
    equipment?: Partial<Equipment> | null,
): EquipmentServicePlan[] {
    const configuration = resolveMaintenanceConfiguration(equipment)
    return plans.map((plan) => {
        const candidates = plans.map((candidate) => ({
            ...candidate,
            serviceType: candidate.gr_servicetype,
            lastCompletedDate: candidate.gr_lastcompleteddate,
            lastCompletedHours: candidate.gr_lastcompletedhours,
        }))
        const latest = selectLatestSatisfyingBaseline(candidates, plan.gr_servicetype, equipment)
        if (!latest || latest.gr_equipmentserviceplanid === plan.gr_equipmentserviceplanid) return plan
        const level = configuration.serviceLevels[plan.gr_servicetype]
        const completedHours = latest.gr_lastcompletedhours
        return {
            ...plan,
            gr_lastcompleteddate: latest.gr_lastcompleteddate,
            gr_lastcompletedhours: completedHours,
            gr_nextduehours: completedHours == null
                ? null
                : completedHours + (plan.gr_intervalhours ?? SERVICE_INTERVAL_HOURS[plan.gr_servicetype]),
            gr_nextduedate: latest.gr_lastcompleteddate && level
                ? calculateNextDueDate(latest.gr_lastcompleteddate, level.timeInterval)
                : null,
            gr_LastCompletedJob: latest.gr_LastCompletedJob,
        }
    })
}

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

export function recalculateServicePlanDueDates(
    equipment: Equipment,
    plans: EquipmentServicePlan[],
    jobs: readonly Job[],
): EquipmentServicePlan[] {
    const configuration = resolveMaintenanceConfiguration(equipment)
    const forecast = calculateEquipmentUsageForecast(equipment, jobs)
    const currentHours = resolveLatestHourMeterReading(equipment, jobs)?.hours
        ?? equipment.gr_currenthourmeter
        ?? 0
    return plans.map((plan) => {
        const level = configuration.serviceLevels[plan.gr_servicetype]
        if (!plan.gr_active || !level) return plan
        const interval = calculateUsageAdjustedServiceInterval(forecast, level.hours, level.timeInterval)
        const projectedDate = interval.source === 'usage'
            ? estimateUsageThresholdDate(forecast, currentHours, plan.gr_nextduehours)
            : null
        const fallbackDate = plan.gr_lastcompleteddate
            ? calculateNextDueDate(plan.gr_lastcompleteddate, level.timeInterval)
            : plan.gr_nextduedate ?? null
        return { ...plan, gr_nextduedate: projectedDate ?? fallbackDate }
    })
}

export function calculateIncreasingHourMeter(currentHours: number | null | undefined, jobHours: number) {
    return Math.max(currentHours ?? 0, jobHours)
}
