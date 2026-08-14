import type { Equipment } from '../jobs/types/equipment.types'

export type EquipmentMapCoordinate = {
    latitude: number
    longitude: number
    formattedAddress: string
}

export type EquipmentMapSite = {
    siteId: string
    siteName: string
    address: string
    customerId: string
    customerName: string
    equipment: Equipment[]
    coordinate?: EquipmentMapCoordinate | null
}
