import type { EquipmentMapCoordinate } from './equipmentMap.types'

const KEY_PREFIX = 'service-operations.equipment-map-geocoding.v1'
export type CachedCoordinate = {
    address: string
    coordinate: EquipmentMapCoordinate | null
    status?: 'matched' | 'not_found'
}

function validCoordinate(value: unknown): value is EquipmentMapCoordinate {
    const coordinate = value as Partial<EquipmentMapCoordinate> | null
    return Boolean(coordinate
        && typeof coordinate.latitude === 'number' && Number.isFinite(coordinate.latitude)
        && coordinate.latitude >= -90 && coordinate.latitude <= 90
        && typeof coordinate.longitude === 'number' && Number.isFinite(coordinate.longitude)
        && coordinate.longitude >= -180 && coordinate.longitude <= 180
        && typeof coordinate.formattedAddress === 'string')
}

export function equipmentMapCacheKey(storageId: string) {
    return `${KEY_PREFIX}.${storageId}`
}

export function restoreEquipmentMapCache(storageKey: string): Record<string, CachedCoordinate> {
    try {
        const raw = sessionStorage.getItem(storageKey)
        const parsed = raw ? JSON.parse(raw) as Record<string, Partial<CachedCoordinate>> : {}
        return Object.fromEntries(Object.entries(parsed).filter(([, value]) =>
            typeof value.address === 'string'
            && (validCoordinate(value.coordinate) || (value.coordinate === null && value.status === 'not_found')),
        )) as Record<string, CachedCoordinate>
    } catch {
        return {}
    }
}

export function saveEquipmentMapCache(storageKey: string, cache: Record<string, CachedCoordinate>) {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify(cache))
    } catch {
        // The map still works when browser storage is unavailable.
    }
}
