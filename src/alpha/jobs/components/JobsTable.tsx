import { useMemo, useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import { JOB_TYPE_OPTIONS, getJobTypeLabel, type JobType } from '../types/jobType.types'
import {
    JOB_STATUS_OPTIONS,
    JOB_STATUS_PRIORITY,
    type JobStatus,
} from '../types/jobStatus.types'
import './JobsTable.css'
import { getJobCardStatus, JOB_CARD_STATUSES } from '../types/jobCardStatus.types'
import { JOB_NUMBER_REQUIRED_EMAIL_MESSAGE, jobHasEmailableJobNumber } from '../services/jobEmailRules'

type Props = {
    jobs: Job[]
    visibleStatuses: JobStatus[]
    onToggleStatus: (status: JobStatus) => void
    onStatusChange: (jobId: string, status: JobStatus) => void
    onJobFieldsChange: (
        jobId: string,
        fields: {
            gr_jobnumber?: string
            gr_description?: string
            gr_ordernumber?: string
            'gr_Mechanic@odata.bind'?: string | null
        }
    ) => void
    onEmailJob: (job: Job) => Promise<void>
    onEditJob: (job: Job) => void
    mechanics: Mechanic[]
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
    onEditJob,
    mechanics,
}: Props) {
    const [searchText, setSearchText] = useState('')
    const [selectedJobType, setSelectedJobType] = useState<JobType | 'all'>('all')
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
    const [sendingJobId, setSendingJobId] = useState<string | null>(null)
    const [copyFeedback, setCopyFeedback] = useState<{
        message: string
        isError: boolean
    } | null>(null)
    const [sort, setSort] = useState<{
        column: 'created' | 'status'
        direction: 'ascending' | 'descending'
    }>({ column: 'status', direction: 'ascending' })

    const sendJobEmail = async (job: Job) => {
        if (!jobHasEmailableJobNumber(job)) {
            window.alert(JOB_NUMBER_REQUIRED_EMAIL_MESSAGE)
            return
        }

        setSendingJobId(job.gr_jobid)
        try {
            await onEmailJob(job)
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'The email flow did not complete.')
        } finally {
            setSendingJobId(null)
        }
    }

    const jobsForSelectedType = useMemo(() => {
        if (selectedJobType === 'all') return jobs
        return jobs.filter((job) => job.gr_jobtype === selectedJobType)
    }, [jobs, selectedJobType])

    const matchingJobs = useMemo(() => {
        const search = searchText.trim().toLowerCase()

        if (!search) return jobsForSelectedType

        return jobsForSelectedType.filter((job) => {
            const statusLabel = JOB_STATUS_OPTIONS.find((status) => status.value === job.gr_status)?.label
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
    }, [jobsForSelectedType, searchText])

    const sortedJobs = useMemo(() => {
        return [...matchingJobs].sort((firstJob, secondJob) => {
            if (sort.column === 'status') {
                const statusDifference =
                    JOB_STATUS_PRIORITY[firstJob.gr_status] -
                    JOB_STATUS_PRIORITY[secondJob.gr_status]

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

    const spreadsheetCell = (value?: string | null) =>
        (value ?? '').replace(/[\t\r\n]+/g, ' ').trim()

    const copyJobRow = async (job: Job) => {
        const addressParts = spreadsheetCell(job.gr_Site?.gr_address)
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        const siteAddress = addressParts[0] ?? ''
        const siteSuburb = addressParts[1] ?? ''
        const siteCity = addressParts.slice(2).join(', ')
        const spreadsheetRow = [
            job.gr_Mechanic?.gr_name,
            job.gr_Equipment?.gr_model,
            job.gr_Equipment?.gr_fleet,
            job.gr_Site?.gr_Customer?.gr_name,
            job.gr_description,
            siteAddress,
            siteSuburb,
            siteCity,
            job.gr_ordernumber,
        ].map(spreadsheetCell).join('\t')

        try {
            await navigator.clipboard.writeText(spreadsheetRow)
            setSelectedRowId(job.gr_jobid)
            setCopyFeedback({
                message: `Job ${job.gr_jobnumber || 'row'} copied — paste it into the job book.`,
                isError: false,
            })
        } catch (error) {
            console.error(error)
            setCopyFeedback({
                message: 'The row could not be copied. Check clipboard permission and try again.',
                isError: true,
            })
        }

        window.setTimeout(() => setCopyFeedback(null), 2600)
    }

    const isInteractiveTarget = (target: EventTarget | null) =>
        target instanceof Element && Boolean(
            target.closest('button, input, select, textarea, a, label'),
        )

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
                        {searchText.trim()
                            ? `${matchingJobs.length} of ${jobsForSelectedType.length}`
                            : `${jobsForSelectedType.length} shown`}
                    </span>
                </div>
            </div>

            <div className="jobs-filter-bar">
                <div className="jobs-type-tabs" role="tablist" aria-label="Filter jobs by type">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={selectedJobType === 'all'}
                        className={selectedJobType === 'all' ? 'jobs-type-tab active' : 'jobs-type-tab'}
                        onClick={() => setSelectedJobType('all')}
                    >
                        All jobs
                    </button>
                    {JOB_TYPE_OPTIONS.map((jobType) => (
                        <button
                            key={jobType.value}
                            type="button"
                            role="tab"
                            aria-selected={selectedJobType === jobType.value}
                            className={selectedJobType === jobType.value ? 'jobs-type-tab active' : 'jobs-type-tab'}
                            onClick={() => setSelectedJobType(jobType.value)}
                        >
                            {jobType.label}
                        </button>
                    ))}
                </div>

                <div className="jobs-list-toolbar" aria-label="Filter jobs by status">
                    <span>Status</span>
                    {JOB_STATUS_OPTIONS.map((status) => {
                        const isActive = visibleStatuses.includes(status.value)
                        return (
                            <button
                                key={status.value}
                                type="button"
                                data-status={status.value}
                                className={isActive ? 'status-filter active' : 'status-filter'}
                                aria-pressed={isActive}
                                onClick={() => onToggleStatus(status.value)}
                            >
                                {status.label}
                            </button>
                        )
                    })}
                </div>
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

                        {sortedJobs.map((job) => {
                            const assignmentStatus = getJobCardStatus(job.gr_jobcardstatus)
                            const isSending = sendingJobId === job.gr_jobid
                            const hasJobNumber = jobHasEmailableJobNumber(job)
                            const assignmentLabel = !job.gr_Mechanic
                                ? 'Email'
                                : assignmentStatus === JOB_CARD_STATUSES.NOT_SENT
                                    ? 'Email'
                                    : assignmentStatus === JOB_CARD_STATUSES.SENT
                                        ? '✓ Sent'
                                        : assignmentStatus === JOB_CARD_STATUSES.SUBMITTED
                                            ? 'Submitted'
                                            : 'Closed'

                            return (
                            <tr
                                key={job.gr_jobid}
                                data-status={job.gr_status}
                                data-selected={selectedRowId === job.gr_jobid ? 'true' : undefined}
                                tabIndex={0}
                                title="Click the row to copy it for the job book"
                                onClick={(event) => {
                                    if (!isInteractiveTarget(event.target)) void copyJobRow(job)
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && event.target === event.currentTarget) {
                                        void copyJobRow(job)
                                    }
                                }}
                            >
                                <td>
                                    <input
                                        key={`${job.gr_jobid}-number-${job.gr_jobnumber}`}
                                        className="jobs-table-inline jobs-table-job-number"
                                        type="text"
                                        aria-label="Job number"
                                        defaultValue={job.gr_jobnumber ?? ''}
                                        onBlur={(event) => {
                                            const newValue = event.target.value.trim()
                                            if (newValue !== (job.gr_jobnumber ?? '')) {
                                                onJobFieldsChange(job.gr_jobid, { gr_jobnumber: newValue })
                                            }
                                        }}
                                    />
                                </td>

                                <td className="jobs-table-date">
                                    {createdDateFormatter.format(new Date(job.createdon))}
                                </td>

                                <td>
                                    <span className="job-type-pill" data-job-type={job.gr_jobtype ?? ''}>
                                        {getJobTypeLabel(job.gr_jobtype)}
                                    </span>
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
                                        key={`${job.gr_jobid}-description-${job.gr_description}`}
                                        className="jobs-table-inline jobs-table-description"
                                        aria-label="Job description"
                                        defaultValue={job.gr_description ?? ''}
                                        rows={2}
                                        onBlur={(event) => {
                                            const newValue = event.target.value.trim()
                                            if (newValue !== (job.gr_description ?? '')) {
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
                                        onChange={async (event) => {
                                            try { await onStatusChange(job.gr_jobid, Number(event.target.value) as JobStatus) }
                                            catch (error) { window.alert(error instanceof Error ? error.message : 'The job status could not be updated.') }
                                        }}
                                    >
                                        {JOB_STATUS_OPTIONS.map((status) => (
                                            <option key={status.value} value={status.value}>{status.label}</option>
                                        ))}
                                    </select>
                                </td>

                                <td>
                                    <input
                                        key={`${job.gr_jobid}-order-${job.gr_ordernumber}`}
                                        className="jobs-table-inline jobs-table-order"
                                        type="text"
                                        aria-label="Order number"
                                        placeholder="—"
                                        defaultValue={job.gr_ordernumber ?? ''}
                                        onBlur={(event) => {
                                            const newValue = event.target.value.trim()
                                            if (newValue !== (job.gr_ordernumber ?? '')) {
                                                onJobFieldsChange(job.gr_jobid, { gr_ordernumber: newValue })
                                            }
                                        }}
                                    />
                                </td>

                                <td>
                                    <div className="jobs-table-actions">
                                        <button
                                            className="jobs-table-action"
                                            type="button"
                                            onClick={() => onEditJob(job)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className={'jobs-table-action jobs-email-action status-' + assignmentStatus}
                                            type="button"
                                            title={!hasJobNumber
                                                ? JOB_NUMBER_REQUIRED_EMAIL_MESSAGE
                                                : job.gr_Mechanic
                                                ? assignmentStatus === JOB_CARD_STATUSES.NOT_SENT
                                                    ? `Send this job to ${job.gr_Mechanic.gr_name} through Power Automate.`
                                                    : `${assignmentLabel} to ${job.gr_Mechanic.gr_name}.`
                                                : 'Assign a technician before emailing this job.'}
                                            aria-label={`${assignmentLabel} job to technician`}
                                            onClick={() => void sendJobEmail(job)}
                                            disabled={isSending || !hasJobNumber || !job.gr_Mechanic || assignmentStatus !== JOB_CARD_STATUSES.NOT_SENT}
                                        >
                                            {isSending ? 'Sending...' : assignmentLabel}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {copyFeedback && (
                <div
                    className={copyFeedback.isError ? 'jobs-copy-feedback error' : 'jobs-copy-feedback'}
                    role="status"
                >
                    {copyFeedback.message}
                </div>
            )}

        </section>
    )
}
