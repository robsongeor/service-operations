import { newZealandDateOnly } from '../shared/dates/dateOnly.ts'
import type { Job } from '../jobs/types/job.types.ts'
import { JOB_STATUS_OPTIONS, JOB_STATUSES } from '../jobs/types/jobStatus.types.ts'
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

export function customerJobsCsv(jobs: readonly Job[]) {
    const headers = [
        'Job Number',
        'Status',
        'Job Type',
        'Created Date',
        'Completed Date',
        'Site',
        'Site Address',
        'Fleet Number',
        'Make',
        'Model',
        'Serial Number',
        'Description',
        'Technician',
        'Order Number',
        'Hour Meter',
    ]
    const rows = jobs.map((job) => [
        job.gr_jobnumber,
        JOB_STATUS_OPTIONS.find((status) => status.value === job.gr_status)?.label ?? 'Unknown',
        getJobTypeLabel(job.gr_jobtype),
        newZealandDateOnly(job.createdon),
        job.gr_completeddate?.slice(0, 10) ?? '',
        job.gr_Site?.gr_name,
        job.gr_Site?.gr_address,
        job.gr_Equipment?.gr_fleet,
        job.gr_Equipment?.gr_make,
        job.gr_Equipment?.gr_model,
        job.gr_Equipment?.gr_serial,
        job.gr_description,
        job.gr_Mechanic?.gr_name,
        job.gr_ordernumber,
        job.gr_hourmeter,
    ].map(csvCell).join(','))
    return `\uFEFF${headers.map(csvCell).join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`
}
