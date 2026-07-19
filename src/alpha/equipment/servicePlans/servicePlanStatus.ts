import type { EquipmentServicePlan, ServicePlanStatus } from './equipmentServicePlan.types'

export const SERVICE_STATUS_THRESHOLDS = { dueSoonHours: 50 } as const

export function calculateHoursRemaining(currentHours: number, nextDueHours?: number | null) {
    return nextDueHours == null ? null : nextDueHours - currentHours
}

export function calculateServiceStatus(currentHours: number, nextDueHours?: number | null): ServicePlanStatus | null {
    const remaining = calculateHoursRemaining(currentHours, nextDueHours)
    if (remaining == null) return null
    if (remaining < 0) return 'Overdue'
    if (remaining === 0) return 'Due'
    if (remaining <= SERVICE_STATUS_THRESHOLDS.dueSoonHours) return 'Due Soon'
    return 'OK'
}

export function calculatePrimaryNextService(plans: EquipmentServicePlan[]) {
    return plans
        .filter((plan) => plan.gr_active && plan.gr_nextduehours != null)
        .sort((a, b) => (a.gr_nextduehours ?? Infinity) - (b.gr_nextduehours ?? Infinity))[0] ?? null
}
