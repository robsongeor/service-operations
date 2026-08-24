import type { SiteContact } from '../types/siteContact.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { buildSiteContactsUrl } from './jobRelationshipLookupUrls'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchSiteContacts(
    accessToken: string,
): Promise<SiteContact[]> {
    return fetchAllDataversePages<SiteContact>(
        `${DATAVERSE_URL}/api/data/v9.2/gr_sitecontacts?$select=gr_sitecontactid&$expand=gr_Site($select=gr_siteid,gr_name),gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
        async (result) => {
            if (result.ok) return
            const error = await result.text()
            throw new Error(`Failed to fetch site contacts: ${error}`)
        },
    )
}

export async function fetchSiteContactsForSite(
    accessToken: string,
    siteId: string,
    signal?: AbortSignal,
): Promise<SiteContact[]> {
    return fetchAllDataversePages<SiteContact>(
        buildSiteContactsUrl(DATAVERSE_URL, siteId),
        {
            cache: 'no-store',
            signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
            },
        },
        async (result) => {
            if (result.ok) return
            const error = await result.text()
            throw new Error(`Failed to fetch Site contacts: ${error || `${result.status} ${result.statusText}`}`)
        },
    )
}
