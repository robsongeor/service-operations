import type { Equipment } from '../../jobs/types/equipment.types'

export type EquipmentUpdateInput = {
    fleet: string
    make: string
    model: string
    serial: string
    siteId: string
}

export type EquipmentSortKey = 'fleet' | 'customer' | 'site' | 'make' | 'model' | 'serial'
export type SortDirection = 'asc' | 'desc'

export type EquipmentRecord = Equipment
