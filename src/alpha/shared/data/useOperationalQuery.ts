import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
    type OperationalQueryFunction,
    type OperationalQueryKey,
    type OperationalQueryOptions,
} from './OperationalDataClient'
import { useOperationalDataClient } from './OperationalDataClientContext'

type UseOperationalQueryOptions<T> = OperationalQueryOptions & Readonly<{
    key: OperationalQueryKey
    enabled?: boolean
    queryFn: OperationalQueryFunction<T>
}>

export function useOperationalQuery<T>({
    key,
    enabled = true,
    queryFn,
    staleTimeMs,
    cacheTimeMs,
}: UseOperationalQueryOptions<T>) {
    const client = useOperationalDataClient()
    const queryFnRef = useRef(queryFn)
    const options = useMemo(() => ({ staleTimeMs, cacheTimeMs }), [cacheTimeMs, staleTimeMs])

    useEffect(() => {
        queryFnRef.current = queryFn
    }, [queryFn])

    const subscribe = useCallback((onStoreChange: () => void) => {
        if (!enabled) return () => undefined
        return client.subscribe(key, onStoreChange, options)
    }, [client, enabled, key, options])
    const getSnapshot = useCallback(() => client.getState<T>(key), [client, key])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    useEffect(() => {
        if (!enabled) return
        void client.fetchQuery(key, (context) => queryFnRef.current(context), options).catch(() => undefined)
    }, [client, enabled, key, options])

    const refetch = useCallback(() => client.fetchQuery(
        key,
        (context) => queryFnRef.current(context),
        { ...options, forceRefresh: true },
    ), [client, key, options])

    return { ...state, refetch }
}
