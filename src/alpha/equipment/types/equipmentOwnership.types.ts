export const EQUIPMENT_OWNERSHIP_TYPES = {
    CUSTOMER_OWNED: 122830000,
    LIFTRUCKS_RENTAL: 122830001,
} as const

export type EquipmentOwnershipType =
    typeof EQUIPMENT_OWNERSHIP_TYPES[keyof typeof EQUIPMENT_OWNERSHIP_TYPES]

export const EQUIPMENT_OWNERSHIP_OPTIONS: Array<{
    value: EquipmentOwnershipType
    label: string
}> = [
    { value: EQUIPMENT_OWNERSHIP_TYPES.CUSTOMER_OWNED, label: 'Customer owned' },
    { value: EQUIPMENT_OWNERSHIP_TYPES.LIFTRUCKS_RENTAL, label: 'Liftrucks rental' },
]

export function isEquipmentOwnershipType(value: unknown): value is EquipmentOwnershipType {
    return Object.values(EQUIPMENT_OWNERSHIP_TYPES).includes(value as EquipmentOwnershipType)
}

export function getEquipmentOwnershipLabel(value?: EquipmentOwnershipType | null) {
    return EQUIPMENT_OWNERSHIP_OPTIONS.find((option) => option.value === value)?.label
        ?? 'Not classified'
}
