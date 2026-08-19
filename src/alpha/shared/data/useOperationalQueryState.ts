import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type {
    OperationalQueryKey,
    OperationalQueryOptions,
} from './OperationalDataClient'
import { useOperationalDataClient } from './OperationalDataClientContext'

/**
 * Subscribes to an app-shell query value whose loading is still orchestrated by an existing
 * feature service. This is the migration bridge for established cache/network workflows: the
 * client owns the accepted value while the feature continues to own its business side effects.
 */
export function useOperationalQueryState<T>(
    key: OperationalQueryKey,
    fallback: T,
    options: OperationalQueryOptions = {},
) {
    const client = useOperationalDataClient()
    const stableOptions = useMemo(
        () => ({ staleTimeMs: options.staleTimeMs, cacheTimeMs: options.cacheTimeMs }),
        [options.cacheTimeMs, options.staleTimeMs],
    )
    const subscribe = useCallback(
        (onStoreChange: () => void) => client.subscribe(key, onStoreChange, stableOptions),
        [client, key, stableOptions],
    )
    const getSnapshot = useCallback(() => client.getState<T>(key), [client, key])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const setData = useCallback((updater: T | ((current: T) => T)) => (
        client.updateQueryData<T>(key, (current) => (
            typeof updater === 'function'
                ? (updater as (value: T) => T)(current ?? fallback)
                : updater
        ), stableOptions)
    ), [client, fallback, key, stableOptions])

    return {
        ...state,
        data: state.data ?? fallback,
        hasData: state.data !== undefined,
        setData,
    }
}
