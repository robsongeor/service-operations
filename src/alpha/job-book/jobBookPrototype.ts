import type { Equipment } from '../jobs/types/equipment.types'
import type { JobBookKey } from './jobBookConfig'

export type PrototypeEquipment = {
    id: string
    fleet: string
    alternateFleetNumbers?: string
    serial: string
    make: string
    model: string
    customer: string
    customerId: string
    site: string
    siteId: string
    address: string
    addressVerified: boolean
    addressNotFoundConfirmed: boolean
    isLocal: boolean
}

export const JOB_BOOK_ENTRY_STAGES = {
    INTAKE: 'intake',
    PROMOTED: 'promoted',
    LEGACY: 'legacy',
    REGISTERED: 'registered',
    VOID: 'void',
} as const

export type JobBookEntryStage = typeof JOB_BOOK_ENTRY_STAGES[keyof typeof JOB_BOOK_ENTRY_STAGES]
export type JobBookEntrySource = 'local-intake' | 'dataverse-intake' | 'dataverse-job'

export const MANAGED_JOB_ENTRY_MARKER_COLUMNS = {
    entered: 'gr_gtentered',
    timecloudEntered: 'gr_timecloudentered',
} as const

export type JobBookRow = {
    jobBookKey: JobBookKey
    id: string
    jobNumber: string
    date: string
    mechanicId: string
    mechanicName: string
    equipmentId: string
    fleet: string
    /** Managed rows may display Serial as a fallback; export must retain the actual Fleet value. */
    primaryFleet?: string
    alternateFleetNumbers?: string
    serial: string
    make: string
    model: string
    customer: string
    customerId: string
    description: string
    site: string
    siteId: string
    contactId: string
    contactName: string
    address: string
    addressVerified: boolean
    addressNotFoundConfirmed: boolean
    customerPo: string
    entered: boolean
    timecloudEntered: boolean
    equipmentConfigured: boolean
    equipmentReviewRequired: boolean
    entryStage: JobBookEntryStage
    voidReason: string
    entrySource: JobBookEntrySource
    linkedJobId: string
    intakeRecordId: string
    etag: string
    registeredLedgerId?: string
    ledgerEtag?: string
    coordinatorManaged?: boolean
    /** Immutable allocation snapshots stay distinct from the working Job display. */
    allocationSnapshot?: { customer: string; site: string; address: string; description: string }
}

export function equipmentToPrototype(record: Equipment): PrototypeEquipment {
    return {
        id: record.gr_equipmentid,
        fleet: record.gr_fleet?.trim() ?? '',
        alternateFleetNumbers: record.gr_alternatefleetnumbers?.trim() ?? '',
        serial: record.gr_serial?.trim() ?? '',
        make: record.gr_make?.trim() ?? '',
        model: record.gr_model?.trim() ?? '',
        customer: record.gr_Site?.gr_Customer?.gr_name?.trim() ?? '',
        customerId: record.gr_Site?.gr_Customer?.gr_customerid ?? '',
        site: record.gr_Site?.gr_name?.trim() ?? '',
        siteId: record.gr_Site?.gr_siteid ?? '',
        address: record.gr_Site?.gr_address?.trim() ?? '',
        addressVerified: Boolean(record.gr_Site?.gr_address?.trim()),
        addressNotFoundConfirmed: false,
        isLocal: false,
    }
}

export function isEquipmentConfigured(equipment: Pick<PrototypeEquipment, 'fleet' | 'serial'>) {
    return Boolean(equipment.fleet.trim() || equipment.serial.trim())
}

export function jobBookEquipmentFallback(
    row: Pick<JobBookRow, 'equipmentId' | 'fleet' | 'serial' | 'make' | 'model' | 'equipmentReviewRequired'>,
): Equipment | undefined {
    if (row.equipmentReviewRequired || !(row.equipmentId || row.fleet.trim() || row.serial.trim())) return undefined
    // Intake snapshots can be saved without a master Equipment lookup. Keep the
    // original (possibly empty) ID and leave all relationships on the entry itself.
    return {
        gr_equipmentid: row.equipmentId,
        gr_fleet: row.fleet || null,
        gr_serial: row.serial || null,
        gr_make: row.make || null,
        gr_model: row.model || null,
    }
}

export function splitSiteAddress(value: string) {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length > 1) return { street: lines[0], locality: lines.slice(1).join(', ') }
    const [street = '', ...rest] = value.split(',').map((part) => part.trim())
    return { street, locality: rest.join(', ') }
}

export function createBlankJobBookRow(jobNumber: number, jobBookKey: JobBookKey = 'auckland'): JobBookRow {
    return {
        jobBookKey,
        id: crypto.randomUUID(),
        jobNumber: String(jobNumber),
        date: new Date().toLocaleDateString('en-CA'),
        mechanicId: '',
        mechanicName: '',
        equipmentId: '',
        fleet: '',
        serial: '',
        make: '',
        model: '',
        customer: '',
        customerId: '',
        description: '',
        site: '',
        siteId: '',
        contactId: '',
        contactName: '',
        address: '',
        addressVerified: false,
        addressNotFoundConfirmed: false,
        customerPo: '',
        entered: false,
        timecloudEntered: false,
        equipmentConfigured: false,
        equipmentReviewRequired: false,
        entryStage: JOB_BOOK_ENTRY_STAGES.INTAKE,
        voidReason: '',
        entrySource: 'local-intake',
        linkedJobId: '',
        intakeRecordId: '',
        etag: '',
    }
}

export function getPromotionReadiness(row: JobBookRow) {
    const reasons: string[] = []
    if (row.entryStage !== JOB_BOOK_ENTRY_STAGES.INTAKE) reasons.push('Only Intake entries can be promoted.')
    const jobNumberMatch = row.jobNumber.trim().match(/^(?:WJ|HJ|CJ)?([0-9]+)$/i)
    if (!jobNumberMatch || Number.parseInt(jobNumberMatch[1], 10) <= 0) reasons.push('A Job Number must be allocated first.')
    if (!row.description.trim()) reasons.push('A Job description is required.')
    if (!row.equipmentConfigured && !row.equipmentReviewRequired) reasons.push('Equipment must be selected or marked unconfigured.')
    if (row.address.trim() && !row.addressVerified && !row.addressNotFoundConfirmed) reasons.push('The address must be verified or marked not found.')
    return { ready: reasons.length === 0, reasons }
}

export function applyEquipmentToRow(row: JobBookRow, equipment: PrototypeEquipment): JobBookRow {
    return {
        ...row,
        equipmentId: equipment.id,
        fleet: equipment.fleet,
        serial: equipment.serial,
        make: equipment.make,
        model: equipment.model,
        customer: equipment.customer,
        customerId: equipment.customerId,
        site: equipment.site,
        siteId: equipment.siteId,
        contactId: '',
        contactName: '',
        address: equipment.address,
        addressVerified: equipment.addressVerified,
        addressNotFoundConfirmed: equipment.addressNotFoundConfirmed,
        equipmentConfigured: isEquipmentConfigured(equipment),
        equipmentReviewRequired: false,
    }
}

export function setEquipmentReviewRequired(row: JobBookRow, required: boolean): JobBookRow {
    if (!required) return { ...row, equipmentReviewRequired: false }
    return {
        ...row,
        equipmentId: '',
        fleet: '',
        serial: '',
        make: '',
        model: '',
        equipmentConfigured: false,
        equipmentReviewRequired: true,
    }
}

export function jobBookLocationFieldsVisible(
    row: Pick<JobBookRow, 'equipmentId' | 'equipmentReviewRequired'>,
    editingExistingEntry = false,
) {
    return editingExistingEntry || Boolean(row.equipmentId) || row.equipmentReviewRequired
}

export function jobBookLocationSummaryVisible(
    row: Pick<JobBookRow, 'customerId' | 'customer' | 'siteId' | 'site'>,
    locationConfirmed: boolean,
    editingLocation = false,
) {
    // Saved or explicitly created locations belong to the entry, including snapshots.
    // Incomplete locations and an explicit Edit still expose the relationship fields.
    return Boolean(locationConfirmed && !editingLocation
        && (row.customerId.trim() || row.customer.trim()) && (row.siteId.trim() || row.site.trim()))
}

// Customer changes must not undo an explicit unknown-equipment choice or a local machine snapshot.
export function applyIntakeCustomerToRow(row: JobBookRow, customerId: string, customer: string): JobBookRow {
    if (customerId === row.customerId && customer === row.customer) return row
    return {
        ...row, customerId, customer, siteId: '', site: '', contactId: '', contactName: '', address: '',
        addressVerified: false, addressNotFoundConfirmed: false,
    }
}

export function nextPrototypeJobNumber(rows: readonly JobBookRow[], fallback = 130500) {
    const values = rows
        .map((row) => Number.parseInt(row.jobNumber, 10))
        .filter(Number.isFinite)
    return values.length ? Math.max(...values) + 1 : fallback
}
