import type { Site, SiteUpdateInput } from '../types/site.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const INDUCTION_FIELDS = {
    required: 'gr_inductionrequired',
    requirements: 'gr_inductionrequirements',
}

type SiteInductionFieldSupport = {
    inductionRequired: boolean
    inductionRequirements: boolean
}

let cachedSiteInductionSupport: Promise<SiteInductionFieldSupport> | null = null

async function dataverseHeaders(accessToken: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
    }
}

async function readSiteInductionFieldSupport(accessToken: string): Promise<SiteInductionFieldSupport> {
    const headers = {
        ...(await dataverseHeaders(accessToken)),
    }
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='gr_site')?$select=LogicalName&$expand=Attributes($select=LogicalName,IsValidForUpdate;$filter=LogicalName eq '${INDUCTION_FIELDS.required}' or LogicalName eq '${INDUCTION_FIELDS.requirements}')`,
        { headers },
    )
    if (!result.ok) {
        return { inductionRequired: false, inductionRequirements: false }
    }
    const data = await result.json()
    const attributes = data.Attributes?.value ?? []
    const writable = new Set(attributes.filter((attribute: { IsValidForUpdate?: boolean, LogicalName?: string }) =>
        attribute.IsValidForUpdate !== false && typeof attribute.LogicalName === 'string',
    ).map((attribute: { LogicalName: string }) => attribute.LogicalName))
    return {
        inductionRequired: writable.has(INDUCTION_FIELDS.required),
        inductionRequirements: writable.has(INDUCTION_FIELDS.requirements),
    }
}

function getSiteInductionFieldSupport(accessToken: string): Promise<SiteInductionFieldSupport> {
    if (!cachedSiteInductionSupport) {
        cachedSiteInductionSupport = readSiteInductionFieldSupport(accessToken)
            .catch(() => ({ inductionRequired: false, inductionRequirements: false }))
    }
    return cachedSiteInductionSupport
}

function formatInductionError() {
    return 'Induction fields are not available in this Dataverse environment yet.'
}

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
        `${DATAVERSE_URL}/api/data/v9.2/gr_sites?$select=gr_siteid,gr_name,gr_address,gr_defaultmaintenanceprofile,gr_inductionrequired,gr_inductionrequirements,gr_geocodelatitude,gr_geocodelongitude,gr_geocodesourceaddress,gr_geocodeformattedaddress,gr_geocoderesolvedon,_gr_customer_value&$expand=gr_Customer($select=gr_customerid,gr_name)`,
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
    const payload = {
        gr_name: site.name.trim(),
        gr_address: site.address.trim() || null,
        ...(site.defaultMaintenanceProfile !== undefined
            ? { gr_defaultmaintenanceprofile: site.defaultMaintenanceProfile }
            : {}),
    }
    const requestedInduction = site.inductionRequired !== undefined || site.inductionRequirements !== undefined
    if (requestedInduction) {
        const support = await getSiteInductionFieldSupport(accessToken)
        if ((site.inductionRequired !== undefined && !support.inductionRequired)
            || (site.inductionRequirements !== undefined && !support.inductionRequirements)) {
            throw new Error(formatInductionError())
        }
        if (site.inductionRequired !== undefined && support.inductionRequired) {
            payload.gr_inductionrequired = site.inductionRequired
        }
        if (site.inductionRequirements !== undefined && support.inductionRequirements) {
            payload.gr_inductionrequirements = site.inductionRequirements == null || !site.inductionRequirements.trim().length
                ? null : site.inductionRequirements.trim()
        }
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
}
