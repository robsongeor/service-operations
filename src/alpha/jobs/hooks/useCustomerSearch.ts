import { useEffect, useMemo, useState } from 'react'
import type { Customer } from '../types/customer.types'

export type SearchCustomers = (query: string, signal?: AbortSignal) => Promise<Customer[]>
export const CUSTOMER_SEARCH_LIMIT = 8
export const CUSTOMER_SEARCH_MIN_LENGTH = 2
const normalize = (value: string) => value.trim().toLocaleLowerCase('en-NZ')

// One bounded result contract for the canonical Job editor and Job Book Intake.
export function customerSearchResults(query: string, local: readonly Customer[], remote: readonly Customer[] = []) {
    const search = normalize(query)
    const matches = new Map<string, Customer>()
    for (const source of [remote, local]) {
        for (const customer of source) {
            const id = customer.gr_customerid.toLowerCase()
            if (!matches.has(id) && normalize(customer.gr_name).includes(search)) matches.set(id, customer)
            if (matches.size === CUSTOMER_SEARCH_LIMIT) return [...matches.values()]
        }
    }
    return [...matches.values()]
}

type SearchState = {
    query: string
    search: SearchCustomers
    attempt: number
    rows: Customer[]
    status: 'loading' | 'idle' | 'error'
}

export function scheduleCustomerSearch(query: string, open: boolean, search: SearchCustomers | undefined,
    onResult: (result: Pick<SearchState, 'rows' | 'status'>) => void) {
    const normalizedQuery = normalize(query)
    if (!open || normalizedQuery.length < CUSTOMER_SEARCH_MIN_LENGTH || !search) return () => undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
        onResult({ rows: [], status: 'loading' })
        void Promise.resolve().then(() => search(normalizedQuery, controller.signal)).then((rows) => {
            if (!controller.signal.aborted) onResult({ rows: rows.slice(0, CUSTOMER_SEARCH_LIMIT), status: 'idle' })
        }).catch(() => {
            if (!controller.signal.aborted) onResult({ rows: [], status: 'error' })
        })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
}

export function useCustomerSearch({ query, open, customers, onSearchCustomers }: {
    query: string
    open: boolean
    customers: readonly Customer[]
    onSearchCustomers?: SearchCustomers
}) {
    const [state, setState] = useState<SearchState>()
    const [attempt, setAttempt] = useState(0)
    const normalizedQuery = normalize(query)
    const remoteEnabled = open && normalizedQuery.length >= CUSTOMER_SEARCH_MIN_LENGTH && Boolean(onSearchCustomers)
    const current = state?.query === normalizedQuery && state?.search === onSearchCustomers && state?.attempt === attempt

    useEffect(() => {
        if (!remoteEnabled || !onSearchCustomers) return
        const request = { query: normalizedQuery, search: onSearchCustomers, attempt }
        return scheduleCustomerSearch(normalizedQuery, true, onSearchCustomers, (result) => setState({ ...request, ...result }))
    }, [attempt, normalizedQuery, onSearchCustomers, remoteEnabled])

    const results = useMemo(() => customerSearchResults(query, customers, remoteEnabled && current ? state?.rows : []), [query, customers, remoteEnabled, current, state])
    const status = remoteEnabled ? current && state ? state.status : 'loading' : 'idle'
    return { results, status, retry: () => setAttempt((value) => value + 1),
        emptyLabel: normalizedQuery.length < CUSTOMER_SEARCH_MIN_LENGTH ? 'Type at least 2 characters to search customers' : 'No customers found' }
}
