import type { Equipment } from '../../jobs/types/equipment.types'

type CacheEntry<T> = {
    value?: T
    loadedAt?: number
    request?: Promise<T>
}

export type EquipmentCacheReadOptions = {
    forceRefresh?: boolean
    maxAgeMs?: number
}

export const DEFAULT_EQUIPMENT_CACHE_MAX_AGE_MS = 5 * 60 * 1000
export const EQUIPMENT_DEVICE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const EQUIPMENT_CACHE_DATABASE = 'service-operations-cache'
const EQUIPMENT_CACHE_STORE = 'equipment-snapshots'
const EQUIPMENT_CACHE_SCHEMA_VERSION = 1

type PersistedEquipmentSnapshot = {
    scope: string
    schemaVersion: number
    savedAt: number
    rows: Equipment[]
}

export class EquipmentDataCache<T> {
    private readonly entries = new Map<string, CacheEntry<T>>()

    async read(
        scope: string,
        loader: () => Promise<T>,
        options: EquipmentCacheReadOptions = {},
    ): Promise<T> {
        const entry = this.entries.get(scope) ?? {}
        const maxAgeMs = options.maxAgeMs ?? DEFAULT_EQUIPMENT_CACHE_MAX_AGE_MS
        const isFresh = entry.value !== undefined
            && entry.loadedAt !== undefined
            && Date.now() - entry.loadedAt < maxAgeMs

        if (!options.forceRefresh && isFresh) return entry.value!
        if (entry.request) return entry.request

        const request = loader()
            .then((value) => {
                this.entries.set(scope, { value, loadedAt: Date.now() })
                return value
            })
            .catch((error) => {
                if (entry.value !== undefined) this.entries.set(scope, entry)
                else this.entries.delete(scope)
                throw error
            })

        this.entries.set(scope, { ...entry, request })
        return request
    }

    invalidate(scope?: string) {
        if (scope) this.entries.delete(scope)
        else this.entries.clear()
    }

    write(scope: string, value: T) {
        this.entries.set(scope, { value, loadedAt: Date.now() })
    }
}

function openEquipmentCacheDatabase(): Promise<IDBDatabase | undefined> {
    if (!globalThis.indexedDB) return Promise.resolve(undefined)
    return new Promise((resolve) => {
        try {
            const request = globalThis.indexedDB.open(EQUIPMENT_CACHE_DATABASE, 1)
            request.onupgradeneeded = () => {
                const database = request.result
                if (!database.objectStoreNames.contains(EQUIPMENT_CACHE_STORE)) {
                    database.createObjectStore(EQUIPMENT_CACHE_STORE, { keyPath: 'scope' })
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

export async function readPersistedEquipmentSnapshot(scope: string, now = Date.now()) {
    const database = await openEquipmentCacheDatabase()
    if (!database) return undefined
    try {
        const snapshot = await new Promise<PersistedEquipmentSnapshot | undefined>((resolve) => {
            const request = database.transaction(EQUIPMENT_CACHE_STORE, 'readonly')
                .objectStore(EQUIPMENT_CACHE_STORE)
                .get(scope)
            request.onsuccess = () => resolve(request.result as PersistedEquipmentSnapshot | undefined)
            request.onerror = () => resolve(undefined)
        })
        if (!snapshot
            || snapshot.schemaVersion !== EQUIPMENT_CACHE_SCHEMA_VERSION
            || !Array.isArray(snapshot.rows)
            || now - snapshot.savedAt > EQUIPMENT_DEVICE_CACHE_MAX_AGE_MS) {
            if (snapshot) void deletePersistedEquipmentSnapshot(scope)
            return undefined
        }
        return snapshot
    } finally {
        database.close()
    }
}

export async function writePersistedEquipmentSnapshot(scope: string, rows: Equipment[], savedAt = Date.now()) {
    const database = await openEquipmentCacheDatabase()
    if (!database) return
    try {
        await new Promise<void>((resolve) => {
            const request = database.transaction(EQUIPMENT_CACHE_STORE, 'readwrite')
                .objectStore(EQUIPMENT_CACHE_STORE)
                .put({ scope, schemaVersion: EQUIPMENT_CACHE_SCHEMA_VERSION, savedAt, rows } satisfies PersistedEquipmentSnapshot)
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
        })
    } finally {
        database.close()
    }
}

export async function deletePersistedEquipmentSnapshot(scope?: string) {
    const database = await openEquipmentCacheDatabase()
    if (!database) return
    try {
        await new Promise<void>((resolve) => {
            const store = database.transaction(EQUIPMENT_CACHE_STORE, 'readwrite').objectStore(EQUIPMENT_CACHE_STORE)
            const request = scope ? store.delete(scope) : store.clear()
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
        })
    } finally {
        database.close()
    }
}

function decodeJwtClaims(accessToken: string): Record<string, unknown> | undefined {
    try {
        const payload = accessToken.split('.')[1]
        if (!payload) return undefined
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
        return JSON.parse(globalThis.atob(padded)) as Record<string, unknown>
    } catch {
        return undefined
    }
}

export function equipmentCacheScope(accessToken: string) {
    const claims = decodeJwtClaims(accessToken)
    const tenant = typeof claims?.tid === 'string' ? claims.tid : 'tenant'
    const resource = typeof claims?.aud === 'string' ? claims.aud : 'dataverse'
    const account = typeof claims?.oid === 'string'
        ? claims.oid
        : typeof claims?.sub === 'string' ? claims.sub : 'active-account'
    return `${resource}:${tenant}:${account}`
}

export const sharedEquipmentDataCache = new EquipmentDataCache<Equipment[]>()

export function invalidateSharedEquipmentDataCache(accessToken?: string) {
    const scope = accessToken ? equipmentCacheScope(accessToken) : undefined
    sharedEquipmentDataCache.invalidate(scope)
    void deletePersistedEquipmentSnapshot(scope)
}
