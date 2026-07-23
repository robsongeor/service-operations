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

export function usePricingItems() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [items, setItems] = useState<PricingItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [saveError, setSaveError] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const getAccessToken = useCallback(async () => {
        if (!account) throw new Error('No active Microsoft account is available. Sign in again and retry.')
        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account,
        })
        return response.accessToken
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
