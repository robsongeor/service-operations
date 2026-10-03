import type { Customer } from '../types/customer.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { buildCustomerSearchUrl } from './jobRelationshipLookupUrls'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

// Exact, bounded duplicate check; do not use the eight-result substring picker for creation.
export async function findCustomersByName(accessToken: string, name: string): Promise<Customer[]> {
    const query = new URLSearchParams({
        '$select': 'gr_customerid,gr_name',
        '$filter': `gr_name eq '${name.trim().replaceAll("'", "''")}'`,
        '$top': '2',
    })
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_customers?${query}`, {
        cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!result.ok) throw new Error('Existing Customers could not be checked. No new Customer was created.')
    const body = await result.json() as { value?: Customer[] }
    if (!Array.isArray(body.value)) throw new Error('Existing Customers could not be checked. No new Customer was created.')
    return body.value
}

export async function fetchCustomers(
    accessToken: string,
): Promise<Customer[]> {
    return fetchAllDataversePages<Customer>(
        `${DATAVERSE_URL}/api/data/v9.2/gr_customers?$select=gr_customerid,gr_name&$orderby=gr_name`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
        async (result) => {
            if (result.ok) return
            const error = await result.text()
            throw new Error(`Failed to fetch customers: ${error}`)
        },
    )
}

export async function searchCustomers(
    accessToken: string,
    query: string,
    signal?: AbortSignal,
): Promise<Customer[]> {
    const result = await fetch(
        buildCustomerSearchUrl(DATAVERSE_URL, query),
        {
            cache: 'no-store',
            signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
            },
        },
    )
    if (!result.ok) {
        const error = await result.text()
        throw new Error(`Customer search failed: ${error || `${result.status} ${result.statusText}`}`)
    }
    return ((await result.json()) as { value?: Customer[] }).value ?? []
}

export async function createCustomer(
    accessToken: string,
    customer: {
        name: string
    },
): Promise<string> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_customers`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify({
                gr_name: customer.name,
            }),
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(`Failed to create customer: ${error}`)
    }

    const data = await result.json()
    return data.gr_customerid
}
