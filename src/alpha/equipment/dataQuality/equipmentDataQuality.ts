import type { Equipment } from '../../jobs/types/equipment.types.ts'
import { isRoadRegistered } from '../compliance/equipmentCompliance.ts'
import type { EquipmentServicePlan } from '../servicePlans/equipmentServicePlan.types.ts'

export type EquipmentDataQualitySeverity = 'critical' | 'warning' | 'none'

export type EquipmentDataQuality = {
    severity: EquipmentDataQualitySeverity
    criticalIssues: string[]
    warningIssues: string[]
}

export const EQUIPMENT_DATA_QUALITY_SEVERITY_RANK: Record<EquipmentDataQualitySeverity, number> = {
    critical: 0,
    warning: 1,
    none: 2,
}

const missing = (value?: string | null) => !value?.trim()

export function evaluateEquipmentDataQuality(
    equipment: Equipment,
    servicePlans: EquipmentServicePlan[],
): EquipmentDataQuality {
    const criticalIssues: string[] = []
    const warningIssues: string[] = []

    if (missing(equipment.gr_fleet)) criticalIssues.push('Fleet number missing')
    if (missing(equipment.gr_serial)) criticalIssues.push('Serial number missing')
    if (missing(equipment.gr_make)) criticalIssues.push('Make missing')
    if (missing(equipment.gr_model)) criticalIssues.push('Model missing')

    if (isRoadRegistered(equipment)) {
        if (missing(equipment.gr_registrationnumber)) criticalIssues.push('Registration number missing')
        if (missing(equipment.gr_regoexpiry)) criticalIssues.push('REGO expiry missing')
        if (missing(equipment.gr_currentwofexpiry)) criticalIssues.push('WOF expiry missing')
    }

    const hasMaintenanceHistory = servicePlans.some((plan) =>
        Boolean(plan.gr_lastcompleteddate)
        || plan.gr_lastcompletedhours != null
        || Boolean(plan.gr_LastCompletedJob?.gr_jobid),
    )
    if (!hasMaintenanceHistory) warningIssues.push('No maintenance history recorded')

    return {
        severity: criticalIssues.length > 0 ? 'critical' : warningIssues.length > 0 ? 'warning' : 'none',
        criticalIssues,
        warningIssues,
    }
}

function compareFleetNumber(left?: string | null, right?: string | null) {
    const leftValue = left?.trim() ?? ''
    const rightValue = right?.trim() ?? ''
    if (Boolean(leftValue) !== Boolean(rightValue)) return leftValue ? -1 : 1
    return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' })
}

export function compareEquipmentDataQuality(
    left: Equipment,
    leftPlans: EquipmentServicePlan[],
    right: Equipment,
    rightPlans: EquipmentServicePlan[],
    direction: 'asc' | 'desc',
) {
    const leftRank = EQUIPMENT_DATA_QUALITY_SEVERITY_RANK[evaluateEquipmentDataQuality(left, leftPlans).severity]
    const rightRank = EQUIPMENT_DATA_QUALITY_SEVERITY_RANK[evaluateEquipmentDataQuality(right, rightPlans).severity]
    const severityComparison = (leftRank - rightRank) * (direction === 'asc' ? 1 : -1)
    return severityComparison || compareFleetNumber(left.gr_fleet, right.gr_fleet)
}
