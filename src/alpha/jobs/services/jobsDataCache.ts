import type { Job } from '../types/job.types'
import { ScopedDataCache, type ScopedDataCacheReadOptions } from '../../shared/data/ScopedDataCache.ts'

export type JobsCacheReadOptions = ScopedDataCacheReadOptions

export const DEFAULT_JOBS_CACHE_MAX_AGE_MS = 5 * 60 * 1000
export const JOBS_DEVICE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const JOBS_CACHE_DATABASE = 'service-operations-jobs-cache'
const JOBS_CACHE_STORE = 'job-snapshots'
const JOBS_CACHE_SCHEMA_VERSION = 1

type PersistedJobsSnapshot = {
    scope: string
    schemaVersion: number
    savedAt: number
    rows: Job[]
}

export class JobsDataCache<T> extends ScopedDataCache<T> {
    override read(scope: string, loader: () => Promise<T>, options: JobsCacheReadOptions = {}) {
        return super.read(scope, loader, {
            maxAgeMs: DEFAULT_JOBS_CACHE_MAX_AGE_MS,
            ...options,
        })
    }
}

function openJobsCacheDatabase(): Promise<IDBDatabase | undefined> {
    if (!globalThis.indexedDB) return Promise.resolve(undefined)
    return new Promise((resolve) => {
        try {
            const request = globalThis.indexedDB.open(JOBS_CACHE_DATABASE, 1)
            request.onupgradeneeded = () => {
                const database = request.result
                if (!database.objectStoreNames.contains(JOBS_CACHE_STORE)) {
                    database.createObjectStore(JOBS_CACHE_STORE, { keyPath: 'scope' })
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

export async function readPersistedJobsSnapshot(scope: string, now = Date.now()) {
    const database = await openJobsCacheDatabase()
    if (!database) return undefined
    try {
        const snapshot = await new Promise<PersistedJobsSnapshot | undefined>((resolve) => {
            const request = database.transaction(JOBS_CACHE_STORE, 'readonly').objectStore(JOBS_CACHE_STORE).get(scope)
            request.onsuccess = () => resolve(request.result as PersistedJobsSnapshot | undefined)
            request.onerror = () => resolve(undefined)
        })
        if (!snapshot
            || snapshot.schemaVersion !== JOBS_CACHE_SCHEMA_VERSION
            || !Array.isArray(snapshot.rows)
            || now - snapshot.savedAt > JOBS_DEVICE_CACHE_MAX_AGE_MS) {
            if (snapshot) void deletePersistedJobsSnapshot(scope)
            return undefined
        }
        return snapshot
    } finally {
        database.close()
    }
}

export async function writePersistedJobsSnapshot(scope: string, rows: Job[], savedAt = Date.now()) {
    const database = await openJobsCacheDatabase()
    if (!database) return
    try {
        await new Promise<void>((resolve) => {
            const request = database.transaction(JOBS_CACHE_STORE, 'readwrite')
                .objectStore(JOBS_CACHE_STORE)
                .put({ scope, schemaVersion: JOBS_CACHE_SCHEMA_VERSION, savedAt, rows } satisfies PersistedJobsSnapshot)
            request.onsuccess = () => resolve()
            request.onerror = () => resolve()
        })
    } finally {
        database.close()
    }
}

export async function deletePersistedJobsSnapshot(scope?: string) {
    const database = await openJobsCacheDatabase()
    if (!database) return
    try {
        await new Promise<void>((resolve) => {
            const store = database.transaction(JOBS_CACHE_STORE, 'readwrite').objectStore(JOBS_CACHE_STORE)
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

export function jobsCacheScope(accessToken: string) {
    const claims = decodeJwtClaims(accessToken)
    const tenant = typeof claims?.tid === 'string' ? claims.tid : 'tenant'
    const resource = typeof claims?.aud === 'string' ? claims.aud : 'dataverse'
    const account = typeof claims?.oid === 'string'
        ? claims.oid
        : typeof claims?.sub === 'string' ? claims.sub : 'active-account'
    return `${resource}:${tenant}:${account}`
}

export const sharedJobsDataCache = new JobsDataCache<Job[]>()

export function invalidateSharedJobsDataCache(accessToken?: string) {
    const scope = accessToken ? jobsCacheScope(accessToken) : undefined
    sharedJobsDataCache.invalidate(scope)
    void deletePersistedJobsSnapshot(scope)
}
