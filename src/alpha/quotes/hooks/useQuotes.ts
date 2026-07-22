import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { fetchCustomers } from '../../jobs/services/customersApi'
import { fetchEquipment } from '../../jobs/services/equipmentApi'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import { fetchPricingItems } from '../services/pricingApi'
import {
    createQuote as createQuoteApi,
    fetchQuoteJobs,
    fetchQuoteLines,
    fetchQuotes,
    updateQuote as updateQuoteApi,
} from '../services/quotesApi'
import type { PricingItem } from '../types/pricing.types'
import type { Quote, QuoteInput, QuoteJob, QuoteLine } from '../types/quote.types'

export function useQuotes() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [quotes, setQuotes] = useState<Quote[]>([])
    const [jobs, setJobs] = useState<QuoteJob[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [equipment, setEquipment] = useState<Equipment[]>([])
    const [pricingItems, setPricingItems] = useState<PricingItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const getAccessToken = useCallback(async () => {
        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account: account ?? undefined,
        })
        return response.accessToken
    }, [account, instance])

    const load = useCallback(async () => {
        if (!account) return
        setIsLoading(true)
        setLoadError('')
        try {
            const token = await getAccessToken()
            const [nextQuotes, nextJobs, nextPricingItems, nextCustomers, nextEquipment] = await Promise.all([
                fetchQuotes(token),
                fetchQuoteJobs(token),
                fetchPricingItems(token),
                fetchCustomers(token),
                fetchEquipment(token),
            ])
            setQuotes(nextQuotes)
            setJobs(nextJobs)
            setPricingItems(nextPricingItems.filter((item) => item.statecode === 0))
            setCustomers(nextCustomers)
            setEquipment(nextEquipment.filter((item) => item.statecode !== 1))
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Quotes could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [account, getAccessToken])

    useEffect(() => {
        if (!account) return
        let cancelled = false
        const loadInitialData = async () => {
            setIsLoading(true)
            setLoadError('')
            try {
                const token = await getAccessToken()
                const [nextQuotes, nextJobs, nextPricingItems, nextCustomers, nextEquipment] = await Promise.all([
                    fetchQuotes(token),
                    fetchQuoteJobs(token),
                    fetchPricingItems(token),
                    fetchCustomers(token),
                    fetchEquipment(token),
                ])
                if (cancelled) return
                setQuotes(nextQuotes)
                setJobs(nextJobs)
                setPricingItems(nextPricingItems.filter((item) => item.statecode === 0))
                setCustomers(nextCustomers)
                setEquipment(nextEquipment.filter((item) => item.statecode !== 1))
            } catch (error) {
                if (!cancelled) {
                    setLoadError(error instanceof Error ? error.message : 'Quotes could not be loaded.')
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        void loadInitialData()
        return () => { cancelled = true }
    }, [account, getAccessToken])

    const loadLines = async (quoteId: string) => {
        const token = await getAccessToken()
        return fetchQuoteLines(token, quoteId)
    }

    const save = async (quote: QuoteInput, existing?: Quote, previousLines: QuoteLine[] = []) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getAccessToken()
            if (existing) {
                await updateQuoteApi(token, existing.gr_quoteid, previousLines, quote)
            } else {
                await createQuoteApi(token, quote)
            }
            await load()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The quote could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    return {
        quotes,
        jobs,
        customers,
        equipment,
        pricingItems,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload: load,
        loadLines,
        save,
        clearSaveError: () => setSaveError(''),
    }
}
