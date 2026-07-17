import type { Customer } from '../types/customer.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchCustomers(
    accessToken: string,
): Promise<Customer[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_customers?$select=gr_customerid,gr_name&$orderby=gr_name`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(`Failed to fetch customers: ${error}`)
    }

    const data = await result.json()
    return data.value ?? []
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
