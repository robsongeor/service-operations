import { isValidRecipientEmail } from '../jobs/utils/technicianMailto.ts'
import {
    PURCHASE_ORDER_RECIPIENT_ROLES,
    type EffectivePurchaseOrderRecipients,
    type PurchaseOrderRecipient,
    type PurchaseOrderRecipientSaveInput,
} from './purchaseOrderRecipient.types.ts'

const sameId = (left?: string | null, right?: string | null) =>
    (left ?? '').toLowerCase() === (right ?? '').toLowerCase()

export function recipientsForScope(
    recipients: PurchaseOrderRecipient[],
    customerId: string,
    siteId?: string | null,
) {
    return recipients.filter((recipient) => sameId(recipient._gr_customer_value, customerId)
        && (siteId ? sameId(recipient._gr_site_value, siteId) : !recipient._gr_site_value))
}

function resolvedScope(rows: PurchaseOrderRecipient[], source: 'customer' | 'site'): EffectivePurchaseOrderRecipients {
    const valid = rows.filter((row) => row.gr_Contact && isValidRecipientEmail(row.gr_Contact.gr_email))
        .sort((left, right) => left.gr_sortorder - right.gr_sortorder)
    return {
        source,
        primary: valid.find((row) => row.gr_recipientrole === PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY) ?? null,
        cc: valid.filter((row) => row.gr_recipientrole === PURCHASE_ORDER_RECIPIENT_ROLES.CC),
    }
}

export function resolvePurchaseOrderRecipients(
    recipients: PurchaseOrderRecipient[] | undefined,
    customerId?: string | null,
    siteId?: string | null,
): EffectivePurchaseOrderRecipients {
    if (!customerId) return { source: 'unconfigured', primary: null, cc: [] }
    const rows = recipients ?? []
    const siteRows = siteId ? recipientsForScope(rows, customerId, siteId) : []
    if (siteRows.length) return resolvedScope(siteRows, 'site')
    const customerRows = recipientsForScope(rows, customerId)
    if (customerRows.length) return resolvedScope(customerRows, 'customer')
    return { source: 'unconfigured', primary: null, cc: [] }
}

export function validatePurchaseOrderRecipientSave(
    input: PurchaseOrderRecipientSaveInput,
    allowedContactIds: string[],
) {
    const allowed = new Set(allowedContactIds.map((id) => id.toLowerCase()))
    const primary = input.primaryContactId?.toLowerCase() ?? ''
    const cc = input.ccContactIds.map((id) => id.toLowerCase())
    if (!primary && cc.length) throw new Error('Choose the primary PO recipient before adding CC contacts.')
    if (primary && !allowed.has(primary)) throw new Error('The selected primary PO recipient is not available for this scope.')
    if (cc.some((id) => !allowed.has(id))) throw new Error('One or more selected CC contacts are not available for this scope.')
    if (cc.includes(primary)) throw new Error('The primary PO recipient cannot also be a CC recipient.')
    if (new Set(cc).size !== cc.length) throw new Error('Each CC contact can be selected only once.')
}
