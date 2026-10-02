import { parseAlternateFleetNumbers } from '../equipment/identifiers/alternateFleetNumbers.ts'
import type { Customer } from '../jobs/types/customer.types.ts'
import type { Equipment } from '../jobs/types/equipment.types.ts'
import type { Job } from '../jobs/types/job.types.ts'
import type { Mechanic } from '../jobs/types/mechanic.types.ts'

const REQUIRED_HEADERS = ['job number', 'date', 'mechanic', 'model', 'fleet', 'customer', 'description'] as const

export type JobSpreadsheetRow = {
    id: string
    sourceRow: number
    jobNumber: string
    sourceDate: string
    completedDate: string
    mechanicName: string
    model: string
    fleet: string
    customerName: string
    description: string
}

export type JobSpreadsheetCorrections = {
    fleetValues?: Readonly<Record<string, string>>
    mechanicNames?: Readonly<Record<string, string>>
}

export type JobSpreadsheetIssue = {
    severity: 'error' | 'warning'
    message: string
}

export type ResolvedJobSpreadsheetRow = JobSpreadsheetRow & {
    customer?: Customer
    equipment?: Equipment
    mechanic?: Mechanic
    effectiveFleet: string
    effectiveMechanicName: string
    issues: JobSpreadsheetIssue[]
    ready: boolean
}

function normalized(value: string | null | undefined) {
    return value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-NZ') ?? ''
}

function parseClipboardRows(source: string) {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let quoted = false
    const text = source.replace(/^\uFEFF/, '')

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index]
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                cell += '"'
                index += 1
            } else if (character === '"') quoted = false
            else cell += character
        } else if (character === '"') quoted = true
        else if (character === '\t') {
            row.push(cell)
            cell = ''
        } else if (character === '\n') {
            row.push(cell.replace(/\r$/, ''))
            if (row.some((value) => value.trim())) rows.push(row)
            row = []
            cell = ''
        } else cell += character
    }

    if (quoted) throw new Error('The pasted table contains an unterminated quoted value.')
    row.push(cell.replace(/\r$/, ''))
    if (row.some((value) => value.trim())) rows.push(row)
    return rows
}

export function parseSpreadsheetDate(value: string) {
    const trimmed = value.trim()
    const localMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
    const year = localMatch ? Number(localMatch[3]) : isoMatch ? Number(isoMatch[1]) : NaN
    const month = localMatch ? Number(localMatch[2]) : isoMatch ? Number(isoMatch[2]) : NaN
    const day = localMatch ? Number(localMatch[1]) : isoMatch ? Number(isoMatch[3]) : NaN
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return ''
    const candidate = new Date(Date.UTC(year, month - 1, day))
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return ''
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseJobSpreadsheetPaste(source: string): JobSpreadsheetRow[] {
    const rows = parseClipboardRows(source)
    if (!rows.length) throw new Error('Paste the spreadsheet header and at least one Job row.')
    const headers = rows[0].map(normalized)
    const indexes = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)]))
    const missing = REQUIRED_HEADERS.filter((header) => indexes[header] < 0)
    if (missing.length) throw new Error(`The pasted table is missing: ${missing.map((header) => header.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(', ')}.`)

    const parsed = rows.slice(1).map((values, index) => {
        const sourceRow = index + 2
        const sourceDate = values[indexes.date]?.trim() ?? ''
        return {
            id: `spreadsheet-row-${sourceRow}`,
            sourceRow,
            jobNumber: values[indexes['job number']]?.trim() ?? '',
            sourceDate,
            completedDate: parseSpreadsheetDate(sourceDate),
            mechanicName: values[indexes.mechanic]?.trim() ?? '',
            model: values[indexes.model]?.trim() ?? '',
            fleet: values[indexes.fleet]?.trim() ?? '',
            customerName: values[indexes.customer]?.trim() ?? '',
            description: values[indexes.description]?.trim() ?? '',
        }
    })
    if (!parsed.length) throw new Error('The pasted table contains no Job rows.')
    return parsed
}

function equipmentIdentifiers(equipment: Equipment) {
    return [equipment.gr_fleet, ...parseAlternateFleetNumbers(equipment.gr_alternatefleetnumbers)]
        .map(normalized)
        .filter(Boolean)
}

function sourceFleetValues(value: string) {
    return value.split(/[,/;]+/).map((part) => normalized(part)).filter(Boolean)
}

function uniqueMatch<T>(values: readonly T[]) {
    return values.length === 1 ? values[0] : undefined
}

export function resolveJobSpreadsheetRows(
    rows: readonly JobSpreadsheetRow[],
    references: {
        equipment: readonly Equipment[]
        mechanics: readonly Mechanic[]
        jobs: readonly Job[]
    },
    corrections: JobSpreadsheetCorrections = {},
): ResolvedJobSpreadsheetRow[] {
    const mechanicsByName = new Map<string, Mechanic[]>()
    references.mechanics.forEach((mechanic) => {
        const key = normalized(mechanic.gr_name)
        mechanicsByName.set(key, [...(mechanicsByName.get(key) ?? []), mechanic])
    })
    const existingNumbers = new Set(references.jobs.map((job) => normalized(job.gr_jobnumber)))
    const pastedNumberCounts = new Map<string, number>()
    rows.forEach((row) => pastedNumberCounts.set(normalized(row.jobNumber), (pastedNumberCounts.get(normalized(row.jobNumber)) ?? 0) + 1))

    return rows.map((row) => {
        const issues: JobSpreadsheetIssue[] = []
        const effectiveFleet = corrections.fleetValues?.[row.id] ?? row.fleet
        const effectiveMechanicName = corrections.mechanicNames?.[normalized(row.mechanicName)] ?? row.mechanicName
        const requestedFleetValues = sourceFleetValues(effectiveFleet)
        const equipmentMatches = references.equipment.filter((item) => {
            const identifiers = equipmentIdentifiers(item)
            return requestedFleetValues.some((fleet) => identifiers.includes(fleet))
        })
        const equipment = uniqueMatch(equipmentMatches)
        const equipmentCustomer = equipment?.gr_Site?.gr_Customer
        const customer = equipmentCustomer
        const mechanicMatches = mechanicsByName.get(normalized(effectiveMechanicName)) ?? []
        const mechanic = uniqueMatch(mechanicMatches)
        const numberKey = normalized(row.jobNumber)

        if (!/^\d+$/.test(row.jobNumber)) issues.push({ severity: 'error', message: 'Job Number must contain digits only.' })
        else if (existingNumbers.has(numberKey)) issues.push({ severity: 'error', message: `Job ${row.jobNumber} already exists.` })
        if (numberKey && (pastedNumberCounts.get(numberKey) ?? 0) > 1) issues.push({ severity: 'error', message: 'Job Number is duplicated in the pasted table.' })
        if (!row.completedDate) issues.push({ severity: 'error', message: 'Date must be a valid day/month/year.' })
        if (!row.description) issues.push({ severity: 'error', message: 'Description is required.' })
        else if (row.description.length > 4000) issues.push({ severity: 'error', message: 'Description exceeds 4,000 characters.' })

        if (!requestedFleetValues.length) issues.push({ severity: 'error', message: 'Fleet Number is missing.' })
        else if (requestedFleetValues.length > 1) issues.push({ severity: 'error', message: `${effectiveFleet} contains more than one Fleet Number; enter one Fleet Number.` })
        else if (!equipmentMatches.length) issues.push({ severity: 'error', message: `No Equipment matches ${effectiveFleet}.` })
        else if (equipmentMatches.length > 1) issues.push({ severity: 'error', message: `${effectiveFleet} matches more than one Equipment; enter one Fleet Number.` })
        else if (!equipment?.gr_Site?.gr_siteid) issues.push({ severity: 'error', message: 'Matched Equipment has no Site.' })
        else if (!equipmentCustomer) issues.push({ severity: 'error', message: 'Matched Equipment has no Customer through its Site.' })

        if (!effectiveMechanicName) issues.push({ severity: 'error', message: 'Mechanic is missing.' })
        else if (!mechanicMatches.length) issues.push({ severity: 'error', message: `Staff member ${effectiveMechanicName} was not found.` })
        else if (mechanicMatches.length > 1) issues.push({ severity: 'error', message: `Staff name ${effectiveMechanicName} is ambiguous.` })

        return {
            ...row,
            customer,
            equipment,
            mechanic,
            effectiveFleet,
            effectiveMechanicName,
            issues,
            ready: !issues.some((issue) => issue.severity === 'error'),
        }
    })
}
