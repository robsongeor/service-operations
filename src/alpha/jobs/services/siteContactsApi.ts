import type { SiteContact } from '../types/siteContact.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchSiteContacts(
    accessToken: string,
): Promise<SiteContact[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_sitecontacts?$select=gr_sitecontactid&$expand=gr_Site($select=gr_siteid,gr_name),gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)`,
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