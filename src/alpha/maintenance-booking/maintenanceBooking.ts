import type { Equipment } from '../jobs/types/equipment.types.ts'
import { equipmentIdentifierSearchValues } from '../equipment/identifiers/alternateFleetNumbers.ts'

export type MaintenanceImportRow = {
    id: string
    code: string
    description: string
    customer: string
    contact: string
    phone: string
    dueDate: string
    sourceDueDate: string
}

export const MAINTENANCE_ACTION_STATUSES = [
    'unreviewed',
    'contact',
    'awaiting-reply',
    'booked',
    'not-due',
    'no-longer-on-site',
    'unable-to-contact',
] as const

export type MaintenanceActionStatus = typeof MAINTENANCE_ACTION_STATUSES[number]

export type MaintenanceAction = {
    inTodo?: boolean
    addedToTodoAt?: string
    status: MaintenanceActionStatus
    nextActionDate: string
    note: string
    preferredContactId?: string
    linkedJobId?: string
    linkedJobNumber?: string
    updatedAt: string
}

export type EquipmentMatch = {
    equipment: Equipment | null
    kind: 'exact' | 'likely' | 'none'
}

// Detail actions must never target a record hidden by the current queue/filter.
export function selectedMaintenanceRow<T extends { row: { id: string } }>(visibleRows: readonly T[], selectedId: string): T | null {
    return visibleRows.find(({ row }) => row.id === selectedId) ?? visibleRows[0] ?? null
}

export function maintenanceSiteContactsKey(siteId: string) {
    return ['maintenance-booking', 'site-contacts', siteId.toLowerCase()] as const
}

export type MaintenanceExclusion = {
    id: string
    scope: 'customer' | 'equipment'
    customer: string
    code?: string
    reason: string
    createdAt: string
}

const cleanCell = (value: string) => value.replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ')
const matchKey = (value: string) => cleanCell(value).toLocaleLowerCase().replace(/[^a-z0-9]/g, '')

export const maintenanceCustomerKey = (value: string) => matchKey(value)
export const maintenanceEquipmentKey = (code: string, customer: string) => `${matchKey(customer)}:${matchKey(code)}`

export function maintenanceExclusionId(scope: MaintenanceExclusion['scope'], code: string, customer: string) {
    return scope === 'customer'
        ? `customer:${maintenanceCustomerKey(customer)}`
        : `equipment:${maintenanceEquipmentKey(code, customer)}`
}

export function isMaintenanceRowExcluded(row: MaintenanceImportRow, exclusions: readonly MaintenanceExclusion[]) {
    const customerKey = maintenanceCustomerKey(row.customer)
    const equipmentKey = maintenanceEquipmentKey(row.code, row.customer)
    return exclusions.some((exclusion) => exclusion.scope === 'customer'
        ? maintenanceCustomerKey(exclusion.customer) === customerKey
        : maintenanceEquipmentKey(exclusion.code ?? '', exclusion.customer) === equipmentKey)
}

export function filterMaintenanceExclusions(rows: readonly MaintenanceImportRow[], exclusions: readonly MaintenanceExclusion[]) {
    const included: MaintenanceImportRow[] = []
    const excluded: MaintenanceImportRow[] = []
    rows.forEach((row) => (isMaintenanceRowExcluded(row, exclusions) ? excluded : included).push(row))
    return { included, excluded }
}

function parseGreentreeDate(value: string) {
    const match = cleanCell(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!match) return ''
    const [, day, month, year] = match
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (date.getUTCFullYear() !== Number(year)
        || date.getUTCMonth() !== Number(month) - 1
        || date.getUTCDate() !== Number(day)) return ''
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function rowId(code: string, customer: string, dueDate: string, occurrence: number) {
    return [matchKey(code), matchKey(customer), dueDate || 'no-date', occurrence].join(':')
}

export function parseMaintenanceExport(input: string): MaintenanceImportRow[] {
    const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
    if (!lines.length) throw new Error('Paste the Greentree table or choose the exported file first.')

    const first = lines[0].split('\t').map(cleanCell)
    const hasHeader = first.some((cell) => matchKey(cell) === 'pmduedate')
    const headers = hasHeader ? first.map(matchKey) : ['code', 'description', 'customer', 'contact', 'phone', 'pmduedate']
    const body = hasHeader ? lines.slice(1) : lines
    const indexes = {
        code: headers.indexOf('code'),
        description: headers.indexOf('description'),
        customer: headers.indexOf('customer'),
        contact: headers.indexOf('contact'),
        phone: headers.indexOf('phone'),
        dueDate: headers.indexOf('pmduedate'),
    }
    if (indexes.code < 0 || indexes.customer < 0 || indexes.dueDate < 0) {
        throw new Error('The table needs Code, Customer, and PM Due Date columns.')
    }

    const occurrences = new Map<string, number>()
    const rows = body.map((line) => {
        const cells = line.split('\t').map(cleanCell)
        const code = cells[indexes.code] ?? ''
        const customer = cells[indexes.customer] ?? ''
        const sourceDueDate = cells[indexes.dueDate] ?? ''
        const dueDate = parseGreentreeDate(sourceDueDate)
        const base = `${matchKey(code)}:${matchKey(customer)}:${dueDate}`
        const occurrence = (occurrences.get(base) ?? 0) + 1
        occurrences.set(base, occurrence)
        return {
            id: rowId(code, customer, dueDate, occurrence),
            code,
            description: cells[indexes.description] ?? '',
            customer,
            contact: cells[indexes.contact] ?? '',
            phone: cells[indexes.phone] ?? '',
            dueDate,
            sourceDueDate,
        }
    }).filter((row) => row.code || row.customer)

    if (!rows.length) throw new Error('No maintenance records were found in the table.')
    return rows
}

function equipmentCustomerKey(equipment: Equipment) {
    return matchKey(equipment.gr_Site?.gr_Customer?.gr_name ?? '')
}

export function matchMaintenanceRow(row: MaintenanceImportRow, equipment: readonly Equipment[]): EquipmentMatch {
    const code = matchKey(row.code)
    const customer = matchKey(row.customer)
    if (!code) return { equipment: null, kind: 'none' }

    const exact = equipment.filter((item) => equipmentIdentifierSearchValues(item).some((value) => matchKey(value) === code))
    if (exact.length === 1) return { equipment: exact[0], kind: 'exact' }
    if (exact.length > 1) {
        const customerExact = exact.filter((item) => equipmentCustomerKey(item) === customer)
        return { equipment: customerExact.length === 1 ? customerExact[0] : exact[0], kind: 'exact' }
    }

    const description = matchKey(row.description)
    const likely = equipment.filter((item) => {
        const sameCustomer = customer && equipmentCustomerKey(item) === customer
        const identities = equipmentIdentifierSearchValues(item).map(matchKey)
        const identityMentioned = identities.some((identity) => identity.length >= 4 && description.includes(identity))
        return sameCustomer && identityMentioned
    })
    return likely.length === 1
        ? { equipment: likely[0], kind: 'likely' }
        : { equipment: null, kind: 'none' }
}

export function daysFromToday(dateOnly: string, today = new Date()) {
    if (!dateOnly) return null
    const target = new Date(`${dateOnly}T00:00:00Z`)
    const current = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    return Math.round((target.getTime() - current.getTime()) / 86_400_000)
}

export function readMaintenanceWorkspace(storage: Pick<Storage, 'getItem'>, key: string) {
    try {
        const parsed = JSON.parse(storage.getItem(key) ?? '{}') as {
            rows?: MaintenanceImportRow[]
            actions?: Record<string, MaintenanceAction>
            exclusions?: MaintenanceExclusion[]
        }
        return {
            rows: Array.isArray(parsed.rows) ? parsed.rows : [],
            actions: parsed.actions && typeof parsed.actions === 'object' ? parsed.actions : {},
            exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
        }
    } catch {
        return { rows: [], actions: {} as Record<string, MaintenanceAction>, exclusions: [] as MaintenanceExclusion[] }
    }
}

export function writeMaintenanceWorkspace(
    storage: Pick<Storage, 'setItem'>,
    key: string,
    rows: MaintenanceImportRow[],
    actions: Record<string, MaintenanceAction>,
    exclusions: MaintenanceExclusion[],
) {
    storage.setItem(key, JSON.stringify({ rows, actions, exclusions }))
}
