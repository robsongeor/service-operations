import type { SiteContact } from '../jobs/types/siteContact.types'

export type CustomerContact = {
    id: string
    name: string
    phone?: string
    email?: string
    role?: string
    siteIds: string[]
    isPrimary?: boolean
}

export function customerContactsFromSiteLinks(
    siteContacts: SiteContact[],
    customerSiteIds: Set<string>,
): CustomerContact[] {
    const contacts = new Map<string, CustomerContact>()

    for (const link of siteContacts) {
        const siteId = link.gr_Site?.gr_siteid
        const contact = link.gr_Contact
        if (!siteId || !customerSiteIds.has(siteId) || !contact) continue

        const existing = contacts.get(contact.gr_contactid)
        if (existing) {
            if (!existing.siteIds.includes(siteId)) existing.siteIds.push(siteId)
            continue
        }

        contacts.set(contact.gr_contactid, {
            id: contact.gr_contactid,
            name: contact.gr_name,
            phone: contact.gr_phone,
            email: contact.gr_email,
            siteIds: [siteId],
        })
    }

    return [...contacts.values()].sort((first, second) => first.name.localeCompare(second.name))
}
