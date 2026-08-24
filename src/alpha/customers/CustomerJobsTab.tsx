import { useMemo, useState } from 'react'
import { currentNewZealandDateOnly, newZealandDateOnly } from '../shared/dates/dateOnly'
import type { Job } from '../jobs/types/job.types'
import { JOB_STATUS_OPTIONS } from '../jobs/types/jobStatus.types'
import { getJobTypeLabel } from '../jobs/types/jobType.types'
import {
    customerJobsCsv,
    DEFAULT_CUSTOMER_JOB_FILTERS,
    filterCustomerJobs,
    previousCalendarMonth,
    type CustomerJobDateField,
    type CustomerJobStatusFilter,
} from './customerJobs'

type Props = {
    customerName: string
    jobs: Job[]
    isLoading: boolean
    error: string
    onOpenJob: (job: Job) => void
}

const displayDate = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeZone: 'Pacific/Auckland' })

function formatDate(value?: string | null) {
    if (!value) return '—'
    const dateOnly = value.slice(0, 10)
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly)
    if (!match) return '—'
    return displayDate.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))))
}

function safeFilePart(value: string) {
    return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'customer'
}

export default function CustomerJobsTab({ customerName, jobs, isLoading, error, onOpenJob }: Props) {
    const [filters, setFilters] = useState(DEFAULT_CUSTOMER_JOB_FILTERS)
    const [feedback, setFeedback] = useState('')
    const filteredJobs = useMemo(() => filterCustomerJobs(jobs, filters), [filters, jobs])

    const updateFilter = (field: 'status' | 'dateField' | 'from' | 'to' | 'search', value: string) => {
        setFilters((current) => ({ ...current, [field]: value }))
        setFeedback('')
    }

    const showClosedLastMonth = () => {
        const range = previousCalendarMonth(currentNewZealandDateOnly())
        setFilters({ status: 'closed', dateField: 'completed', from: range.from, to: range.to, search: '' })
        setFeedback('')
    }

    const exportCsv = () => {
        if (!filteredJobs.length) return
        const blob = new Blob([customerJobsCsv(filteredJobs)], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const range = filters.from || filters.to ? `-${filters.from || 'start'}-to-${filters.to || 'end'}` : ''
        link.download = `${safeFilePart(customerName)}-jobs${range}.csv`
        link.click()
        URL.revokeObjectURL(url)
        setFeedback(`${filteredJobs.length} filtered ${filteredJobs.length === 1 ? 'Job was' : 'Jobs were'} sent to your browser downloads.`)
    }

    return <section className="customer-jobs-panel" role="tabpanel">
        <header>
            <div><span>Customer history</span><h3>Jobs</h3></div>
            <strong>{filteredJobs.length} of {jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'}</strong>
        </header>

        <div className="customer-jobs-toolbar">
            <label className="customer-jobs-search">Search Jobs
                <input
                    type="search"
                    value={filters.search}
                    placeholder="Job, Equipment, Site, technician..."
                    onChange={(event) => updateFilter('search', event.target.value)}
                />
            </label>
            <label>Status
                <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value as CustomerJobStatusFilter)}>
                    <option value="all">All Jobs</option>
                    <option value="open">Open Jobs</option>
                    <option value="closed">Closed Jobs</option>
                </select>
            </label>
            <label>Date field
                <select value={filters.dateField} onChange={(event) => updateFilter('dateField', event.target.value as CustomerJobDateField)}>
                    <option value="created">Created date</option>
                    <option value="completed">Completed date</option>
                </select>
            </label>
            <label>From
                <input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => updateFilter('from', event.target.value)} />
            </label>
            <label>To
                <input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilter('to', event.target.value)} />
            </label>
            <div className="customer-jobs-toolbar-actions">
                <button type="button" onClick={showClosedLastMonth}>Closed last month</button>
                <button type="button" onClick={() => { setFilters(DEFAULT_CUSTOMER_JOB_FILTERS); setFeedback('') }}>Clear filters</button>
                <button type="button" className="primary" disabled={!filteredJobs.length} onClick={exportCsv}>Export filtered CSV</button>
            </div>
        </div>

        {feedback && <p className="customer-jobs-feedback" role="status">{feedback}</p>}
        {isLoading ? <div className="customer-workspace-state">Loading Customer Jobs...</div>
            : error ? <div className="customer-workspace-state error" role="alert">Jobs could not be loaded. {error}</div>
                : filteredJobs.length === 0 ? <div className="customer-jobs-empty">No Jobs match the current filters.</div>
                    : <div className="customer-jobs-table-wrap">
                        <table className="customer-jobs-table">
                            <thead><tr>
                                <th>Job</th><th>Status</th><th>Type</th><th>Created</th><th>Completed</th><th>Site</th><th>Equipment</th><th>Description</th><th>Technician</th><th>Order</th>
                            </tr></thead>
                            <tbody>{filteredJobs.map((job) => {
                                const status = JOB_STATUS_OPTIONS.find((item) => item.value === job.gr_status)?.label ?? 'Unknown'
                                return <tr key={job.gr_jobid} tabIndex={0} onClick={() => onOpenJob(job)} onKeyDown={(event) => { if (event.key === 'Enter') onOpenJob(job) }}>
                                    <td><strong>{job.gr_jobnumber || 'No Job Number'}</strong></td>
                                    <td><span className="customer-job-status" data-status={job.gr_status}>{status}</span></td>
                                    <td>{getJobTypeLabel(job.gr_jobtype)}</td>
                                    <td>{formatDate(newZealandDateOnly(job.createdon))}</td>
                                    <td>{formatDate(job.gr_completeddate)}</td>
                                    <td><strong>{job.gr_Site?.gr_name || 'No Site'}</strong><small>{job.gr_Site?.gr_address}</small></td>
                                    <td><strong>{job.gr_Equipment?.gr_fleet || 'No Equipment'}</strong><small>{[job.gr_Equipment?.gr_make, job.gr_Equipment?.gr_model].filter(Boolean).join(' ')}</small></td>
                                    <td className="description" title={job.gr_description || undefined}>{job.gr_description || '—'}</td>
                                    <td>{job.gr_Mechanic?.gr_name || 'Unallocated'}</td>
                                    <td>{job.gr_ordernumber || '—'}</td>
                                </tr>
                            })}</tbody>
                        </table>
                    </div>}
    </section>
}
