export type SiteContact = {
    gr_sitecontactid: string

    gr_Site?: {
        gr_siteid: string
        gr_name: string
    }

    gr_Contact?: {
        gr_contactid: string
        gr_name: string
        gr_phone?: string
        gr_email?: string
    }
}