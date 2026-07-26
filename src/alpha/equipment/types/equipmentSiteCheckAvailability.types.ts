export const EQUIPMENT_SITE_CHECK_AVAILABILITIES = {
    AVAILABLE_AT_SITE: 122830000,
    TEMPORARILY_OFF_SITE: 122830001,
    IN_WORKSHOP: 122830002,
} as const

export type EquipmentSiteCheckAvailability =
    typeof EQUIPMENT_SITE_CHECK_AVAILABILITIES[keyof typeof EQUIPMENT_SITE_CHECK_AVAILABILITIES]

export const EQUIPMENT_SITE_CHECK_AVAILABILITY_OPTIONS = [
    { value: EQUIPMENT_SITE_CHECK_AVAILABILITIES.AVAILABLE_AT_SITE, label: 'Available at Site' },
    { value: EQUIPMENT_SITE_CHECK_AVAILABILITIES.TEMPORARILY_OFF_SITE, label: 'Temporarily Off-site' },
    { value: EQUIPMENT_SITE_CHECK_AVAILABILITIES.IN_WORKSHOP, label: 'In Workshop' },
] as const

export function resolveEquipmentSiteCheckAvailability(
    value?: EquipmentSiteCheckAvailability | null,
) {
    return value === EQUIPMENT_SITE_CHECK_AVAILABILITIES.TEMPORARILY_OFF_SITE
        || value === EQUIPMENT_SITE_CHECK_AVAILABILITIES.IN_WORKSHOP
        ? value
        : EQUIPMENT_SITE_CHECK_AVAILABILITIES.AVAILABLE_AT_SITE
}

export function isEquipmentSiteCheckAvailability(
    value: unknown,
): value is EquipmentSiteCheckAvailability {
    return Object.values(EQUIPMENT_SITE_CHECK_AVAILABILITIES)
        .includes(value as EquipmentSiteCheckAvailability)
}
