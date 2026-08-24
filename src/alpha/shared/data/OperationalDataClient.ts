export type OperationalQueryKey = readonly unknown[]

export type OperationalQueryStatus =
    | 'initial'
    | 'loading'
    | 'fresh'
    | 'refreshing'
    | 'stale'
    | 'error'

export type OperationalQueryState<T> = Readonly<{
    status: OperationalQueryStatus
    data?: T
    error?: Error
    fetchedAt?: number
    staleAt?: number
}>

export type OperationalQueryContext = Readonly<{ signal: AbortSignal }>
export type OperationalQueryFunction<T> = (context: OperationalQueryContext) => Promise<T>

export type OperationalQueryOptions = Readonly<{
    staleTimeMs?: number
    cacheTimeMs?: number
    forceRefresh?: boolean
}>

export type OperationalQueryUpdater<T> = T | ((current: T | undefined) => T)

export type OperationalQueryMetric = Readonly<{
    family: string
    requests: number
    cacheHits: number
    deduplicatedRequests: number
    successes: number
    failures: number
    aborted: number
    totalDurationMs: number
    payloadBytes: number
}>

export type OperationalScreenName = 'Jobs' | 'Customer Dashboard' | 'Equipment' | 'Scheduling' | 'WOF'

export type OperationalScreenMetric = Readonly<{
    screen: OperationalScreenName
    visits: number
    readySamples: number
    totalReadyMs: number
    lastReadyMs: number
    slowestReadyMs: number
}>

export type OperationalDiagnosticsSnapshot = Readonly<{
    queries: OperationalQueryMetric[]
    screens: OperationalScreenMetric[]
}>

type QueryEntry<T = unknown> = {
    key: OperationalQueryKey
    state: OperationalQueryState<T>
    listeners: Set<() => void>
    loader?: OperationalQueryFunction<T>
    staleTimeMs: number
    cacheTimeMs: number
    generation: number
    request?: Promise<T>
    requestId?: number
    requestKind?: 'normal' | 'force'
    controller?: AbortController
    evictionTimer?: ReturnType<typeof setTimeout>
}

const DEFAULT_STALE_TIME_MS = 30_000
const DEFAULT_CACHE_TIME_MS = 5 * 60_000
const INITIAL_QUERY_STATE: OperationalQueryState<never> = Object.freeze({ status: 'initial' })

function stableValue(value: unknown): string {
    if (value === undefined) return 'undefined'
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`).join(',')}}`
}

export function hashOperationalQueryKey(key: OperationalQueryKey) {
    return stableValue(key)
}

function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError'
}

/** Keep telemetry labels useful without retaining record IDs or business values from query keys. */
function metricFamily(key: OperationalQueryKey) {
    const resource = typeof key[0] === 'string' ? key[0] : 'operational-query'
    if (resource === 'customer-dashboard') {
        return `${resource}:${typeof key[2] === 'string' ? key[2] : 'scoped'}`
    }
    if (resource === 'scheduler') {
        return `${resource}:${typeof key[1] === 'string' ? key[1] : 'window'}`
    }
    if (resource === 'job-map') {
        return `${resource}:${typeof key[1] === 'string' ? key[1] : 'status-location'}`
    }
    if (resource === 'job' || resource === 'job-photo') {
        return `${resource}:${typeof key[2] === 'string' ? key[2] : 'focused'}`
    }
    if (resource === 'equipment' && key[1] !== 'operational-list') {
        return `${resource}:${typeof key[2] === 'string' ? key[2] : 'focused'}`
    }
    return `${resource}:${typeof key[1] === 'string' ? key[1] : 'collection'}`
}

function estimatePayloadBytes(value: unknown) {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength
    } catch {
        return 0
    }
}

type MutableOperationalQueryMetric = {
    family: string
    requests: number
    cacheHits: number
    deduplicatedRequests: number
    successes: number
    failures: number
    aborted: number
    totalDurationMs: number
    payloadBytes: number
}

type MutableOperationalScreenMetric = {
    screen: OperationalScreenName
    visits: number
    readySamples: number
    totalReadyMs: number
    lastReadyMs: number
    slowestReadyMs: number
}

/**
 * Account/environment-scoped query registry used above route components.
 *
 * It provides one request and one accepted value for each typed query key, protects newer values
 * from stale in-flight requests, and releases unobserved focused data after its configured window.
 */
export class OperationalDataClient {
    private readonly entries = new Map<string, QueryEntry>()
    private readonly metrics = new Map<string, MutableOperationalQueryMetric>()
    private readonly screenMetrics = new Map<OperationalScreenName, MutableOperationalScreenMetric>()
    private readonly diagnosticsListeners = new Set<() => void>()
    private nextRequestId = 0
    readonly scope: string

    constructor(scope: string) {
        this.scope = scope
    }

    private metric(key: OperationalQueryKey) {
        const family = metricFamily(key)
        let metric = this.metrics.get(family)
        if (!metric) {
            metric = {
                family,
                requests: 0,
                cacheHits: 0,
                deduplicatedRequests: 0,
                successes: 0,
                failures: 0,
                aborted: 0,
                totalDurationMs: 0,
                payloadBytes: 0,
            }
            this.metrics.set(family, metric)
        }
        return metric
    }

    /** Privacy-safe, in-memory aggregates for development diagnostics and future monitoring export. */
    getMetricsSnapshot(): OperationalQueryMetric[] {
        return [...this.metrics.values()]
            .map((metric) => ({ ...metric }))
            .sort((left, right) => left.family.localeCompare(right.family))
    }

    getDiagnosticsSnapshot(): OperationalDiagnosticsSnapshot {
        return {
            queries: this.getMetricsSnapshot(),
            screens: [...this.screenMetrics.values()]
                .map((metric) => ({ ...metric }))
                .sort((left, right) => left.screen.localeCompare(right.screen)),
        }
    }

    subscribeDiagnostics(listener: () => void) {
        this.diagnosticsListeners.add(listener)
        return () => {
            this.diagnosticsListeners.delete(listener)
        }
    }

    private notifyDiagnostics() {
        this.diagnosticsListeners.forEach((listener) => listener())
    }

    resetDiagnostics() {
        this.metrics.clear()
        this.screenMetrics.clear()
        this.notifyDiagnostics()
    }

    recordScreenVisit(screen: OperationalScreenName) {
        const metric = this.screenMetrics.get(screen) ?? {
            screen,
            visits: 0,
            readySamples: 0,
            totalReadyMs: 0,
            lastReadyMs: 0,
            slowestReadyMs: 0,
        }
        metric.visits += 1
        this.screenMetrics.set(screen, metric)
        this.notifyDiagnostics()
    }

    recordScreenReady(screen: OperationalScreenName, durationMs: number) {
        const metric = this.screenMetrics.get(screen) ?? {
            screen,
            visits: 1,
            readySamples: 0,
            totalReadyMs: 0,
            lastReadyMs: 0,
            slowestReadyMs: 0,
        }
        const safeDuration = Math.max(0, durationMs)
        metric.readySamples += 1
        metric.totalReadyMs += safeDuration
        metric.lastReadyMs = safeDuration
        metric.slowestReadyMs = Math.max(metric.slowestReadyMs, safeDuration)
        this.screenMetrics.set(screen, metric)
        this.notifyDiagnostics()
    }

    private ensureEntry<T>(key: OperationalQueryKey, options: OperationalQueryOptions = {}) {
        const hash = hashOperationalQueryKey(key)
        let entry = this.entries.get(hash) as QueryEntry<T> | undefined
        if (!entry) {
            entry = {
                key,
                state: INITIAL_QUERY_STATE,
                listeners: new Set(),
                staleTimeMs: options.staleTimeMs ?? DEFAULT_STALE_TIME_MS,
                cacheTimeMs: options.cacheTimeMs ?? DEFAULT_CACHE_TIME_MS,
                generation: 0,
            }
            this.entries.set(hash, entry as QueryEntry)
        } else {
            if (options.staleTimeMs !== undefined) entry.staleTimeMs = options.staleTimeMs
            if (options.cacheTimeMs !== undefined) entry.cacheTimeMs = options.cacheTimeMs
        }
        return entry
    }

    private notify(entry: QueryEntry) {
        entry.listeners.forEach((listener) => listener())
    }

    getState<T>(key: OperationalQueryKey): OperationalQueryState<T> {
        return (this.entries.get(hashOperationalQueryKey(key))?.state as OperationalQueryState<T> | undefined)
            ?? INITIAL_QUERY_STATE
    }

    subscribe(key: OperationalQueryKey, listener: () => void, options: OperationalQueryOptions = {}) {
        const entry = this.ensureEntry(key, options)
        if (entry.evictionTimer) {
            clearTimeout(entry.evictionTimer)
            entry.evictionTimer = undefined
        }
        entry.listeners.add(listener)
        return () => {
            entry.listeners.delete(listener)
            if (entry.listeners.size > 0) return
            if (entry.cacheTimeMs <= 0) {
                this.remove(key)
                return
            }
            entry.evictionTimer = setTimeout(() => {
                if (entry.listeners.size === 0) this.remove(key)
            }, entry.cacheTimeMs)
        }
    }

    async fetchQuery<T>(
        key: OperationalQueryKey,
        loader: OperationalQueryFunction<T>,
        options: OperationalQueryOptions = {},
    ): Promise<T> {
        const entry = this.ensureEntry<T>(key, options)
        entry.loader = loader
        const isFresh = entry.state.data !== undefined
            && entry.state.staleAt !== undefined
            && Date.now() < entry.state.staleAt

        if (!options.forceRefresh && isFresh) {
            this.metric(key).cacheHits += 1
            this.notifyDiagnostics()
            return entry.state.data as T
        }
        if (entry.request) {
            if (!options.forceRefresh || entry.requestKind === 'force') {
                this.metric(key).deduplicatedRequests += 1
                this.notifyDiagnostics()
                return entry.request
            }
            entry.generation += 1
            entry.controller?.abort()
            entry.request = undefined
            entry.requestId = undefined
            entry.requestKind = undefined
            entry.controller = undefined
        }

        const generation = entry.generation
        const requestId = ++this.nextRequestId
        const startedAt = performance.now()
        const metric = this.metric(key)
        metric.requests += 1
        this.notifyDiagnostics()
        const controller = new AbortController()
        const hasData = entry.state.data !== undefined
        entry.state = {
            ...entry.state,
            status: hasData ? 'refreshing' : 'loading',
            error: undefined,
        }
        this.notify(entry as QueryEntry)

        const request = loader({ signal: controller.signal })
            .then((data) => {
                const current = this.entries.get(hashOperationalQueryKey(key)) as QueryEntry<T> | undefined
                if (!current || current.generation !== generation || current.requestId !== requestId) {
                    if (current?.request) return current.request
                    if (current?.state.data !== undefined) return current.state.data
                    return data
                }
                const fetchedAt = Date.now()
                current.state = {
                    status: 'fresh',
                    data,
                    fetchedAt,
                    staleAt: fetchedAt + current.staleTimeMs,
                }
                metric.successes += 1
                metric.totalDurationMs += Math.max(0, performance.now() - startedAt)
                metric.payloadBytes += estimatePayloadBytes(data)
                this.notifyDiagnostics()
                this.notify(current as QueryEntry)
                return data
            })
            .catch((error: unknown) => {
                metric.totalDurationMs += Math.max(0, performance.now() - startedAt)
                if (isAbortError(error)) metric.aborted += 1
                else metric.failures += 1
                this.notifyDiagnostics()
                const current = this.entries.get(hashOperationalQueryKey(key)) as QueryEntry<T> | undefined
                if (current && current.generation === generation && current.requestId === requestId && !isAbortError(error)) {
                    current.state = {
                        ...current.state,
                        status: current.state.data === undefined ? 'error' : 'stale',
                        error: error instanceof Error ? error : new Error('Operational data could not be loaded.'),
                    }
                    this.notify(current as QueryEntry)
                }
                throw error
            })
            .finally(() => {
                const current = this.entries.get(hashOperationalQueryKey(key)) as QueryEntry<T> | undefined
                if (current?.requestId !== requestId) return
                current.request = undefined
                current.requestId = undefined
                current.requestKind = undefined
                current.controller = undefined
            })

        entry.request = request
        entry.requestId = requestId
        entry.requestKind = options.forceRefresh ? 'force' : 'normal'
        entry.controller = controller
        return request
    }

    prefetchQuery<T>(key: OperationalQueryKey, loader: OperationalQueryFunction<T>, options: OperationalQueryOptions = {}) {
        return this.fetchQuery(key, loader, options)
    }

    setQueryData<T>(key: OperationalQueryKey, data: T, options: OperationalQueryOptions = {}) {
        const entry = this.ensureEntry<T>(key, options)
        entry.generation += 1
        entry.controller?.abort()
        const fetchedAt = Date.now()
        entry.state = {
            status: 'fresh',
            data,
            fetchedAt,
            staleAt: fetchedAt + entry.staleTimeMs,
        }
        entry.request = undefined
        entry.requestId = undefined
        entry.requestKind = undefined
        entry.controller = undefined
        this.notify(entry as QueryEntry)
    }

    updateQueryData<T>(
        key: OperationalQueryKey,
        updater: OperationalQueryUpdater<T>,
        options: OperationalQueryOptions = {},
    ) {
        const current = this.getState<T>(key).data
        const next = typeof updater === 'function'
            ? (updater as (value: T | undefined) => T)(current)
            : updater
        this.setQueryData(key, next, options)
        return next
    }

    invalidate(predicate: (key: OperationalQueryKey) => boolean) {
        this.entries.forEach((entry) => {
            if (!predicate(entry.key)) return
            entry.generation += 1
            entry.controller?.abort()
            entry.request = undefined
            entry.requestId = undefined
            entry.requestKind = undefined
            entry.controller = undefined
            entry.state = entry.state.data === undefined
                ? INITIAL_QUERY_STATE
                : { ...entry.state, status: 'stale', staleAt: 0 }
            this.notify(entry)
            if (entry.listeners.size > 0 && entry.loader) {
                void this.fetchQuery(entry.key, entry.loader, { forceRefresh: true }).catch(() => undefined)
            }
        })
    }

    remove(key: OperationalQueryKey) {
        const hash = hashOperationalQueryKey(key)
        const entry = this.entries.get(hash)
        if (!entry) return
        entry.generation += 1
        entry.controller?.abort()
        if (entry.evictionTimer) clearTimeout(entry.evictionTimer)
        this.entries.delete(hash)
    }

    dispose() {
        this.entries.forEach((entry) => {
            entry.controller?.abort()
            if (entry.evictionTimer) clearTimeout(entry.evictionTimer)
        })
        this.entries.clear()
        this.diagnosticsListeners.clear()
    }
}

const activeOperationalDataClients = new Set<OperationalDataClient>()

export function registerOperationalDataClient(client: OperationalDataClient) {
    activeOperationalDataClients.add(client)
    return () => activeOperationalDataClients.delete(client)
}

export function invalidateOperationalQueries(predicate: (key: OperationalQueryKey) => boolean) {
    activeOperationalDataClients.forEach((client) => client.invalidate(predicate))
}
