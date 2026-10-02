import { newZealandDateOnly } from '../shared/dates/dateOnly.ts'
import type { Job } from '../jobs/types/job.types.ts'
import { JOB_STATUSES } from '../jobs/types/jobStatus.types.ts'
import { getJobTypeLabel } from '../jobs/types/jobType.types.ts'

export type CustomerJobStatusFilter = 'all' | 'open' | 'closed'
export type CustomerJobDateField = 'created' | 'completed'

export type CustomerJobFilters = {
    status: CustomerJobStatusFilter
    dateField: CustomerJobDateField
    from: string
    to: string
    search: string
}

export type FleetCostCentres = Readonly<Record<string, string>>

export const DEFAULT_CUSTOMER_JOB_FILTERS: CustomerJobFilters = {
    status: 'all',
    dateField: 'created',
    from: '',
    to: '',
    search: '',
}

function dateForFilter(job: Job, field: CustomerJobDateField) {
    return field === 'completed'
        ? job.gr_completeddate?.slice(0, 10) ?? ''
        : newZealandDateOnly(job.createdon)
}

export function filterCustomerJobs(jobs: readonly Job[], filters: CustomerJobFilters) {
    const search = filters.search.trim().toLocaleLowerCase('en-NZ')
    return jobs.filter((job) => {
        if (filters.status === 'open' && job.gr_status === JOB_STATUSES.COMPLETE) return false
        if (filters.status === 'closed' && job.gr_status !== JOB_STATUSES.COMPLETE) return false

        const filterDate = dateForFilter(job, filters.dateField)
        if (filters.from && (!filterDate || filterDate < filters.from)) return false
        if (filters.to && (!filterDate || filterDate > filters.to)) return false
        if (!search) return true

        return [
            job.gr_jobnumber,
            job.gr_description,
            job.gr_ordernumber,
            job.gr_Site?.gr_name,
            job.gr_Equipment?.gr_fleet,
            job.gr_Equipment?.gr_serial,
            job.gr_Mechanic?.gr_name,
        ].some((value) => value?.toLocaleLowerCase('en-NZ').includes(search))
    }).sort((a, b) => {
        const left = dateForFilter(a, filters.dateField)
        const right = dateForFilter(b, filters.dateField)
        return right.localeCompare(left) || b.createdon.localeCompare(a.createdon)
    })
}

export function previousCalendarMonth(today: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today)
    if (!match) return { from: '', to: '' }
    const year = Number(match[1])
    const month = Number(match[2])
    const previousMonth = month === 1 ? 12 : month - 1
    const previousYear = month === 1 ? year - 1 : year
    const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate()
    const monthText = String(previousMonth).padStart(2, '0')
    return {
        from: `${previousYear}-${monthText}-01`,
        to: `${previousYear}-${monthText}-${String(lastDay).padStart(2, '0')}`,
    }
}

function csvCell(value: unknown) {
    const raw = value == null ? '' : String(value)
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
}

function normalizedFleet(value: string | null | undefined) {
    return value?.trim().toLocaleUpperCase('en-NZ') ?? ''
}

function parseCsvRows(source: string) {
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
        else if (character === ',') {
            row.push(cell)
            cell = ''
        } else if (character === '\n') {
            row.push(cell.replace(/\r$/, ''))
            if (row.some((value) => value.trim())) rows.push(row)
            row = []
            cell = ''
        } else cell += character
    }

    if (quoted) throw new Error('The Cost Centre CSV contains an unterminated quoted value.')
    row.push(cell.replace(/\r$/, ''))
    if (row.some((value) => value.trim())) rows.push(row)
    return rows
}

export function parseFleetCostCentresCsv(source: string): FleetCostCentres {
    const rows = parseCsvRows(source)
    if (!rows.length) throw new Error('The Cost Centre CSV is empty.')

    const headers = rows[0].map((value) => value.trim().toLocaleLowerCase('en-NZ'))
    const fleetIndex = headers.indexOf('fleet')
    const costCentreIndex = headers.indexOf('cost centre')
    if (fleetIndex < 0 || costCentreIndex < 0) {
        throw new Error('The Cost Centre CSV must contain Fleet and Cost Centre columns.')
    }

    const costCentres: Record<string, string> = {}
    rows.slice(1).forEach((values, rowIndex) => {
        const fleet = normalizedFleet(values[fleetIndex])
        const costCentre = values[costCentreIndex]?.trim() ?? ''
        if (!fleet || !costCentre) {
            throw new Error(`Cost Centre CSV row ${rowIndex + 2} must contain both Fleet and Cost Centre.`)
        }
        const existing = costCentres[fleet]
        if (existing && existing.toLocaleLowerCase('en-NZ') !== costCentre.toLocaleLowerCase('en-NZ')) {
            throw new Error(`Fleet ${fleet} has conflicting Cost Centre values.`)
        }
        costCentres[fleet] = existing ?? costCentre
    })

    if (!Object.keys(costCentres).length) throw new Error('The Cost Centre CSV contains no Fleet mappings.')
    return costCentres
}

export function customerJobsCsv(jobs: readonly Job[], costCentres: FleetCostCentres = {}) {
    const headers = [
        'Job Number',
        'Job Type',
        'Fleet Number',
        'Cost Centre',
        'Make',
        'Model',
        'Serial Number',
        'Description',
        'Technician',
        'Order Number',
        'Hour Meter',
        'Subtotal (excl GST)',
    ]
    const rows = jobs.map((job) => [
        job.gr_jobnumber,
        getJobTypeLabel(job.gr_jobtype),
        job.gr_Equipment?.gr_fleet,
        costCentres[normalizedFleet(job.gr_Equipment?.gr_fleet)] ?? '',
        job.gr_Equipment?.gr_make,
        job.gr_Equipment?.gr_model,
        job.gr_Equipment?.gr_serial,
        job.gr_description,
        job.gr_Mechanic?.gr_name,
        job.gr_ordernumber,
        job.gr_hourmeter,
        '',
    ].map(csvCell).join(','))
    return `\uFEFF${headers.map(csvCell).join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`
}
