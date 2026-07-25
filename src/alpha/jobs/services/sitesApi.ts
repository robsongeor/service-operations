import type { Site, SiteUpdateInput } from '../types/site.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

async function dataverseErrorMessage(response: Response, fallback: string) {
    const responseText = await response.text()
    if (!responseText) return fallback
    try {
        const parsed = JSON.parse(responseText)
        return parsed.error?.message || fallback
    } catch {
        return fallback
    }
}

export async function fetchSites(accessToken: string): Promise<Site[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_sites?$select=gr_siteid,gr_name,gr_address,gr_defaultmaintenanceprofile&$expand=gr_Customer($select=gr_customerid,gr_name)`,
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
    const customerId = site.customerId.trim()
    const name = site.name.trim()
    if (!customerId) throw new Error('A customer must be selected before creating a site.')
    if (!name) throw new Error('Enter a Site name before saving.')

    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_sites`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({
            gr_name: name,
            gr_address: site.address?.trim() || null,
            'gr_Customer@odata.bind':
                `/gr_customers(${customerId})`,
        }),
    })

    if (!result.ok) {
        throw new Error(await dataverseErrorMessage(result, 'The Site could not be created.'))
    }

    const responseText = await result.text()
    if (responseText) {
        try {
            const data = JSON.parse(responseText)
            if (typeof data.gr_siteid === 'string' && data.gr_siteid) return data.gr_siteid
        } catch {
            // Some Dataverse configurations return only the entity ID header.
        }
    }
    const entityId = result.headers.get('OData-EntityId') ?? result.headers.get('odata-entityid')
    const headerId = entityId?.match(/\(([^)]+)\)/)?.[1]
    if (headerId) return headerId
    throw new Error('The Site was created, but Dataverse did not return its record ID.')
}

export async function updateSite(
    accessToken: string,
    siteId: string,
    site: SiteUpdateInput,
): Promise<void> {
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_sites(${siteId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            gr_name: site.name.trim(),
            gr_address: site.address.trim() || null,
            ...(site.defaultMaintenanceProfile !== undefined
                ? { gr_defaultmaintenanceprofile: site.defaultMaintenanceProfile }
                : {}),
        }),
    })

    if (!result.ok) {
        throw new Error(await dataverseErrorMessage(result, 'The Site could not be updated.'))
    }
}
