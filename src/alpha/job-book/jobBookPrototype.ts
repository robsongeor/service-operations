import type { Equipment } from '../jobs/types/equipment.types'

export type PrototypeEquipment = {
    id: string
    fleet: string
    serial: string
    make: string
    model: string
    customer: string
    site: string
    address: string
    addressVerified: boolean
    addressNotFoundConfirmed: boolean
    isLocal: boolean
}

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
    description: string
    site: string
    address: string
    addressVerified: boolean
    addressNotFoundConfirmed: boolean
    customerPo: string
    entered: boolean
    timecloudEntered: boolean
    equipmentConfigured: boolean
    equipmentReviewRequired: boolean
}

export function equipmentToPrototype(record: Equipment): PrototypeEquipment {
    return {
        id: record.gr_equipmentid,
        fleet: record.gr_fleet?.trim() ?? '',
        serial: record.gr_serial?.trim() ?? '',
        make: record.gr_make?.trim() ?? '',
        model: record.gr_model?.trim() ?? '',
        customer: record.gr_Site?.gr_Customer?.gr_name?.trim() ?? '',
        site: record.gr_Site?.gr_name?.trim() ?? '',
        address: record.gr_Site?.gr_address?.trim() ?? '',
        addressVerified: Boolean(record.gr_Site?.gr_address?.trim()),
        addressNotFoundConfirmed: false,
        isLocal: false,
    }
}

export function isEquipmentConfigured(equipment: Pick<PrototypeEquipment, 'fleet' | 'serial'>) {
    return Boolean(equipment.fleet.trim() || equipment.serial.trim())
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
        description: '',
        site: '',
        address: '',
        addressVerified: false,
        addressNotFoundConfirmed: false,
        customerPo: '',
        entered: false,
        timecloudEntered: false,
        equipmentConfigured: false,
        equipmentReviewRequired: false,
    }
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
        site: equipment.site,
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
