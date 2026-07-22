import { QUOTE_STATUS_OPTIONS, type QuoteStatus } from './quote.types'

export const QUOTES_VIEW_STATE_KEY_PREFIX = 'service-operations.quotes-view-state.v1'

export type QuotesViewTab = 'all' | 'mine'
export type QuotesDateSortDirection = 'ascending' | 'descending'

export type QuotesViewState = {
    tab: QuotesViewTab
    status: QuoteStatus | 'all'
    dateSort: QuotesDateSortDirection
}

export const DEFAULT_QUOTES_VIEW_STATE: QuotesViewState = {
    tab: 'all',
    status: 'all',
    dateSort: 'descending',
}

const validStatuses = new Set<number>(QUOTE_STATUS_OPTIONS.map((status) => status.value))

export function getQuotesViewStateKey(storageId: string) {
    return `${QUOTES_VIEW_STATE_KEY_PREFIX}.${storageId}`
}

export function restoreQuotesViewState(storageKey: string): QuotesViewState {
    try {
        const raw = sessionStorage.getItem(storageKey)
        if (!raw) return DEFAULT_QUOTES_VIEW_STATE
        const value = JSON.parse(raw) as Partial<QuotesViewState> | null
        if (!value || typeof value !== 'object') return DEFAULT_QUOTES_VIEW_STATE
        return {
            tab: value.tab === 'mine' ? 'mine' : 'all',
            status: value.status === 'all' || (typeof value.status === 'number' && validStatuses.has(value.status)) ? value.status : 'all',
            dateSort: value.dateSort === 'ascending' ? 'ascending' : 'descending',
        }
    } catch {
        return DEFAULT_QUOTES_VIEW_STATE
    }
}
