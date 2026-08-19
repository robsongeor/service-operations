import type { Site, SiteUpdateInput } from '../types/site.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { invalidateOperationalQueries } from '../../shared/data/OperationalDataClient.ts'

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
    return fetchAllDataversePages<Site>(
        `${DATAVERSE_URL}/api/data/v9.2/gr_sites?$select=gr_siteid,gr_name,gr_address,gr_defaultmaintenanceprofile,gr_inductionrequired,gr_inductionrequirements,gr_geocodelatitude,gr_geocodelongitude,gr_geocodesourceaddress,gr_geocodeformattedaddress,gr_geocoderesolvedon,_gr_customer_value&$expand=gr_Customer($select=gr_customerid,gr_name)`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
        async (result) => {
            if (!result.ok) throw new Error(await dataverseErrorMessage(result, 'Failed to fetch Sites.'))
        },
    )
}

export async function fetchCustomerSites(accessToken: string, customerId: string, signal?: AbortSignal): Promise<Site[]> {
    return fetchAllDataversePages<Site>(
        `${DATAVERSE_URL}/api/data/v9.2/gr_sites?$select=gr_siteid,gr_name,gr_address,gr_defaultmaintenanceprofile,gr_inductionrequired,gr_inductionrequirements,gr_geocodelatitude,gr_geocodelongitude,gr_geocodesourceaddress,gr_geocodeformattedaddress,gr_geocoderesolvedon,_gr_customer_value&$expand=gr_Customer($select=gr_customerid,gr_name)&$filter=_gr_customer_value eq ${customerId}`,
        {
            signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
        async (result) => {
            if (!result.ok) throw new Error(await dataverseErrorMessage(result, 'Failed to fetch Customer Sites.'))
        },
    )
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
            if (typeof data.gr_siteid === 'string' && data.gr_siteid) {
                invalidateOperationalQueries((key) => key[0] === 'customer-dashboard' || key[0] === 'job-map')
                return data.gr_siteid
            }
        } catch {
            // Some Dataverse configurations return only the entity ID header.
        }
    }
    const entityId = result.headers.get('OData-EntityId') ?? result.headers.get('odata-entityid')
    const headerId = entityId?.match(/\(([^)]+)\)/)?.[1]
    if (headerId) {
        invalidateOperationalQueries((key) => key[0] === 'customer-dashboard' || key[0] === 'job-map')
        return headerId
    }
    throw new Error('The Site was created, but Dataverse did not return its record ID.')
}

export async function updateSite(
    accessToken: string,
    siteId: string,
    site: SiteUpdateInput,
): Promise<void> {
    const payload: Record<string, unknown> = {
        gr_name: site.name.trim(),
        gr_address: site.address.trim() || null,
        ...(site.defaultMaintenanceProfile !== undefined
            ? { gr_defaultmaintenanceprofile: site.defaultMaintenanceProfile }
            : {}),
    }
    if (site.inductionRequired !== undefined) {
        payload.gr_inductionrequired = site.inductionRequired
    }
    if (site.inductionRequirements !== undefined) {
        payload.gr_inductionrequirements = site.inductionRequirements == null || !site.inductionRequirements.trim().length
            ? null : site.inductionRequirements.trim()
    }
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_sites(${siteId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!result.ok) {
        throw new Error(await dataverseErrorMessage(result, 'The Site could not be updated.'))
    }
    invalidateOperationalQueries((key) => key[0] === 'customer-dashboard' || key[0] === 'job-map')
}
