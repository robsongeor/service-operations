import type { Site } from '../types/site.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchSites(accessToken: string): Promise<Site[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_sites?$select=gr_siteid,gr_name,gr_address&$expand=gr_Customer($select=gr_name)`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
    )

    const data = await result.json()
    return data.value ?? []
}

export async function createSite(
    accessToken: string,
    site: {
        customerId: string
        name: string
        address?: string
    },
): Promise<string> {
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_sites`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({
            gr_name: site.name,
            gr_address: site.address,
            'gr_Customer@odata.bind':
                `/gr_customers(${site.customerId})`,
        }),
    })

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }

    const data = await result.json()
    return data.gr_siteid
}
