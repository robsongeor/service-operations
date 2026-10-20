import type { Customer, CustomerSaveInput } from '../types/customer.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { buildCustomerSearchUrl } from './jobRelationshipLookupUrls'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const CUSTOMER_SELECT = 'gr_customerid,gr_name,gr_accountscontact,gr_accountsphone,gr_accountsemail,gr_purchaseorderrequirements,gr_customernotes'

function customerPayload(customer: CustomerSaveInput) {
    const limits: Array<[keyof CustomerSaveInput, number, string]> = [
        ['name', 200, 'Customer name'],
        ['accountsContact', 200, 'Accounts contact'],
        ['accountsPhone', 100, 'Accounts phone'],
        ['accountsEmail', 320, 'Accounts email'],
        ['purchaseOrderRequirements', 4000, 'Purchase order requirements'],
        ['notes', 10000, 'Customer notes'],
    ]
    for (const [key, maximum, label] of limits) {
        if ((customer[key]?.trim().length ?? 0) > maximum) throw new Error(`${label} must be ${maximum.toLocaleString()} characters or fewer.`)
    }
    const payload: Record<string, string | null> = {
        gr_name: customer.name.trim(),
    }
    if (Object.hasOwn(customer, 'accountsContact')) payload.gr_accountscontact = customer.accountsContact?.trim() || null
    if (Object.hasOwn(customer, 'accountsPhone')) payload.gr_accountsphone = customer.accountsPhone?.trim() || null
    if (Object.hasOwn(customer, 'accountsEmail')) payload.gr_accountsemail = customer.accountsEmail?.trim() || null
    if (Object.hasOwn(customer, 'purchaseOrderRequirements')) payload.gr_purchaseorderrequirements = customer.purchaseOrderRequirements?.trim() || null
    if (Object.hasOwn(customer, 'notes')) payload.gr_customernotes = customer.notes?.trim() || null
    return payload
}

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
        `${DATAVERSE_URL}/api/data/v9.2/gr_customers?$select=${CUSTOMER_SELECT}&$orderby=gr_name`,
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
    customer: CustomerSaveInput,
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
            body: JSON.stringify(customerPayload(customer)),
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(`Failed to create customer: ${error}`)
    }

    const data = await result.json()
    return data.gr_customerid
}

export async function updateCustomer(
    accessToken: string,
    customerId: string,
    customer: CustomerSaveInput,
): Promise<Customer> {
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_customers(${customerId})?$select=${CUSTOMER_SELECT}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify(customerPayload(customer)),
    })
    if (!result.ok) {
        const error = await result.text()
        throw new Error(`Failed to update customer: ${error}`)
    }
    return result.json() as Promise<Customer>
}
