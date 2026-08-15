import { EquipmentDataCache, equipmentCacheScope, type EquipmentCacheReadOptions } from '../equipment/services/equipmentDataCache.ts'
import type { PrototypeEquipment } from './jobBookPrototype'

export type JobBookEquipmentIndexCacheOptions = EquipmentCacheReadOptions

export const JOB_BOOK_EQUIPMENT_INDEX_DEVICE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const DATABASE_NAME = 'service-operations-job-book-cache'
const STORE_NAME = 'equipment-index-snapshots'
const SCHEMA_VERSION = 1

type PersistedSnapshot = {
    scope: string
    schemaVersion: number
    savedAt: number
    rows: PrototypeEquipment[]
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

export function jobBookEquipmentIndexScope(accessToken: string) {
    return equipmentCacheScope(accessToken)
}

export async function readPersistedJobBookEquipmentIndex(scope: string, now = Date.now()) {
    const database = await openDatabase()
    if (!database) return undefined
    try {
        const snapshot = await new Promise<PersistedSnapshot | undefined>((resolve) => {
            const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(scope)
            request.onsuccess = () => resolve(request.result as PersistedSnapshot | undefined)
            request.onerror = () => resolve(undefined)
        })
        if (!snapshot
            || snapshot.schemaVersion !== SCHEMA_VERSION
            || !Array.isArray(snapshot.rows)
            || now - snapshot.savedAt > JOB_BOOK_EQUIPMENT_INDEX_DEVICE_MAX_AGE_MS) {
            if (snapshot) void deletePersistedJobBookEquipmentIndex(scope)
            return undefined
        }
        return snapshot
    } finally {
        database.close()
    }
}

export async function writePersistedJobBookEquipmentIndex(
    scope: string,
    rows: PrototypeEquipment[],
    savedAt = Date.now(),
) {
    const database = await openDatabase()
    if (!database) return
    try {
        await new Promise<void>((resolve) => {
            const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({
                scope,
                schemaVersion: SCHEMA_VERSION,
                savedAt,
                rows,
            } satisfies PersistedSnapshot)
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
        })
    } finally {
        database.close()
    }
}

export async function deletePersistedJobBookEquipmentIndex(scope?: string) {
    const database = await openDatabase()
    if (!database) return
    try {
        await new Promise<void>((resolve) => {
            const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
            const request = scope ? store.delete(scope) : store.clear()
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
        })
    } finally {
        database.close()
    }
}

export const sharedJobBookEquipmentIndexCache = new EquipmentDataCache<PrototypeEquipment[]>()
