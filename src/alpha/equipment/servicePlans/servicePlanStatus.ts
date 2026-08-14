import type { EquipmentServicePlan, ServicePlanStatus } from './equipmentServicePlan.types.ts'
import type { Equipment } from '../../jobs/types/equipment.types'
import { resolveMaintenanceConfiguration } from './maintenanceConfiguration.ts'

export const SERVICE_STATUS_THRESHOLDS = { dueSoonHours: 50 } as const

export type SuggestedServiceDate = {
    date: string
    basis: 'hours' | 'calendar' | 'both'
    isOverdue: boolean
    isDueToday: boolean
}

function validDateOnly(value?: string | null) {
    const date = value?.slice(0, 10) ?? ''
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
        ? date
        : null
}

export function calculateSuggestedServiceDate(
    calendarDueDate?: string | null,
    estimatedHourDueDate?: string | null,
    today = new Date().toISOString().slice(0, 10),
): SuggestedServiceDate | null {
    const calendar = validDateOnly(calendarDueDate)
    const hours = validDateOnly(estimatedHourDueDate)
    if (!calendar && !hours) return null
    const date = calendar && hours ? (calendar < hours ? calendar : hours) : calendar ?? hours!
    const basis = calendar === date && hours === date ? 'both' : hours === date ? 'hours' : 'calendar'
    return { date, basis, isOverdue: date < today, isDueToday: date === today }
}

export function calculateHoursRemaining(currentHours: number, nextDueHours?: number | null) {
    return nextDueHours == null ? null : nextDueHours - currentHours
}

export function calculateServiceStatus(currentHours: number, nextDueHours?: number | null, nextDueDate?: string | null, today = new Date().toISOString().slice(0, 10)): ServicePlanStatus | null {
    const remaining = calculateHoursRemaining(currentHours, nextDueHours)
    const daysRemaining = nextDueDate ? Math.ceil((new Date(`${nextDueDate.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000) : null
    if (remaining == null && daysRemaining == null) return null
    if ((remaining != null && remaining < 0) || (daysRemaining != null && daysRemaining < 0)) return 'Overdue'
    if (remaining === 0 || daysRemaining === 0) return 'Due'
    if ((remaining != null && remaining <= SERVICE_STATUS_THRESHOLDS.dueSoonHours) || (daysRemaining != null && daysRemaining <= 30)) return 'Due Soon'
    return 'OK'
}

export function getActiveServicePlans(plans: EquipmentServicePlan[], equipment?: Partial<Equipment> | null) {
    const activeTypes = new Set(resolveMaintenanceConfiguration(equipment).activeServiceTypes)
    return plans.filter((plan) => plan.gr_active && activeTypes.has(plan.gr_servicetype))
}

export function calculatePrimaryNextService(plans: EquipmentServicePlan[], equipment?: Partial<Equipment> | null) {
    const rank = { Overdue: 0, Due: 1, 'Due Soon': 2, OK: 3 } as const
    return getActiveServicePlans(plans, equipment)
        .filter((plan) => plan.gr_nextduehours != null || plan.gr_nextduedate)
        .sort((a, b) => {
            const aStatus = calculateServiceStatus(equipment?.gr_currenthourmeter ?? 0, a.gr_nextduehours, a.gr_nextduedate)
            const bStatus = calculateServiceStatus(equipment?.gr_currenthourmeter ?? 0, b.gr_nextduehours, b.gr_nextduedate)
            return (aStatus ? rank[aStatus] : 4) - (bStatus ? rank[bStatus] : 4)
                || (a.gr_nextduehours ?? Infinity) - (b.gr_nextduehours ?? Infinity)
        })[0] ?? null
}
