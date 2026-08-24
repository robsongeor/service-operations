export type ScopedDataCacheReadOptions = {
    forceRefresh?: boolean
    maxAgeMs?: number
}

type CacheEntry<T> = {
    value?: T
    loadedAt?: number
    request?: Promise<T>
    requestKind?: 'normal' | 'force'
    requestId?: number
}

export type ScopedDataCacheGeneration = Readonly<{
    global: number
    scope: number
}>

/**
 * Account-scoped in-memory read cache with stale-response protection.
 *
 * Invalidation and direct writes advance a generation. A request from an older generation may
 * still resolve for its original caller, but it cannot replace a newer cache value. When the old
 * caller is still active it is handed the newer value or one new authoritative load.
 */
export class ScopedDataCache<T> {
    private readonly entries = new Map<string, CacheEntry<T>>()
    private readonly scopeGenerations = new Map<string, number>()
    private readonly listeners = new Map<string, Set<(value: T, loadedAt: number) => void>>()
    private globalGeneration = 0
    private nextRequestId = 0

    captureGeneration(scope: string): ScopedDataCacheGeneration {
        return {
            global: this.globalGeneration,
            scope: this.scopeGenerations.get(scope) ?? 0,
        }
    }

    isGenerationCurrent(scope: string, generation: ScopedDataCacheGeneration) {
        return generation.global === this.globalGeneration
            && generation.scope === (this.scopeGenerations.get(scope) ?? 0)
    }

    private advanceScope(scope: string) {
        this.scopeGenerations.set(scope, (this.scopeGenerations.get(scope) ?? 0) + 1)
    }

    private notify(scope: string, value: T, loadedAt: number) {
        this.listeners.get(scope)?.forEach((listener) => listener(value, loadedAt))
    }

    subscribe(scope: string, listener: (value: T, loadedAt: number) => void) {
        const listeners = this.listeners.get(scope) ?? new Set()
        listeners.add(listener)
        this.listeners.set(scope, listeners)
        const entry = this.entries.get(scope)
        if (entry?.value !== undefined && entry.loadedAt !== undefined) {
            listener(entry.value, entry.loadedAt)
        }
        return () => {
            listeners.delete(listener)
            if (listeners.size === 0) this.listeners.delete(scope)
        }
    }

    async read(
        scope: string,
        loader: () => Promise<T>,
        options: ScopedDataCacheReadOptions = {},
    ): Promise<T> {
        let entry = this.entries.get(scope) ?? {}
        const maxAgeMs = options.maxAgeMs ?? 0
        const isFresh = entry.value !== undefined
            && entry.loadedAt !== undefined
            && Date.now() - entry.loadedAt < maxAgeMs

        if (!options.forceRefresh && isFresh) return entry.value!
        if (entry.request) {
            if (!options.forceRefresh || entry.requestKind === 'force') return entry.request

            // An authoritative refresh must not join a request that began before it was required.
            this.advanceScope(scope)
            entry = entry.value !== undefined
                ? { value: entry.value, loadedAt: entry.loadedAt }
                : {}
        }

        const generation = this.captureGeneration(scope)
        const requestId = ++this.nextRequestId
        const requestKind = options.forceRefresh ? 'force' : 'normal'
        const request = loader()
            .then(async (value): Promise<T> => {
                const current = this.entries.get(scope)
                const canCommit = this.isGenerationCurrent(scope, generation)
                    && current?.requestId === requestId

                if (canCommit) {
                    const loadedAt = Date.now()
                    this.entries.set(scope, { value, loadedAt })
                    this.notify(scope, value, loadedAt)
                    return value
                }

                // A mutation, invalidation, or newer force refresh won the race.
                if (current?.request) return current.request
                if (current?.value !== undefined) return current.value
                return this.read(scope, loader, { ...options, forceRefresh: true })
            })
            .catch((error) => {
                const current = this.entries.get(scope)
                if (this.isGenerationCurrent(scope, generation) && current?.requestId === requestId) {
                    if (entry.value !== undefined) {
                        this.entries.set(scope, { value: entry.value, loadedAt: entry.loadedAt })
                    } else {
                        this.entries.delete(scope)
                    }
                }
                throw error
            })

        this.entries.set(scope, { ...entry, request, requestKind, requestId })
        return request
    }

    invalidate(scope?: string) {
        if (scope) {
            this.advanceScope(scope)
            this.entries.delete(scope)
            return
        }
        this.globalGeneration += 1
        this.entries.clear()
    }

    write(scope: string, value: T) {
        this.advanceScope(scope)
        const loadedAt = Date.now()
        this.entries.set(scope, { value, loadedAt })
        this.notify(scope, value, loadedAt)
    }

    writeIfCurrent(scope: string, generation: ScopedDataCacheGeneration, value: T) {
        if (!this.isGenerationCurrent(scope, generation)) return false
        const loadedAt = Date.now()
        this.entries.set(scope, { value, loadedAt })
        this.notify(scope, value, loadedAt)
        return true
    }
}
