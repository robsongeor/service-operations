import type { CustomerContact } from './customerContact.types.ts'
import {
    PURCHASE_ORDER_RECIPIENT_ROLES,
    type PurchaseOrderRecipient,
    type PurchaseOrderRecipientSaveInput,
} from './purchaseOrderRecipient.types.ts'
import { recipientsForScope, validatePurchaseOrderRecipientSave } from './purchaseOrderRecipientRules.ts'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const ENTITY_SET = 'gr_purchaseorderrecipients'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const headers = (accessToken: string, extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...extra,
})

function id(value: string, label: string) {
    if (!UUID.test(value)) throw new Error(`${label} is invalid. Refresh the Customer screen and retry.`)
    return value
}

export async function fetchPurchaseOrderRecipients(accessToken: string, customerId: string) {
    const url = new URL(`${DATAVERSE_URL}/api/data/v9.2/${ENTITY_SET}`)
    url.searchParams.set('$select', 'gr_purchaseorderrecipientid,gr_name,_gr_customer_value,_gr_site_value,_gr_contact_value,gr_recipientrole,gr_sortorder,createdon')
    url.searchParams.set('$expand', 'gr_Contact($select=gr_contactid,gr_name,gr_email,gr_phone)')
    url.searchParams.set('$filter', `_gr_customer_value eq ${id(customerId, 'Customer identifier')}`)
    url.searchParams.set('$orderby', 'gr_sortorder asc,createdon asc')
    url.searchParams.set('$top', '200')
    const response = await fetch(url, { headers: headers(accessToken) })
    if (!response.ok) throw new Error(`PO recipient settings could not be loaded (${response.status}).`)
    const body = await response.json() as { value?: PurchaseOrderRecipient[], '@odata.nextLink'?: string }
    if (body['@odata.nextLink']) throw new Error('This Customer has more PO recipient settings than the supported limit.')
    return body.value ?? []
}

function batchRequest(input: PurchaseOrderRecipientSaveInput, existing: PurchaseOrderRecipient[], contacts: CustomerContact[]) {
    const boundary = `batch_${crypto.randomUUID().replaceAll('-', '')}`
    const changeset = `changeset_${crypto.randomUUID().replaceAll('-', '')}`
    const requests: string[] = []
    const add = (contentId: number, method: string, path: string, body?: object, etag?: string) => requests.push([
        `--${changeset}`,
        'Content-Type: application/http',
        'Content-Transfer-Encoding: binary',
        `Content-ID: ${contentId}`,
        '',
        `${method} ${path} HTTP/1.1`,
        ...(etag ? [`If-Match: ${etag}`] : []),
        ...(body ? ['Content-Type: application/json;type=entry', '', JSON.stringify(body)] : ['', '']),
    ].join('\r\n'))
    let contentId = 1
    for (const row of recipientsForScope(existing, input.customerId, input.siteId)) {
        add(contentId++, 'DELETE', `${ENTITY_SET}(${id(row.gr_purchaseorderrecipientid, 'PO recipient identifier')})`, undefined, row['@odata.etag'])
    }
    const selected = [
        ...(input.primaryContactId ? [{ contactId: input.primaryContactId, role: PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY }] : []),
        ...input.ccContactIds.map((contactId) => ({ contactId, role: PURCHASE_ORDER_RECIPIENT_ROLES.CC })),
    ]
    selected.forEach((selection, index) => {
        const contact = contacts.find((item) => item.id.toLowerCase() === selection.contactId.toLowerCase())
        add(contentId++, 'POST', ENTITY_SET, {
            gr_name: `${input.siteId ? 'Site override' : 'Customer default'} - ${selection.role === PURCHASE_ORDER_RECIPIENT_ROLES.PRIMARY ? 'Primary' : 'CC'} - ${contact?.name || 'Contact'}`.slice(0, 200),
            'gr_Customer@odata.bind': `/gr_customers(${id(input.customerId, 'Customer identifier')})`,
            ...(input.siteId ? { 'gr_Site@odata.bind': `/gr_sites(${id(input.siteId, 'Site identifier')})` } : {}),
            'gr_Contact@odata.bind': `/gr_contacts(${id(selection.contactId, 'Contact identifier')})`,
            gr_recipientrole: selection.role,
            gr_sortorder: index,
        })
    })
    return {
        boundary,
        payload: [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, '', ...requests,
            `--${changeset}--`, `--${boundary}--`, ''].join('\r\n'),
    }
}

export async function savePurchaseOrderRecipients(
    accessToken: string,
    existing: PurchaseOrderRecipient[],
    input: PurchaseOrderRecipientSaveInput,
    contacts: CustomerContact[],
) {
    validatePurchaseOrderRecipientSave(input, contacts.map((contact) => contact.id))
    const batch = batchRequest(input, existing, contacts)
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/$batch`, {
        method: 'POST',
        headers: headers(accessToken, { 'Content-Type': `multipart/mixed;boundary=${batch.boundary}` }),
        body: batch.payload,
    })
    const text = await response.text()
    const nestedFailure = [...text.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((match) => Number(match[1])).find((status) => status >= 400)
    if (!response.ok || nestedFailure) {
        if (nestedFailure === 412) throw new Error('PO recipient settings changed in Dataverse. Refresh and try again.')
        throw new Error(`PO recipient settings could not be saved (${nestedFailure || response.status}).`)
    }
}
