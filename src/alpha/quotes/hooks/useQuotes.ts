import { useCallback, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import { fetchMechanics } from '../../mechanics/services/mechanicsApi'
import { useOperationalDataClient } from '../../shared/data/OperationalDataClientContext'
import { useOperationalQuery } from '../../shared/data/useOperationalQuery'
import { publishLocalOperationalInvalidation } from '../../shared/realtime/operationalCrossTabInvalidation'
import {
    focusedQuoteQueryKey,
    PRICING_CATALOGUE_QUERY_KEY,
    QUOTES_REGISTER_QUERY_KEY,
    STAFF_DIRECTORY_QUERY_KEY,
} from '../../shared/data/operationalCollectionKeys'
import { fetchPricingItems } from '../services/pricingApi'
import {
    createQuote as createQuoteApi,
    deleteQuote as deleteQuoteApi,
    fetchQuoteById,
    fetchQuoteCustomerById,
    fetchQuoteEquipmentById,
    fetchQuoteJobById,
    fetchQuoteLines,
    fetchQuotes,
    searchQuoteCustomers,
    searchQuoteEquipment,
    searchQuoteJobs,
    updateQuote as updateQuoteApi,
} from '../services/quotesApi'
import type { PricingItem } from '../types/pricing.types'
import type { Quote, QuoteInput, QuoteJob, QuoteLine } from '../types/quote.types'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'

type UseQuotesOptions = {
    loadRegister?: boolean
    loadEditorSupport?: boolean
    quoteId?: string
}

const DISABLED_QUOTE_QUERY_KEY = ['quote', 'disabled', 'core-v1'] as const
const QUERY_STALE_TIME_MS = 20_000
const QUERY_CACHE_TIME_MS = 5 * 60_000

function isInitialLoad(status: string, hasData: boolean) {
    return !hasData && (status === 'initial' || status === 'loading')
}

function mergeQuote(register: Quote[] | undefined, quote: Quote) {
    const next = [quote, ...(register ?? []).filter((candidate) => candidate.gr_quoteid !== quote.gr_quoteid)]
    return next.sort((left, right) => right.createdon.localeCompare(left.createdon))
}

export function useQuotes({
    loadRegister = true,
    loadEditorSupport = true,
    quoteId,
}: UseQuotesOptions = {}) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const client = useOperationalDataClient()
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const getAccessToken = useCallback(async () => {
        return acquireDataverseAccessToken(instance, account)
    }, [account, instance])

    const registerQuery = useOperationalQuery<Quote[]>({
        key: QUOTES_REGISTER_QUERY_KEY,
        enabled: Boolean(account) && loadRegister,
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchQuotes(await getAccessToken(), signal),
    })

    const pricingQuery = useOperationalQuery<PricingItem[]>({
        key: PRICING_CATALOGUE_QUERY_KEY,
        enabled: Boolean(account) && loadEditorSupport,
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchPricingItems(await getAccessToken(), signal),
    })
    const staffQuery = useOperationalQuery<Mechanic[]>({
        key: STAFF_DIRECTORY_QUERY_KEY,
        enabled: Boolean(account) && loadEditorSupport,
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchMechanics(await getAccessToken(), signal),
    })

    const normalizedQuoteId = quoteId?.trim().toLowerCase() ?? ''
    const focusedKey = useMemo(
        () => normalizedQuoteId ? focusedQuoteQueryKey(normalizedQuoteId) : DISABLED_QUOTE_QUERY_KEY,
        [normalizedQuoteId],
    )
    const focusedQuoteQuery = useOperationalQuery<Quote | undefined>({
        key: focusedKey,
        enabled: Boolean(account) && Boolean(normalizedQuoteId),
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchQuoteById(await getAccessToken(), normalizedQuoteId, signal),
    })

    const loadLines = useCallback(async (targetQuoteId: string, signal?: AbortSignal) => {
        const token = await getAccessToken()
        return fetchQuoteLines(token, targetQuoteId, signal)
    }, [getAccessToken])

    const loadJob = useCallback(async (jobId: string, signal?: AbortSignal) =>
        fetchQuoteJobById(await getAccessToken(), jobId, signal), [getAccessToken])
    const findJobs = useCallback(async (query: string, signal?: AbortSignal) =>
        searchQuoteJobs(await getAccessToken(), query, signal), [getAccessToken])
    const loadCustomer = useCallback(async (customerId: string, signal?: AbortSignal) =>
        fetchQuoteCustomerById(await getAccessToken(), customerId, signal), [getAccessToken])
    const findCustomers = useCallback(async (query: string, signal?: AbortSignal) =>
        searchQuoteCustomers(await getAccessToken(), query, signal), [getAccessToken])
    const loadEquipment = useCallback(async (equipmentId: string, signal?: AbortSignal) =>
        fetchQuoteEquipmentById(await getAccessToken(), equipmentId, signal), [getAccessToken])
    const findEquipment = useCallback(async (query: string, signal?: AbortSignal) =>
        searchQuoteEquipment(await getAccessToken(), query, signal), [getAccessToken])

    const save = async (quote: QuoteInput, existing?: Quote, previousLines: QuoteLine[] = []) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getAccessToken()
            let savedQuoteId = existing?.gr_quoteid
            if (existing) {
                await updateQuoteApi(token, existing.gr_quoteid, previousLines, quote)
            } else {
                savedQuoteId = await createQuoteApi(token, quote)
            }
            if (!savedQuoteId) throw new Error('The saved Quote identity was not returned by Dataverse.')
            const [savedQuote, nextLines] = await Promise.all([
                fetchQuoteById(token, savedQuoteId),
                fetchQuoteLines(token, savedQuoteId),
            ])
            if (!savedQuote) throw new Error('The Quote was saved but could not be refreshed. Reload Quotes and try again.')
            if (client.getState<Quote[]>(QUOTES_REGISTER_QUERY_KEY).data) {
                client.updateQueryData<Quote[]>(QUOTES_REGISTER_QUERY_KEY, (current) => mergeQuote(current, savedQuote), {
                    staleTimeMs: QUERY_STALE_TIME_MS,
                    cacheTimeMs: QUERY_CACHE_TIME_MS,
                })
            }
            client.setQueryData(focusedQuoteQueryKey(savedQuoteId), savedQuote, {
                staleTimeMs: QUERY_STALE_TIME_MS,
                cacheTimeMs: QUERY_CACHE_TIME_MS,
            })
            publishLocalOperationalInvalidation('quotes')
            return { quote: savedQuote, lines: nextLines }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The quote could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const deleteQuote = async (targetQuoteId: string, lines: QuoteLine[]) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getAccessToken()
            await deleteQuoteApi(token, targetQuoteId, lines.map((line) => line.gr_quotelineid))
            if (client.getState<Quote[]>(QUOTES_REGISTER_QUERY_KEY).data) {
                client.updateQueryData<Quote[]>(QUOTES_REGISTER_QUERY_KEY, (current) =>
                    (current ?? []).filter((quote) => quote.gr_quoteid !== targetQuoteId), {
                    staleTimeMs: QUERY_STALE_TIME_MS,
                    cacheTimeMs: QUERY_CACHE_TIME_MS,
                })
            }
            client.remove(focusedQuoteQueryKey(targetQuoteId))
            publishLocalOperationalInvalidation('quotes')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The quote could not be deleted.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const registerHasData = registerQuery.data !== undefined
    const pricingHasData = pricingQuery.data !== undefined
    const focusedHasResolved = focusedQuoteQuery.data !== undefined || focusedQuoteQuery.status === 'fresh'
    const isLoading = loadRegister
        ? isInitialLoad(registerQuery.status, registerHasData)
        : Boolean(normalizedQuoteId) && isInitialLoad(focusedQuoteQuery.status, focusedHasResolved)
    const isEditorLoading = (loadEditorSupport && isInitialLoad(pricingQuery.status, pricingHasData))
        || (Boolean(normalizedQuoteId) && isInitialLoad(focusedQuoteQuery.status, focusedHasResolved))

    return {
        quotes: registerQuery.data ?? [],
        focusedQuote: focusedQuoteQuery.data,
        jobs: [] as QuoteJob[],
        customers: [],
        equipment: [],
        pricingItems: (pricingQuery.data ?? []).filter((item) => item.statecode === 0),
        staff: staffQuery.data ?? [],
        staffLoading: loadEditorSupport && isInitialLoad(staffQuery.status, staffQuery.data !== undefined),
        staffError: staffQuery.data === undefined ? staffQuery.error?.message ?? '' : '',
        retryStaff: staffQuery.refetch,
        isLoading,
        isEditorLoading,
        isSaving,
        loadError: registerQuery.error?.message ?? focusedQuoteQuery.error?.message ?? '',
        editorLoadError: pricingQuery.error?.message ?? focusedQuoteQuery.error?.message ?? '',
        saveError,
        reload: loadRegister ? registerQuery.refetch : focusedQuoteQuery.refetch,
        loadLines,
        loadJob,
        findJobs,
        loadCustomer,
        findCustomers,
        loadEquipment,
        findEquipment,
        save,
        deleteQuote,
        clearSaveError: () => setSaveError(''),
    }
}
