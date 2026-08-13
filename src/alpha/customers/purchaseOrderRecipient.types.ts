export const PURCHASE_ORDER_RECIPIENT_ROLES = {
    PRIMARY: 122830000,
    CC: 122830001,
} as const

export type PurchaseOrderRecipientRole = typeof PURCHASE_ORDER_RECIPIENT_ROLES[keyof typeof PURCHASE_ORDER_RECIPIENT_ROLES]

export type PurchaseOrderRecipient = {
    gr_purchaseorderrecipientid: string
    gr_name: string
    _gr_customer_value: string
    _gr_site_value?: string | null
    _gr_contact_value: string
    gr_recipientrole: PurchaseOrderRecipientRole
    gr_sortorder: number
    createdon?: string
    '@odata.etag': string
    gr_Contact?: {
        gr_contactid: string
        gr_name: string
        gr_email?: string | null
        gr_phone?: string | null
    }
}

export type PurchaseOrderRecipientSaveInput = {
    customerId: string
    siteId?: string | null
    primaryContactId?: string | null
    ccContactIds: string[]
}

export type EffectivePurchaseOrderRecipients = {
    source: 'customer' | 'site' | 'unconfigured'
    primary: PurchaseOrderRecipient | null
    cc: PurchaseOrderRecipient[]
}
