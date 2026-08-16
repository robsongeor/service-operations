import type { Equipment } from '../jobs/types/equipment.types'

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
    VOID: 'void',
} as const

export type JobBookEntryStage = typeof JOB_BOOK_ENTRY_STAGES[keyof typeof JOB_BOOK_ENTRY_STAGES]
export type JobBookEntrySource = 'local-intake' | 'dataverse-intake' | 'dataverse-job'

export const MANAGED_JOB_ENTRY_MARKER_COLUMNS = {
    entered: 'gr_gtentered',
    timecloudEntered: 'gr_timecloudentered',
} as const

export type JobBookRow = {
    id: string
    jobNumber: string
    date: string
    mechanicId: string
    mechanicName: string
    equipmentId: string
    fleet: string
    serial: string
    make: string
    model: string
    customer: string
    customerId: string
    description: string
    site: string
    siteId: string
    address: string
    addressVerified: boolean
    addressNotFoundConfirmed: boolean
    customerPo: string
    entered: boolean
    timecloudEntered: boolean
    equipmentConfigured: boolean
    equipmentReviewRequired: boolean
    entryStage: JobBookEntryStage
    entrySource: JobBookEntrySource
    linkedJobId: string
    intakeRecordId: string
    etag: string
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

export function splitSiteAddress(value: string) {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length > 1) return { street: lines[0], locality: lines.slice(1).join(', ') }
    const [street = '', ...rest] = value.split(',').map((part) => part.trim())
    return { street, locality: rest.join(', ') }
}

export function createBlankJobBookRow(jobNumber: number): JobBookRow {
    return {
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
        address: '',
        addressVerified: false,
        addressNotFoundConfirmed: false,
        customerPo: '',
        entered: false,
        timecloudEntered: false,
        equipmentConfigured: false,
        equipmentReviewRequired: false,
        entryStage: JOB_BOOK_ENTRY_STAGES.INTAKE,
        entrySource: 'local-intake',
        linkedJobId: '',
        intakeRecordId: '',
        etag: '',
    }
}

export function getPromotionReadiness(row: JobBookRow) {
    const reasons: string[] = []
    if (row.entryStage !== JOB_BOOK_ENTRY_STAGES.INTAKE) reasons.push('Only Intake entries can be promoted.')
    if (!Number.isFinite(Number(row.jobNumber)) || Number(row.jobNumber) <= 0) reasons.push('A Job Number must be allocated first.')
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
        address: equipment.address,
        addressVerified: equipment.addressVerified,
        addressNotFoundConfirmed: equipment.addressNotFoundConfirmed,
        equipmentConfigured: isEquipmentConfigured(equipment),
        equipmentReviewRequired: false,
    }
}

export function nextPrototypeJobNumber(rows: readonly JobBookRow[], fallback = 130500) {
    const values = rows
        .map((row) => Number.parseInt(row.jobNumber, 10))
        .filter(Number.isFinite)
    return values.length ? Math.max(...values) + 1 : fallback
}
