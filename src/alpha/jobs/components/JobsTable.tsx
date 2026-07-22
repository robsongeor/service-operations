import { useMemo, useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import { JOB_TYPE_OPTIONS, getJobTypeLabel } from '../types/jobType.types'
import {
    JOB_STATUS_OPTIONS,
    JOB_STATUS_PRIORITY,
    type JobStatus,
} from '../types/jobStatus.types'
import './JobsTable.css'
import { getOfficeActionLabel, jobNeedsOfficeAttention, type JobOfficeUpdate } from '../types/officeAction.types'
import type { JobsViewState } from '../types/jobsViewState.types'
import type { JobScheduleOption } from '../types/jobSchedule.types'
import { jobMatchesScheduledVisibility } from '../utils/scheduledJobsVisibility'
import SearchableMechanicSelect from './SearchableMechanicSelect'
import JobsTableSortIcon from './JobsTableSortIcon'
import {
    buildMailtoUrl,
    buildTechnicianEmailBody,
    buildTechnicianEmailSubject,
    isValidTechnicianEmail,
} from '../utils/technicianMailto'

type Props = {
    jobs: Job[]
    visibleStatuses: JobStatus[]
    viewState: JobsViewState
    onViewStateChange: (state: JobsViewState) => void
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
    ) => Promise<void>
    onEditJob: (job: Job) => void
    mechanics: Mechanic[]
    officeUpdates: JobOfficeUpdate[]
    scheduleOptions: JobScheduleOption[]
}

const createdDateFormatter = new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
})

export default function JobsTable({
    jobs,
    visibleStatuses,
    viewState,
    onViewStateChange,
    onToggleStatus,
    onStatusChange,
    onJobFieldsChange,
    onEditJob,
    mechanics,
    officeUpdates,
    scheduleOptions,
}: Props) {
    const { searchText, selectedJobType, officeAttentionFilter, scheduledJobsVisibility, sort } = viewState
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
    const [openMechanicJobId, setOpenMechanicJobId] = useState<string | null>(null)
    const [savingMechanicJobId, setSavingMechanicJobId] = useState<string | null>(null)
    const [copyFeedback, setCopyFeedback] = useState<{
        message: string
        isError: boolean
    } | null>(null)
    const latestOfficeUpdates = useMemo(() => officeUpdates.reduce<Record<string, JobOfficeUpdate>>((current, update) => {
        if (!current[update.jobId] || current[update.jobId].createdAt < update.createdAt) current[update.jobId] = update
        return current
    }, {}), [officeUpdates])

    const jobsForSelectedType = useMemo(() => jobs.filter((job) => {
        if (selectedJobType !== 'all' && job.gr_jobtype !== selectedJobType) return false
        if (!jobMatchesScheduledVisibility(job.gr_jobid, scheduleOptions, scheduledJobsVisibility)) return false
        const needsAttention = jobNeedsOfficeAttention(job)
        const matchesOfficeActionFilter = officeAttentionFilter === 'all'
            ? true
            : officeAttentionFilter === 'required'
                ? needsAttention
                : !needsAttention
        return matchesOfficeActionFilter
    }), [jobs, officeAttentionFilter, scheduleOptions, scheduledJobsVisibility, selectedJobType])

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
                getOfficeActionLabel(job.gr_currentofficeaction ?? undefined),
                job.gr_officeactionowner,
                latestOfficeUpdates[job.gr_jobid]?.text,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()

            return searchableText.includes(search)
        })
    }, [jobsForSelectedType, latestOfficeUpdates, searchText])

    const sortedJobs = useMemo(() => {
        const collator = new Intl.Collator('en-NZ', { sensitivity: 'base', numeric: true })
        const compareText = (first?: string | null, second?: string | null) => {
            const firstValue = first?.trim() ?? ''
            const secondValue = second?.trim() ?? ''
            if (!firstValue && !secondValue) return 0
            if (!firstValue) return 1
            if (!secondValue) return -1
            const difference = collator.compare(firstValue, secondValue)
            return sort.direction === 'ascending' ? difference : -difference
        }
        return [...matchingJobs].sort((firstJob, secondJob) => {
            let primaryDifference: number
            if (sort.column === 'status') {
                primaryDifference =
                    JOB_STATUS_PRIORITY[firstJob.gr_status] -
                    JOB_STATUS_PRIORITY[secondJob.gr_status]
                if (sort.direction === 'descending') primaryDifference *= -1
            } else if (sort.column === 'customer') {
                primaryDifference = compareText(firstJob.gr_Site?.gr_Customer?.gr_name, secondJob.gr_Site?.gr_Customer?.gr_name)
            } else if (sort.column === 'mechanic') {
                primaryDifference = compareText(firstJob.gr_Mechanic?.gr_name, secondJob.gr_Mechanic?.gr_name)
            } else {
                primaryDifference = new Date(firstJob.createdon).getTime() - new Date(secondJob.createdon).getTime()
                if (sort.direction === 'descending') primaryDifference *= -1
            }
            if (primaryDifference !== 0) return primaryDifference
            const createdDifference = new Date(secondJob.createdon).getTime() - new Date(firstJob.createdon).getTime()
            return createdDifference || collator.compare(secondJob.gr_jobnumber ?? '', firstJob.gr_jobnumber ?? '')
        })
    }, [matchingJobs, sort])

    const toggleSort = (column: JobsViewState['sort']['column']) => {
        const nextSort = sort.column !== column
            ? { column, direction: column === 'created' ? 'descending' as const : 'ascending' as const }
            : { column, direction: sort.direction === 'ascending' ? 'descending' as const : 'ascending' as const }
        onViewStateChange({ ...viewState, sort: nextSort })
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

    const copyJobForSpreadsheet = async (job: Job) => {
        const jobNumber = spreadsheetCell(job.gr_jobnumber)
        if (!jobNumber) return

        const mechanic = spreadsheetCell(job.gr_Mechanic?.gr_name)
        const spreadsheetRow = [
            mechanic,
            jobNumber,
            spreadsheetCell(job.gr_Equipment?.gr_fleet) || 'W/S',
            spreadsheetCell(job.gr_Site?.gr_Customer?.gr_name),
            '',
            mechanic,
        ].join('\t') + '\n'

        try {
            await navigator.clipboard.writeText(spreadsheetRow)
            setCopyFeedback({
                message: 'Copied Job to clipboard.',
                isError: false,
            })
        } catch (error) {
            console.error(error)
            setCopyFeedback({
                message: 'Unable to copy Job.',
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
                            onChange={(event) => onViewStateChange({ ...viewState, searchText: event.target.value })}
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
                        onClick={() => onViewStateChange({ ...viewState, selectedJobType: 'all' })}
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
                            onClick={() => onViewStateChange({ ...viewState, selectedJobType: jobType.value })}
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
                <div className="jobs-office-filter" aria-label="Filter jobs by office attention">
                    <button type="button" className={officeAttentionFilter === 'all' ? 'active' : ''} onClick={() => onViewStateChange({ ...viewState, officeAttentionFilter: 'all' })}>All</button>
                    <button type="button" className={officeAttentionFilter === 'required' ? 'active' : ''} onClick={() => onViewStateChange({ ...viewState, officeAttentionFilter: 'required' })}>Needs Attention</button>
                    <button type="button" className={officeAttentionFilter === 'none' ? 'active' : ''} onClick={() => onViewStateChange({ ...viewState, officeAttentionFilter: 'none' })}>No Attention Required</button>
                </div>
            </div>

            <div
                className="jobs-table-scroll"
                role="region"
                aria-label="Jobs table"
                tabIndex={0}
            >
                <table className="jobs-table">
                    <thead>
                        <tr>
                            <th className="jobs-attention-column"><span className="jobs-visually-hidden">Office attention</span></th>
                            <th>Job</th>
                            <th aria-sort={sort.column === 'created' ? sort.direction : 'none'}>
                                <button
                                    type="button"
                                    className="jobs-table-sort"
                                    onClick={() => toggleSort('created')}
                                    title="Sort by created date"
                                    aria-label="Sort by created date"
                                >
                                    Created
                                    <JobsTableSortIcon active={sort.column === 'created'} direction={sort.direction} />
                                </button>
                            </th>
                            <th>Type</th>
                            <th>Equipment</th>
                            <th aria-sort={sort.column === 'customer' ? sort.direction : 'none'}><button type="button" className="jobs-table-sort" onClick={() => toggleSort('customer')} title="Sort by customer" aria-label="Sort by customer">Customer / site <JobsTableSortIcon active={sort.column === 'customer'} direction={sort.direction} /></button></th>
                            <th>Description</th>
                            <th>Contact</th>
                            <th aria-sort={sort.column === 'mechanic' ? sort.direction : 'none'}><button type="button" className="jobs-table-sort" onClick={() => toggleSort('mechanic')} title="Sort by mechanic" aria-label="Sort by mechanic">Mechanic <JobsTableSortIcon active={sort.column === 'mechanic'} direction={sort.direction} /></button></th>
                            <th aria-sort={sort.column === 'status' ? sort.direction : 'none'}>
                                <button
                                    type="button"
                                    className="jobs-table-sort"
                                    onClick={() => toggleSort('status')}
                                    title="Sort by status priority"
                                    aria-label="Sort by status priority"
                                >
                                    Status
                                    <JobsTableSortIcon active={sort.column === 'status'} direction={sort.direction} />
                                </button>
                            </th>
                            <th>Order</th>
                            <th>Latest Update</th>
                            <th className="jobs-table-actions-column" aria-label="Actions" />
                        </tr>
                    </thead>

                    <tbody>
                        {matchingJobs.length === 0 && (
                            <tr>
                                <td colSpan={13} className="jobs-table-empty">
                                    No Jobs match the current search, filters, and page settings.
                                </td>
                            </tr>
                        )}

                        {sortedJobs.map((job) => {
                            const latestOfficeUpdate = latestOfficeUpdates[job.gr_jobid]
                            const canCopyForSpreadsheet = Boolean(job.gr_jobnumber?.trim())
                            const mechanicEmail = job.gr_Mechanic?.gr_email?.trim() ?? ''
                            const canEmailTechnician = Boolean(job.gr_Mechanic) && isValidTechnicianEmail(mechanicEmail)
                            const emailTooltip = !job.gr_Mechanic
                                ? 'Assign a technician before emailing job details.'
                                : !isValidTechnicianEmail(mechanicEmail)
                                    ? 'The allocated technician does not have an email address.'
                                    : 'Email technician'

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
                                <td className="jobs-attention-column">
                                    {jobNeedsOfficeAttention(job) && <span className="jobs-office-indicator" title="Office attention required" aria-label="Office attention required" />}
                                </td>
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
                                    <SearchableMechanicSelect
                                        mechanics={mechanics}
                                        selectedId={job.gr_Mechanic?.gr_mechanicid ?? ''}
                                        isOpen={openMechanicJobId === job.gr_jobid}
                                        isSaving={savingMechanicJobId === job.gr_jobid}
                                        onOpen={() => setOpenMechanicJobId(job.gr_jobid)}
                                        onClose={() => setOpenMechanicJobId(null)}
                                        onSelect={(mechanicId) => {
                                            if (savingMechanicJobId || mechanicId === (job.gr_Mechanic?.gr_mechanicid ?? '')) { setOpenMechanicJobId(null); return }
                                            setOpenMechanicJobId(null)
                                            setSavingMechanicJobId(job.gr_jobid)
                                            void onJobFieldsChange(job.gr_jobid, {
                                                'gr_Mechanic@odata.bind': mechanicId ? `/gr_mechanics(${mechanicId})` : null,
                                            }).catch((error) => window.alert(error instanceof Error ? error.message : 'The technician could not be updated.')).finally(() => setSavingMechanicJobId(null))
                                        }}
                                    />
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

                                <td className="jobs-office-update" title={latestOfficeUpdate?.text || undefined}>{latestOfficeUpdate?.text ? latestOfficeUpdate.text.length > 42 ? `${latestOfficeUpdate.text.slice(0, 42).trimEnd()}...` : latestOfficeUpdate.text : ''}</td>

                                <td className="jobs-table-actions-column">
                                    <div className="jobs-table-actions">
                                        <button
                                            className="jobs-table-action"
                                            type="button"
                                            onClick={() => onEditJob(job)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="jobs-table-action jobs-spreadsheet-copy-action"
                                            type="button"
                                            title={canCopyForSpreadsheet
                                                ? 'Copy for Spreadsheet'
                                                : 'A Job Number is required before this Job can be copied.'}
                                            aria-label="Copy Job details for spreadsheet"
                                            onClick={() => void copyJobForSpreadsheet(job)}
                                            disabled={!canCopyForSpreadsheet}
                                        >
                                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                                <rect x="8" y="8" width="11" height="12" rx="2" />
                                                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
                                            </svg>
                                        </button>
                                        <button
                                            className="jobs-table-action jobs-technician-email-action"
                                            type="button"
                                            title={emailTooltip}
                                            aria-label="Email job details to technician"
                                            onClick={() => {
                                                if (!job.gr_Mechanic || !canEmailTechnician) return
                                                try {
                                                    window.location.href = buildMailtoUrl({
                                                        recipient: mechanicEmail,
                                                        subject: buildTechnicianEmailSubject(job),
                                                        body: buildTechnicianEmailBody(
                                                            job,
                                                            job.gr_Mechanic.gr_name,
                                                        ),
                                                    })
                                                } catch {
                                                    window.alert('Unable to open an email for this technician.')
                                                }
                                            }}
                                            disabled={!canEmailTechnician}
                                        >
                                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M3 6.5h18v11H3z" />
                                                <path d="m4 7 8 6 8-6" />
                                            </svg>
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
