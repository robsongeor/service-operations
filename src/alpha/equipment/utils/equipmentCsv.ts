import type { SignedInUserInfo } from '../../../auth/signedInUser.ts'
import {
    SERVICE_OPERATIONS_ADMIN_EMAIL,
    isServiceOperationsAdministrator,
} from '../../../auth/adminAuthorization.ts'
import type { Equipment } from '../../jobs/types/equipment.types.ts'
import type { Site } from '../../jobs/types/site.types.ts'
import { EQUIPMENT_COMPLIANCE_STATUSES, type EquipmentComplianceStatus } from '../compliance/equipmentCompliance.ts'
import {
    MAINTENANCE_PROFILES,
    POWER_TYPES,
    SERVICE_PROGRAMMES,
    type MaintenanceProfile,
    type PowerType,
    type ServiceProgramme,
} from '../servicePlans/maintenanceConfiguration.ts'
import { normalizeEquipmentInput, toEquipmentDateOnlyValue, type EquipmentUpdateInput } from '../types/equipmentManager.types.ts'

export const EQUIPMENT_CSV_ADMIN_EMAIL = SERVICE_OPERATIONS_ADMIN_EMAIL

export function canUseEquipmentCsvTools(user: SignedInUserInfo | null) {
    return isServiceOperationsAdministrator(user)
}

export const EQUIPMENT_CSV_COLUMNS = [
    'Equipment ID', 'Fleet Number', 'Serial Number', 'Make', 'Model', 'Operational Status',
    'Power Type', 'Power Type ID', 'Customer', 'Customer ID', 'Site', 'Site ID', 'Road Use',
    'Road Use ID', 'Registration Number', 'Rego Expiry', 'WOF Expiry', 'Maintenance Profile',
    'Maintenance Profile ID', 'Service Programme', 'Service Programme ID',
    'Last Known Hour Meter', 'Reading Recorded Date',
] as const

const profileLabels = new Map<number, string>([
    [MAINTENANCE_PROFILES.HIGH_USAGE, 'High Usage'],
    [MAINTENANCE_PROFILES.STANDARD, 'Standard'],
    [MAINTENANCE_PROFILES.LOW_USAGE, 'Low Usage'],
    [MAINTENANCE_PROFILES.CUSTOM, 'Custom'],
])
const programmeLabels = new Map<number, string>([
    [SERVICE_PROGRAMMES.ICE_STANDARD, 'ICE Standard'],
    [SERVICE_PROGRAMMES.ELECTRIC_STANDARD, 'Electric Standard'],
    [SERVICE_PROGRAMMES.CUSTOM, 'Custom'],
])
const powerLabels = new Map<number, string>([
    [POWER_TYPES.ICE, 'ICE'],
    [POWER_TYPES.ELECTRIC, 'Electric'],
    [POWER_TYPES.OTHER_UNKNOWN, 'Other / Unknown'],
])
const roadUseLabels = new Map<number, string>([
    [EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED, 'Road Registered'],
    [EQUIPMENT_COMPLIANCE_STATUSES.DEREGISTERED, 'Deregistered'],
    [EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD, 'Off Road'],
])

function csvCell(value: unknown) {
    const text = value == null ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function equipmentCsvText(equipment: Equipment[]) {
    const rows = equipment.map((item) => {
        const site = item.gr_Site
        const customer = site?.gr_Customer
        const compliance = item.gr_compliancestatus ?? ''
        const values = [
            item.gr_equipmentid,
            item.gr_fleet,
            item.gr_serial,
            item.gr_make,
            item.gr_model,
            item.statecode === 0 ? 'Active' : item.statecode === 1 ? 'Inactive' : '',
            powerLabels.get(item.gr_powertype ?? -1) ?? '',
            item.gr_powertype,
            customer?.gr_name,
            customer?.gr_customerid,
            site?.gr_name,
            site?.gr_siteid,
            roadUseLabels.get(compliance as number) ?? '',
            compliance,
            item.gr_registrationnumber,
            item.gr_regoexpiry?.slice(0, 10),
            item.gr_currentwofexpiry?.slice(0, 10),
            profileLabels.get(item.gr_maintenanceprofile ?? -1) ?? '',
            item.gr_maintenanceprofile,
            programmeLabels.get(item.gr_serviceprogramme ?? -1) ?? '',
            item.gr_serviceprogramme,
            item.gr_currenthourmeter,
            item.gr_currenthourmeterrecordeddate?.slice(0, 10),
        ]
        return rowsToCsvRow(values)
    })
    return `\uFEFF${rowsToCsvRow([...EQUIPMENT_CSV_COLUMNS])}\r\n${rows.join('\r\n')}\r\n`
}

function rowsToCsvRow(values: readonly unknown[]) {
    return values.map(csvCell).join(',')
}

export function parseCsv(source: string) {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let quoted = false
    const text = source.replace(/^\uFEFF/, '')
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index]
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
            else if (character === '"') quoted = false
            else cell += character
        } else if (character === '"') quoted = true
        else if (character === ',') { row.push(cell); cell = '' }
        else if (character === '\n') {
            row.push(cell.replace(/\r$/, ''))
            if (row.some((value) => value !== '')) rows.push(row)
            row = []
            cell = ''
        } else cell += character
    }
    if (quoted) throw new Error('CSV contains an unterminated quoted value.')
    row.push(cell.replace(/\r$/, ''))
    if (row.some((value) => value !== '')) rows.push(row)
    return rows
}

export type EquipmentCsvChange = {
    field: keyof EquipmentCsvPatch
    label: string
    currentValue: string
    proposedValue: string
}

export type EquipmentCsvPatch = {
    fleet?: string
    serial?: string
    make?: string
    model?: string
    siteId?: string
    complianceStatus?: EquipmentComplianceStatus
    registrationNumber?: string
    regoExpiry?: string
    currentWofExpiry?: string
    powerType?: PowerType
    maintenanceProfile?: MaintenanceProfile
    serviceProgramme?: ServiceProgramme
    currentHourMeter?: number
    readingRecordedDate?: string
}

export type EquipmentCsvReviewRow = {
    rowNumber: number
    equipmentId: string
    equipment?: Equipment
    changes: EquipmentCsvChange[]
    patch: EquipmentCsvPatch
    errors: string[]
    status: 'changed' | 'unchanged' | 'invalid' | 'not-found' | 'duplicate'
}

const editableColumns = new Set<string>([
    'Fleet Number', 'Serial Number', 'Make', 'Model', 'Power Type ID', 'Site ID', 'Road Use ID',
    'Registration Number', 'Rego Expiry', 'WOF Expiry', 'Maintenance Profile ID',
    'Service Programme ID', 'Last Known Hour Meter', 'Reading Recorded Date',
])
const knownColumns = new Set<string>(EQUIPMENT_CSV_COLUMNS)

function dateValue(value: string) {
    return value ? toEquipmentDateOnlyValue(value) || null : undefined
}

function choiceValue<T extends number>(value: string, allowed: readonly number[]): T | null | undefined {
    if (!value.trim()) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && allowed.includes(parsed) ? parsed as T : null
}

export function reviewEquipmentCsv(source: string, equipment: Equipment[], sites: Site[]) {
    const rows = parseCsv(source)
    if (!rows.length) throw new Error('The CSV file is empty.')
    const headers = rows[0].map((value) => value.trim())
    if (!headers.includes('Equipment ID')) throw new Error('The CSV must include an Equipment ID column.')
    const unsupportedColumns = headers.filter((header) => header && !knownColumns.has(header))
    const index = new Map(headers.map((header, columnIndex) => [header, columnIndex]))
    const value = (row: string[], header: string) => row[index.get(header) ?? -1]?.trim() ?? ''
    const duplicateIds = new Set<string>()
    const counts = new Map<string, number>()
    rows.slice(1).forEach((row) => {
        const id = value(row, 'Equipment ID').toLowerCase()
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    })
    counts.forEach((count, id) => { if (count > 1) duplicateIds.add(id) })
    const equipmentById = new Map(equipment.map((item) => [item.gr_equipmentid.toLowerCase(), item]))
    const siteById = new Map(sites.map((site) => [site.gr_siteid.toLowerCase(), site]))

    const reviews = rows.slice(1).map((row, rowIndex): EquipmentCsvReviewRow => {
        const equipmentId = value(row, 'Equipment ID')
        const normalizedId = equipmentId.toLowerCase()
        const record = equipmentById.get(normalizedId)
        const errors = unsupportedColumns.map((column) => `Unsupported column: ${column}`)
        if (!equipmentId) errors.push('Equipment ID is required.')
        if (duplicateIds.has(normalizedId)) return { rowNumber: rowIndex + 2, equipmentId, equipment: record, changes: [], patch: {}, errors: ['Duplicate Equipment ID in CSV.'], status: 'duplicate' }
        if (!record) return { rowNumber: rowIndex + 2, equipmentId, changes: [], patch: {}, errors: ['Equipment record was not found.'], status: 'not-found' }

        const patch: EquipmentCsvPatch = {}
        const changes: EquipmentCsvChange[] = []
        const add = <K extends keyof EquipmentCsvPatch>(field: K, label: string, current: EquipmentCsvPatch[K] | null | undefined, proposed: EquipmentCsvPatch[K] | undefined) => {
            if (proposed === undefined || proposed === current) return
            patch[field] = proposed
            changes.push({ field, label, currentValue: current == null ? '' : String(current), proposedValue: String(proposed) })
        }
        const textFields = [
            ['Fleet Number', 'fleet', record.gr_fleet],
            ['Serial Number', 'serial', record.gr_serial],
            ['Make', 'make', record.gr_make],
            ['Model', 'model', record.gr_model],
            ['Registration Number', 'registrationNumber', record.gr_registrationnumber],
        ] as const
        textFields.forEach(([header, field, current]) => {
            if (index.has(header)) add(field, header, current ?? '', value(row, header) || undefined)
        })
        const dates = [
            ['Rego Expiry', 'regoExpiry', record.gr_regoexpiry],
            ['WOF Expiry', 'currentWofExpiry', record.gr_currentwofexpiry],
            ['Reading Recorded Date', 'readingRecordedDate', record.gr_currenthourmeterrecordeddate],
        ] as const
        dates.forEach(([header, field, current]) => {
            if (!index.has(header) || !value(row, header)) return
            const parsed = dateValue(value(row, header))
            if (parsed === null) errors.push(`${header} must use YYYY-MM-DD.`)
            else add(field, header, current?.slice(0, 10) ?? '', parsed)
        })
        const choices = [
            ['Power Type ID', 'powerType', record.gr_powertype, Object.values(POWER_TYPES)],
            ['Road Use ID', 'complianceStatus', record.gr_compliancestatus, Object.values(EQUIPMENT_COMPLIANCE_STATUSES)],
            ['Maintenance Profile ID', 'maintenanceProfile', record.gr_maintenanceprofile, Object.values(MAINTENANCE_PROFILES)],
            ['Service Programme ID', 'serviceProgramme', record.gr_serviceprogramme, Object.values(SERVICE_PROGRAMMES)],
        ] as const
        choices.forEach(([header, field, current, allowed]) => {
            if (!index.has(header) || !value(row, header)) return
            const parsed = choiceValue(value(row, header), allowed)
            if (parsed === null) errors.push(`${header} is not a supported value.`)
            else if (parsed !== undefined && parsed !== current) {
                Object.assign(patch, { [field]: parsed })
                changes.push({
                    field,
                    label: header,
                    currentValue: current == null ? '' : String(current),
                    proposedValue: String(parsed),
                })
            }
        })
        if (patch.complianceStatus !== undefined) {
            if (patch.complianceStatus === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED) {
                const resultingRegistration = patch.registrationNumber ?? record.gr_registrationnumber ?? ''
                if (!resultingRegistration.trim()) errors.push('Road Registered Equipment requires a Registration Number.')
            } else {
                add('registrationNumber', 'Registration Number', record.gr_registrationnumber ?? '', '')
                add('regoExpiry', 'Rego Expiry', record.gr_regoexpiry?.slice(0, 10) ?? '', '')
                add('currentWofExpiry', 'WOF Expiry', record.gr_currentwofexpiry?.slice(0, 10) ?? '', '')
            }
        }
        if (index.has('Site ID') && value(row, 'Site ID')) {
            const siteId = value(row, 'Site ID')
            const site = siteById.get(siteId.toLowerCase())
            if (!site) errors.push('Site ID does not reference an existing Site.')
            else {
                const customerId = value(row, 'Customer ID')
                if (customerId && site.gr_Customer?.gr_customerid.toLowerCase() !== customerId.toLowerCase()) errors.push('Site ID does not belong to the exported Customer ID.')
                else add('siteId', 'Site ID', record.gr_Site?.gr_siteid ?? '', site.gr_siteid)
            }
        }
        if (index.has('Last Known Hour Meter') && value(row, 'Last Known Hour Meter')) {
            const parsed = Number(value(row, 'Last Known Hour Meter'))
            if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) errors.push('Last Known Hour Meter must be a non-negative whole number.')
            else if (parsed < (record.gr_currenthourmeter ?? 0)) errors.push('Last Known Hour Meter cannot decrease.')
            else add('currentHourMeter', 'Last Known Hour Meter', record.gr_currenthourmeter, parsed)
        }
        const meterWillChange = patch.currentHourMeter !== undefined || patch.readingRecordedDate !== undefined
        const resultingRecordedDate = patch.readingRecordedDate ?? record.gr_currenthourmeterrecordeddate?.slice(0, 10)
        if (meterWillChange && !resultingRecordedDate) errors.push('Reading Recorded Date is required when updating the hour meter record.')
        if (!errors.length && changes.length) {
            try {
                equipmentInputFromCsvPatch(record, patch)
            } catch (error) {
                errors.push(error instanceof Error ? error.message : 'The proposed Equipment values are invalid.')
            }
        }

        return {
            rowNumber: rowIndex + 2,
            equipmentId,
            equipment: record,
            changes,
            patch,
            errors,
            status: errors.length ? 'invalid' : changes.length ? 'changed' : 'unchanged',
        }
    })
    return { rows: reviews, unsupportedColumns, editableColumns: [...editableColumns] }
}

export function equipmentInputFromCsvPatch(record: Equipment, patch: EquipmentCsvPatch): EquipmentUpdateInput {
    return normalizeEquipmentInput({
        fleet: patch.fleet ?? record.gr_fleet ?? '',
        serial: patch.serial ?? record.gr_serial ?? '',
        make: patch.make ?? record.gr_make ?? '',
        model: patch.model ?? record.gr_model ?? '',
        siteId: patch.siteId ?? record.gr_Site?.gr_siteid ?? '',
        registrationNumber: patch.registrationNumber ?? record.gr_registrationnumber ?? '',
        complianceStatus: patch.complianceStatus ?? record.gr_compliancestatus ?? EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD,
        wofRequired: false,
        currentWofExpiry: patch.currentWofExpiry ?? record.gr_currentwofexpiry ?? '',
        regoExpiry: patch.regoExpiry ?? record.gr_regoexpiry ?? '',
        powerType: patch.powerType ?? record.gr_powertype ?? POWER_TYPES.OTHER_UNKNOWN,
        serviceProgramme: patch.serviceProgramme ?? record.gr_serviceprogramme ?? SERVICE_PROGRAMMES.ICE_STANDARD,
        maintenanceProfile: patch.maintenanceProfile ?? record.gr_maintenanceprofile ?? MAINTENANCE_PROFILES.STANDARD,
        ownershipType: record.gr_ownershiptype ?? null,
        siteCheckAvailability: record.gr_sitecheckavailability ?? null,
        customAEnabled: record.gr_customaenabled ?? true,
        customBEnabled: record.gr_custombenabled ?? false,
        customCEnabled: record.gr_customcenabled ?? true,
        customAIntervalDays: String(record.gr_customaintervaldays ?? ''),
        customBIntervalDays: String(record.gr_custombintervaldays ?? ''),
        customCIntervalDays: String(record.gr_customcintervaldays ?? ''),
    })
}
