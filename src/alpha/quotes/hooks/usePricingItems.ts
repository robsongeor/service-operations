import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import {
    createPricingItem as createPricingItemApi,
    fetchPricingItems as fetchPricingItemsApi,
    setPricingItemActive as setPricingItemActiveApi,
    updatePricingItem as updatePricingItemApi,
} from '../services/pricingApi'
import type { PricingItem, PricingItemInput } from '../types/pricing.types'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'

export function usePricingItems() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [items, setItems] = useState<PricingItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [saveError, setSaveError] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const getAccessToken = useCallback(async () => {
        return acquireDataverseAccessToken(instance, account)
    }, [account, instance])

    const loadItems = useCallback(async () => {
        if (!account) return

        setIsLoading(true)
        setLoadError('')
        try {
            const token = await getAccessToken()
            setItems(await fetchPricingItemsApi(token))
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Pricing items could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [account, getAccessToken])

    useEffect(() => {
        if (!account) return

        let cancelled = false

        const loadInitialItems = async () => {
            setIsLoading(true)
            setLoadError('')
            try {
                const token = await getAccessToken()
                const initialItems = await fetchPricingItemsApi(token)
                if (!cancelled) setItems(initialItems)
            } catch (error) {
                if (!cancelled) {
                    setLoadError(error instanceof Error
                        ? error.message
                        : 'Pricing items could not be loaded.')
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        void loadInitialItems()

        return () => {
            cancelled = true
        }
    }, [account, getAccessToken])

    const runMutation = async (mutation: (token: string) => Promise<void>) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getAccessToken()
            await mutation(token)
            await loadItems()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The pricing item could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    return {
        items,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload: loadItems,
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
    }
}
