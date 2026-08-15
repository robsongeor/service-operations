import type { EquipmentMapCoordinate } from './equipmentMap.types'

const KEY_PREFIX = 'service-operations.equipment-map-geocoding.v2'
const LEGACY_KEY_PREFIX = 'service-operations.equipment-map-geocoding.v1'
const DATABASE_NAME = 'service-operations-equipment-map-cache'
const STORE_NAME = 'coordinate-snapshots'
const SCHEMA_VERSION = 1

export type CachedCoordinate = {
    address: string
    coordinate: EquipmentMapCoordinate | null
    status?: 'matched' | 'not_found'
}

type PersistedCoordinateSnapshot = {
    scope: string
    schemaVersion: number
    coordinates: Record<string, CachedCoordinate>
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

function validCache(value: unknown): Record<string, CachedCoordinate> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
        const coordinate = entry as Partial<CachedCoordinate> | null
        return coordinate
            && typeof coordinate.address === 'string'
            && (validCoordinate(coordinate.coordinate)
                || (coordinate.coordinate === null && coordinate.status === 'not_found'))
    })) as Record<string, CachedCoordinate>
}

function openDatabase(): Promise<IDBDatabase | undefined> {
    if (!globalThis.indexedDB) return Promise.resolve(undefined)
    return new Promise((resolve) => {
        try {
            const request = globalThis.indexedDB.open(DATABASE_NAME, 1)
            request.onupgradeneeded = () => {
                const database = request.result
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'scope' })
                }
            }
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => resolve(undefined)
            request.onblocked = () => resolve(undefined)
        } catch {
            resolve(undefined)
        }
    })
}

function legacySessionCache(storageId: string) {
    try {
        const raw = globalThis.sessionStorage?.getItem(`${LEGACY_KEY_PREFIX}.${storageId}`)
        return validCache(raw ? JSON.parse(raw) : undefined)
    } catch {
        return {}
    }
}

export function equipmentMapCacheKey(storageId: string, environmentUrl = '') {
    const environment = environmentUrl.trim().replace(/\/+$/, '').toLocaleLowerCase('en-NZ') || 'dataverse'
    return `${KEY_PREFIX}.${encodeURIComponent(environment)}.${storageId}`
}

export async function restoreEquipmentMapCache(storageKey: string, legacyStorageId?: string) {
    const database = await openDatabase()
    let coordinates: Record<string, CachedCoordinate> = {}
    if (database) {
        try {
            const snapshot = await new Promise<PersistedCoordinateSnapshot | undefined>((resolve) => {
                const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(storageKey)
                request.onsuccess = () => resolve(request.result as PersistedCoordinateSnapshot | undefined)
                request.onerror = () => resolve(undefined)
            })
            if (snapshot?.schemaVersion === SCHEMA_VERSION) coordinates = validCache(snapshot.coordinates)
        } finally {
            database.close()
        }
    }

    if (Object.keys(coordinates).length || !legacyStorageId) return coordinates
    coordinates = legacySessionCache(legacyStorageId)
    if (Object.keys(coordinates).length) await saveEquipmentMapCache(storageKey, coordinates)
    return coordinates
}

export async function saveEquipmentMapCache(storageKey: string, coordinates: Record<string, CachedCoordinate>) {
    const database = await openDatabase()
    if (!database) return
    try {
        await new Promise<void>((resolve) => {
            const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
                scope: storageKey,
                schemaVersion: SCHEMA_VERSION,
                coordinates: validCache(coordinates),
            } satisfies PersistedCoordinateSnapshot)
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
        })
    } finally {
        database.close()
    }
}
