import { useCallback, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import {
    createPricingItem as createPricingItemApi,
    deletePricingItem as deletePricingItemApi,
    fetchPricingItems as fetchPricingItemsApi,
    setPricingItemActive as setPricingItemActiveApi,
    updatePricingItem as updatePricingItemApi,
} from '../services/pricingApi'
import type { PricingItem, PricingItemInput } from '../types/pricing.types'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { useOperationalQuery } from '../../shared/data/useOperationalQuery'
import { PRICING_CATALOGUE_QUERY_KEY } from '../../shared/data/operationalCollectionKeys'

const QUERY_STALE_TIME_MS = 20_000
const QUERY_CACHE_TIME_MS = 5 * 60_000

export function usePricingItems() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [saveError, setSaveError] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const getAccessToken = useCallback(async () => {
        return acquireDataverseAccessToken(instance, account)
    }, [account, instance])

    const catalogueQuery = useOperationalQuery<PricingItem[]>({
        key: PRICING_CATALOGUE_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchPricingItemsApi(await getAccessToken(), signal),
    })

    const runMutation = async (mutation: (token: string) => Promise<void>) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getAccessToken()
            await mutation(token)
            await catalogueQuery.refetch()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The pricing item could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    return {
        items: catalogueQuery.data ?? [],
        isLoading: catalogueQuery.data === undefined
            && (catalogueQuery.status === 'initial' || catalogueQuery.status === 'loading'),
        isSaving,
        loadError: catalogueQuery.data === undefined ? catalogueQuery.error?.message ?? '' : '',
        saveError,
        reload: catalogueQuery.refetch,
        clearSaveError: () => setSaveError(''),
        createItem: (item: PricingItemInput) => runMutation(
            (token) => createPricingItemApi(token, item),
        ),
        updateItem: (itemId: string, item: PricingItemInput) => runMutation(
            (token) => updatePricingItemApi(token, itemId, item),
        ),
        setItemActive: (itemId: string, active: boolean) => runMutation(
            (token) => setPricingItemActiveApi(token, itemId, active),
        ),
        deleteItem: (itemId: string) => runMutation(
            (token) => deletePricingItemApi(token, itemId),
        ),
    }
}
