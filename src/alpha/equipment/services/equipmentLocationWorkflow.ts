import type { Equipment } from '../../jobs/types/equipment.types'
import type { Site } from '../../jobs/types/site.types'
import type { Customer } from '../../jobs/types/customer.types'

export const isPersistedEquipmentId = (id?: string) => Boolean(id && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id))

export type EquipmentLocationDestination = { customerId: string; siteId: string }

export type EquipmentDestinationInput = { customerName: string; siteName: string; address: string }
const normalizedName = (value: string) => value.trim().toLocaleLowerCase('en-NZ')

type SiteCreationIO = {
    readSites: (customerId: string) => Promise<Site[]>
    createSite: (input: { customerId: string; name: string; address: string }) => Promise<string>
}

// Site-only and Customer-plus-Site creation share the same duplicate/retry rules.
export async function createEquipmentSite(customer: Customer, input: { name: string; address: string }, canCreate: boolean, io: SiteCreationIO): Promise<Site> {
    if (!canCreate) throw new Error('You do not have permission to create an equipment destination.')
    if (!isPersistedEquipmentId(customer.gr_customerid)) throw new Error('Select an existing Customer before creating a Site.')
    const name = input.name.trim()
    const address = input.address.trim()
    if (!name || !address) throw new Error('Enter the Site name and verified address.')
    const sites = await io.readSites(customer.gr_customerid)
    const matchingSites = sites.filter((row) => normalizedName(row.gr_name) === normalizedName(name))
    if (matchingSites.length > 1 || (matchingSites.length === 1 && normalizedName(matchingSites[0].gr_address) !== normalizedName(address))) {
        throw new Error('A Site with this name already exists. Select it from the Site list or use a different name.')
    }
    const site = matchingSites[0] ?? {
        gr_siteid: await io.createSite({ customerId: customer.gr_customerid, name, address }),
        gr_name: name, gr_address: address, gr_Customer: customer,
    }
    if (!isPersistedEquipmentId(site.gr_siteid)) throw new Error('The Site record could not be confirmed. Check the Site list before retrying.')
    return site
}

// Reuses the existing Customer/Site creators. Partial creation is recoverable, never an asset move.
export async function createEquipmentDestination(input: EquipmentDestinationInput, canCreate: boolean, io: {
    findCustomers: (name: string) => Promise<Customer[]>
    createCustomer: (input: { name: string }) => Promise<string>
    rememberCustomer: (customer: Customer) => void
    readSites: (customerId: string) => Promise<Site[]>
    createSite: (input: { customerId: string; name: string; address: string }) => Promise<string>
}) {
    if (!canCreate) throw new Error('You do not have permission to create an equipment destination.')
    const customerName = input.customerName.trim()
    const siteName = input.siteName.trim()
    const address = input.address.trim()
    if (!customerName || !siteName || !address) throw new Error('Enter the Customer, Site and verified address.')
    const matches = await io.findCustomers(customerName)
    if (matches.length > 1) throw new Error('More than one Customer has this name. Select the correct existing Customer instead.')
    let customer = matches[0]
    if (!customer) {
        try { customer = { gr_customerid: await io.createCustomer({ name: customerName }), gr_name: customerName } }
        catch (cause) { throw new Error('Customer creation could not be confirmed. Search for the Customer before retrying.', { cause }) }
    }
    if (!isPersistedEquipmentId(customer.gr_customerid)) throw new Error('The Customer record could not be confirmed. Search before retrying.')
    io.rememberCustomer(customer)
    try {
        const site = await createEquipmentSite(customer, { name: siteName, address }, canCreate, io)
        return { customer, site }
    } catch (cause) {
        throw new Error(`Customer is saved, but the Site could not be selected. ${cause instanceof Error ? cause.message : 'Try again.'} Retrying reuses this Customer. Equipment has not moved.`, { cause })
    }
}

// One narrow master-data operation. Jobs, maintenance and equipment identity are never written.
export async function moveEquipmentLocation(
    source: Equipment,
    destination: EquipmentLocationDestination,
    canMove: boolean,
    io: {
        readSite: (id: string) => Promise<Site>
        writeSite: (id: string, siteId: string, etag: string) => Promise<void>
    },
): Promise<Equipment> {
    if (!canMove) throw new Error('You do not have permission to move equipment.')
    if (![source.gr_equipmentid, destination.customerId, destination.siteId].every(isPersistedEquipmentId)) {
        throw new Error('Select an existing Customer and Site before moving equipment.')
    }
    const etag = source['@odata.etag']
    if (!etag || !/^W\/"[^"\r\n]+"$/.test(etag)) throw new Error('Refresh the equipment location before saving.')
    const site = await io.readSite(destination.siteId)
    if (site.gr_siteid.toLowerCase() !== destination.siteId.toLowerCase()
        || site.gr_Customer?.gr_customerid.toLowerCase() !== destination.customerId.toLowerCase()) {
        throw new Error('This Site no longer belongs to the selected Customer. Refresh and select again.')
    }
    await io.writeSite(source.gr_equipmentid, site.gr_siteid, etag)
    // A successful conditional write is authoritative. Do not report a failed save if a subsequent
    // refresh fails: that would encourage an unsafe repeat. The next edit acquires a fresh ETag.
    return { ...source, '@odata.etag': undefined, gr_Site: site }
}
