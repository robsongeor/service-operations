export const EQUIPMENT_COMPLIANCE_STATUSES = {
    ROAD_REGISTERED: 122830000,
    DEREGISTERED: 122830001,
    OFF_ROAD: 122830002,
} as const

export type EquipmentComplianceStatus = typeof EQUIPMENT_COMPLIANCE_STATUSES[keyof typeof EQUIPMENT_COMPLIANCE_STATUSES]

export const EQUIPMENT_COMPLIANCE_STATUS_OPTIONS: { value: EquipmentComplianceStatus; label: string }[] = [
    { value: EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED, label: 'Road Registered' },
    { value: EQUIPMENT_COMPLIANCE_STATUSES.DEREGISTERED, label: 'Deregistered' },
    { value: EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD, label: 'Off Road' },
]

type EquipmentComplianceFields = {
    gr_compliancestatus?: number | null
    gr_wofrequired?: boolean | null
}

export function isEquipmentComplianceStatus(value?: number | null): value is EquipmentComplianceStatus {
    return EQUIPMENT_COMPLIANCE_STATUS_OPTIONS.some((option) => option.value === value)
}

export function getEquipmentComplianceStatus(equipment: EquipmentComplianceFields): EquipmentComplianceStatus {
    if (isEquipmentComplianceStatus(equipment.gr_compliancestatus)) return equipment.gr_compliancestatus
    return equipment.gr_wofrequired
        ? EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED
        : EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD
}

export function isRoadRegistered(equipment: EquipmentComplianceFields) {
    return getEquipmentComplianceStatus(equipment) === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED
}

export function getEquipmentComplianceStatusLabel(status: EquipmentComplianceStatus) {
    return EQUIPMENT_COMPLIANCE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Unknown'
}
