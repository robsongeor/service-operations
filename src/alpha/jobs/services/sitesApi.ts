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