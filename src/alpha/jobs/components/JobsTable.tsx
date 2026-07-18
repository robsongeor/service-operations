import { useMemo, useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import { getJobTypeLabel } from '../types/jobType.types'
import './JobsTable.css'

type Props = {
    jobs: Job[]
    visibleStatuses: number[]
    onToggleStatus: (status: number) => void
    onStatusChange: (jobId: string, status: number) => void
    onJobFieldsChange: (
        jobId: string,
        fields: {
            gr_jobnumber?: string
            gr_description?: string
            gr_ordernumber?: string
            'gr_Mechanic@odata.bind'?: string | null
        }
    ) => void
    onEmailJob: (job: Job) => void
    mechanics: Mechanic[]
}

const statusOptions = [
    { label: 'Unallocated', value: 122830001 },
    { label: 'Allocated', value: 122830000 },
    { label: 'Waiting for parts', value: 122830002 },
    { label: 'Complete', value: 122830003 },
]

const statusPriority: Record<number, number> = {
    122830003: 0, // Complete
    122830002: 1, // Waiting for parts
    122830000: 2, // Allocated
    122830001: 3, // Unallocated
}

const createdDateFormatter = new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
})

export default function JobsTable({
    jobs,
    visibleStatuses,
    onToggleStatus,
    onStatusChange,
    onJobFieldsChange,
    onEmailJob,
    mechanics,
}: Props) {
    const [searchText, setSearchText] = useState('')
    const [sort, setSort] = useState<{
        column: 'created' | 'status'
        direction: 'ascending' | 'descending'
    }>({ column: 'status', direction: 'ascending' })

    const matchingJobs = useMemo(() => {
        const search = searchText.trim().toLowerCase()

        if (!search) return jobs

        return jobs.filter((job) => {
            const statusLabel = statusOptions.find((status) => status.value === job.gr_status)?.label
            const searchableText = [
                job.gr_jobnumber,
                job.gr_ordernumber,
                job.gr_description,
                getJobTypeLabel(job.gr_jobtype),
                statusLabel,
                createdDateFormatter.format(new Date(job.createdon)),
                job.gr_Equipment?.gr_fleet,
                job.gr_Equipment?.gr_serial,
                job.gr_Equipment?.gr_make,
                job.gr_Equipment?.gr_model,
                job.gr_Site?.gr_Customer?.gr_name,
                job.gr_Site?.gr_name,
                job.gr_Site?.gr_address,
                job.gr_Contact?.gr_name,
                job.gr_Contact?.gr_phone,
                job.gr_Contact?.gr_email,
                job.gr_Mechanic?.gr_name,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()

            return searchableText.includes(search)
        })
    }, [jobs, searchText])

    const sortedJobs = useMemo(() => {
        return [...matchingJobs].sort((firstJob, secondJob) => {
            if (sort.column === 'status') {
                const statusDifference =
                    (statusPriority[firstJob.gr_status] ?? Number.MAX_SAFE_INTEGER) -
                    (statusPriority[secondJob.gr_status] ?? Number.MAX_SAFE_INTEGER)

                if (statusDifference !== 0) {
                    return sort.direction === 'ascending' ? statusDifference : -statusDifference
                }
            }

            const dateDifference =
                new Date(firstJob.createdon).getTime() -
                new Date(secondJob.createdon).getTime()

            return sort.direction === 'ascending' && sort.column === 'created'
                ? dateDifference
                : -dateDifference
        })
    }, [matchingJobs, sort])

    const toggleSort = (column: 'created' | 'status') => {
        setSort((current) => {
            if (current.column !== column) {
                return {
                    column,
                    direction: column === 'created' ? 'descending' : 'ascending',
                }
            }

            return {
                column,
                direction: current.direction === 'ascending' ? 'descending' : 'ascending',
            }
        })
    }

    return (
        <section className="jobs-list-card">
            <div className="jobs-list-header">
                <div>
                    <p className="jobs-list-eyebrow">Operations</p>
                    <h2>Jobs</h2>
                </div>
                <div className="jobs-list-header-actions">
                    <label className="jobs-list-search">
                        <span className="jobs-visually-hidden">Search jobs</span>
                        <input
                            type="search"
                            placeholder="Search jobs..."
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                        />
                    </label>
                    <span className="jobs-list-count">
                        {searchText.trim() ? `${matchingJobs.length} of ${jobs.length}` : `${jobs.length} shown`}
                    </span>
                </div>
            </div>

            <div className="jobs-list-toolbar" aria-label="Filter jobs by status">
                <span>Show</span>
                {statusOptions.map((status) => {
                    const isActive = visibleStatuses.includes(status.value)
                    return (
                        <button
                            key={status.value}
                            type="button"
                            className={isActive ? 'status-filter active' : 'status-filter'}
                            aria-pressed={isActive}
                            onClick={() => onToggleStatus(status.value)}
                        >
                            {status.label}
                        </button>
                    )
                })}
            </div>

            <div className="jobs-table-scroll">
                <table className="jobs-table">
                    <thead>
                        <tr>
                            <th>Job</th>
                            <th aria-sort={sort.column === 'created' ? sort.direction : 'none'}>
                                <button
                                    type="button"
                                    className="jobs-table-sort"
                                    onClick={() => toggleSort('created')}
                                    title="Sort by created date"
                                >
                                    Created
                                    <span aria-hidden="true">
                                        {sort.column === 'created'
                                            ? sort.direction === 'descending' ? '↓' : '↑'
                                            : '↕'}
                                    </span>
                                </button>
                            </th>
                            <th>Type</th>
                            <th>Equipment</th>
                            <th>Customer / site</th>
                            <th>Description</th>
                            <th>Contact</th>
                            <th>Mechanic</th>
                            <th aria-sort={sort.column === 'status' ? sort.direction : 'none'}>
                                <button
                                    type="button"
                                    className="jobs-table-sort"
                                    onClick={() => toggleSort('status')}
                                    title="Sort by status priority"
                                >
                                    Status
                                    <span aria-hidden="true">
                                        {sort.column === 'status'
                                            ? sort.direction === 'ascending' ? '↓' : '↑'
                                            : '↕'}
                                    </span>
                                </button>
                            </th>
                            <th>Order</th>
                            <th aria-label="Actions" />
                        </tr>
                    </thead>

                    <tbody>
                        {matchingJobs.length === 0 && (
                            <tr>
                                <td colSpan={11} className="jobs-table-empty">
                                    {searchText.trim() ? 'No jobs match your search.' : 'No jobs match the selected filters.'}
                                </td>
                            </tr>
                        )}

                        {sortedJobs.map((job) => (
                            <tr key={job.gr_jobid}>
                                <td>
                                    <input
                                        className="jobs-table-inline jobs-table-job-number"
                                        type="text"
                                        aria-label="Job number"
                                        defaultValue={job.gr_jobnumber}
                                        onBlur={(event) => {
                                            const newValue = event.target.value.trim()
                                            if (newValue !== job.gr_jobnumber) {
                                                onJobFieldsChange(job.gr_jobid, { gr_jobnumber: newValue })
                                            }
                                        }}
                                    />
                                </td>

                                <td className="jobs-table-date">
                                    {createdDateFormatter.format(new Date(job.createdon))}
                                </td>

                                <td>
                                    <span className="job-type-pill">{getJobTypeLabel(job.gr_jobtype)}</span>
                                </td>

                                <td>
                                    {job.gr_Equipment ? (
                                        <div className="jobs-table-summary">
                                            <strong>{job.gr_Equipment.gr_fleet || 'No fleet number'}</strong>
                                            <span>{job.gr_Equipment.gr_make} {job.gr_Equipment.gr_model}</span>
                                            <small>{job.gr_Equipment.gr_serial}</small>
                                        </div>
                                    ) : <span className="jobs-table-muted">None</span>}
                                </td>

                                <td>
                                    {job.gr_Site ? (
                                        <div className="jobs-table-summary">
                                            <strong>{job.gr_Site.gr_Customer?.gr_name ?? 'Unknown customer'}</strong>
                                            <span>{job.gr_Site.gr_name}</span>
                                            <small>{job.gr_Site.gr_address}</small>
                                        </div>
                                    ) : <span className="jobs-table-muted">No site</span>}
                                </td>

                                <td>
                                    <textarea
                                        className="jobs-table-inline jobs-table-description"
                                        aria-label="Job description"
                                        defaultValue={job.gr_description}
                                        rows={2}
                                        onBlur={(event) => {
                                            const newValue = event.target.value.trim()
                                            if (newValue !== job.gr_description) {
                                                onJobFieldsChange(job.gr_jobid, { gr_description: newValue })
                                            }
                                        }}
                                    />
                                </td>

                                <td>
                                    {job.gr_Contact ? (
                                        <div className="jobs-table-summary">
                                            <strong>{job.gr_Contact.gr_name}</strong>
                                            <span>{job.gr_Contact.gr_phone || 'No phone'}</span>
                                        </div>
                                    ) : <span className="jobs-table-muted">None</span>}
                                </td>

                                <td>
                                    <select
                                        className="jobs-table-select"
                                        aria-label="Assigned mechanic"
                                        value={job.gr_Mechanic?.gr_mechanicid ?? ''}
                                        onChange={(event) => {
                                            const mechanicId = event.target.value
                                            onJobFieldsChange(job.gr_jobid, {
                                                'gr_Mechanic@odata.bind': mechanicId
                                                    ? `/gr_mechanics(${mechanicId})`
                                                    : null,
                                            })
                                        }}
                                    >
                                        <option value="">Unassigned</option>
                                        {mechanics.map((mechanic) => (
                                            <option key={mechanic.gr_mechanicid} value={mechanic.gr_mechanicid}>
                                                {mechanic.gr_name}
                                            </option>
                                        ))}
                                    </select>
                                </td>

                                <td>
                                    <select
                                        className="jobs-table-select jobs-table-status"
                                        data-status={job.gr_status}
                                        aria-label="Job status"
                                        value={job.gr_status}
                                        onChange={(event) => onStatusChange(job.gr_jobid, Number(event.target.value))}
                                    >
                                        {statusOptions.map((status) => (
                                            <option key={status.value} value={status.value}>{status.label}</option>
                                        ))}
                                    </select>
                                </td>

                                <td>
                                    <input
                                        className="jobs-table-inline jobs-table-order"
                                        type="text"
                                        aria-label="Order number"
                                        placeholder="—"
                                        defaultValue={job.gr_ordernumber}
                                        onBlur={(event) => {
                                            const newValue = event.target.value.trim()
                                            if (newValue !== job.gr_ordernumber) {
                                                onJobFieldsChange(job.gr_jobid, { gr_ordernumber: newValue })
                                            }
                                        }}
                                    />
                                </td>

                                <td>
                                    <button
                                        className="jobs-table-action"
                                        type="button"
                                        title={job.gr_Mechanic ? 'Email job to mechanic' : 'Assign a mechanic first'}
                                        aria-label="Email job to mechanic"
                                        onClick={() => onEmailJob(job)}
                                        disabled={!job.gr_Mechanic}
                                    >
                                        Email
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
