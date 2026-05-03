const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function createContact(
    accessToken: string,
    contact: {
        name: string
        phone?: string
        email?: string
    },
): Promise<string> {
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_contacts`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({
            gr_name: contact.name,
            gr_phone: contact.phone,
            gr_email: contact.email,
        }),
    })

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }

    const data = await result.json()
    return data.gr_contactid
}

export async function createSiteContact(
    accessToken: string,
    siteId: string,
    contactId: string,
) {
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_sitecontacts`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            'gr_Site@odata.bind': `/gr_sites(${siteId})`,
            'gr_Contact@odata.bind': `/gr_contacts(${contactId})`,
        }),
    })

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }
}