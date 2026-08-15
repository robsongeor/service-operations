import { useEffect, useMemo, useRef, useState } from 'react'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import DrawerTabs from '../../shared/drawer/DrawerTabs'
import { JOB_STATUS_OPTIONS } from '../../jobs/types/jobStatus.types'
import { EQUIPMENT_SITE_CHECK_AVAILABILITY_OPTIONS } from '../../equipment/types/equipmentSiteCheckAvailability.types'
import { calculateSiteCheckProgress, wasSiteCheckCompletedLate } from '../domain/siteCheckCalculations'
import { buildSiteCheckJobBookRows, parseSiteCheckJobNumbers } from '../domain/siteCheckJobBook'
import {
    SITE_CHECK_FREQUENCY_OPTIONS,
    SITE_CHECK_STATUSES,
    type SiteCheck,
    type SiteCheckDetailJob,
    type SiteCheckEquipmentExclusion,
    type SiteCheckPage,
} from '../types/siteCheck.types'
import './SiteCheckDetailsDrawer.css'
import type { SiteCheckAssignmentEmailInput } from '../services/siteCheckAssignmentApi'

type Tab = 'summary' | 'jobs' | 'history'

type Props = {
    customerName: string
    siteName: string
    siteAddress?: string | null
    siteId: string
    initialSiteCheck?: SiteCheck | null
    initialTab?: Tab
    technicianName: (id: string) => string
    loadHistoryPage: (siteId: string, nextLink?: string) => Promise<SiteCheckPage<SiteCheck>>
    loadJobsPage: (siteCheckId: string, nextLink?: string) => Promise<SiteCheckPage<SiteCheckDetailJob>>
    loadAllJobs: (siteCheckId: string) => Promise<SiteCheckDetailJob[]>
    loadAllEquipmentExclusions: (siteCheckId: string) => Promise<SiteCheckEquipmentExclusion[]>
    allocateJobNumbers: (allocations: readonly {
        job: SiteCheckDetailJob
        jobNumber: string
    }[]) => Promise<void>
    clearJobNumber: (job: SiteCheckDetailJob) => Promise<void>
    prepareAssignmentEmail: (input: SiteCheckAssignmentEmailInput) => Promise<string>
    onDelete: (siteCheck: SiteCheck) => Promise<void>
    onOpenJob: (jobId: string, trigger: HTMLButtonElement) => void
    onOpenEquipment: (equipmentId: string, trigger: HTMLButtonElement) => void
    onClose: () => void
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
})

function formatDateTime(value?: string | null) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date)
}

function frequencyLabel(check?: SiteCheck | null) {
    return SITE_CHECK_FREQUENCY_OPTIONS.find(
        (option) => option.value === check?.gr_frequencysnapshot,
    )?.label ?? 'Unavailable'
}

function equipmentLabel(job: SiteCheckDetailJob) {
    const equipment = job.gr_Equipment
    return equipment?.gr_fleet?.trim()
        || equipment?.gr_serial?.trim()
        || [equipment?.gr_make, equipment?.gr_model].filter(Boolean).join(' ')
        || 'Equipment unavailable'
}

function excludedEquipmentLabel(exclusion: SiteCheckEquipmentExclusion) {
    const equipment = exclusion.gr_Equipment
    return equipment?.gr_fleet?.trim()
        || equipment?.gr_serial?.trim()
        || [equipment?.gr_make, equipment?.gr_model].filter(Boolean).join(' ')
        || exclusion.gr_name
}

function availabilityLabel(exclusion: SiteCheckEquipmentExclusion) {
    return EQUIPMENT_SITE_CHECK_AVAILABILITY_OPTIONS.find(
        (option) => option.value === exclusion.gr_availabilitysnapshot,
    )?.label ?? 'Unavailable'
}

export default function SiteCheckDetailsDrawer({
    customerName,
    siteName,
    siteAddress,
    siteId,
    initialSiteCheck,
    initialTab = 'summary',
    technicianName,
    loadHistoryPage,
    loadJobsPage,
    loadAllJobs,
    loadAllEquipmentExclusions,
    allocateJobNumbers,
    clearJobNumber,
    prepareAssignmentEmail,
    onDelete,
    onOpenJob,
    onOpenEquipment,
    onClose,
}: Props) {
    const [activeTab, setActiveTab] = useState<Tab>(initialTab)
    const [selected, setSelected] = useState<SiteCheck | null>(initialSiteCheck ?? null)
    const [history, setHistory] = useState<SiteCheck[]>([])
    const [historyNext, setHistoryNext] = useState<string>()
    const [jobs, setJobs] = useState<SiteCheckDetailJob[]>([])
    const [jobsNext, setJobsNext] = useState<string>()
    const [exclusions, setExclusions] = useState<SiteCheckEquipmentExclusion[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [jobsLoading, setJobsLoading] = useState(false)
    const [error, setError] = useState('')
    const [jobBookFeedback, setJobBookFeedback] = useState('')
    const [jobBookBusy, setJobBookBusy] = useState(false)
    const [showJobNumberDialog, setShowJobNumberDialog] = useState(false)
    const [pastedJobNumbers, setPastedJobNumbers] = useState('')
    const [jobNumberError, setJobNumberError] = useState('')
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const [jobNumberToClear, setJobNumberToClear] = useState<SiteCheckDetailJob | null>(null)
    const [clearNumberBusy, setClearNumberBusy] = useState(false)
    const [clearNumberError, setClearNumberError] = useState('')
    const [emailBusy, setEmailBusy] = useState(false)
    const selectedId = selected?.gr_sitecheckid
    const loadedJobsFor = useRef('')
    const loadedExclusionsFor = useRef('')

    const appendHistory = async (nextLink?: string) => {
        setHistoryLoading(true)
        setError('')
        try {
            const page = await loadHistoryPage(siteId, nextLink)
            setHistory((current) => nextLink
                ? [...current, ...page.records.filter((record) =>
                    !current.some((item) => item.gr_sitecheckid === record.gr_sitecheckid))]
                : page.records)
            setHistoryNext(page.nextLink)
            if (!selected && page.records[0]) setSelected(page.records[0])
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Site Check History could not be loaded.')
        } finally {
            setHistoryLoading(false)
        }
    }

    const appendJobs = async (siteCheckId: string, nextLink?: string) => {
        setJobsLoading(true)
        setError('')
        try {
            const page = await loadJobsPage(siteCheckId, nextLink)
            if (selectedId !== siteCheckId) return
            setJobs((current) => nextLink ? [...current, ...page.records] : page.records)
            setJobsNext(page.nextLink)
            loadedJobsFor.current = siteCheckId
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Generated Jobs could not be loaded.')
        } finally {
            setJobsLoading(false)
        }
    }

    useEffect(() => {
        const timer = window.setTimeout(() => void appendHistory(), 0)
        // The Site scope is fixed for the drawer session.
        return () => window.clearTimeout(timer)
    }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!selectedId || loadedJobsFor.current === selectedId) return
        const timer = window.setTimeout(() => {
            setJobs([])
            setJobsNext(undefined)
            void appendJobs(selectedId)
        }, 0)
        // The selected identifier is the request boundary.
        return () => window.clearTimeout(timer)
    }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!selectedId || loadedExclusionsFor.current === selectedId) return
        const timer = window.setTimeout(() => {
            setExclusions([])
            void loadAllEquipmentExclusions(selectedId)
                .then((records) => {
                    setExclusions(records)
                    loadedExclusionsFor.current = selectedId
                })
                .catch((cause) => setError(cause instanceof Error
                    ? cause.message
                    : 'Excluded Equipment could not be loaded.'))
        }, 0)
        return () => window.clearTimeout(timer)
    }, [loadAllEquipmentExclusions, selectedId])

    const progress = useMemo(
        () => calculateSiteCheckProgress(jobs, selected?.gr_expectedjobcount ?? 0),
        [jobs, selected?.gr_expectedjobcount],
    )
    const status = selected?.gr_status === SITE_CHECK_STATUSES.COMPLETE ? 'Complete' : 'In progress'

    const loadCompleteOrderedJobs = async () => {
        if (!selectedId) throw new Error('Select a Site Check first.')
        const completeJobs = await loadAllJobs(selectedId)
        const expected = selected?.gr_expectedjobcount ?? 0
        if (completeJobs.length !== expected) {
            throw new Error(
                `Expected ${expected} generated Jobs but found ${completeJobs.length}. Job Book actions are blocked until this is repaired.`,
            )
        }
        setJobs(completeJobs)
        setJobsNext(undefined)
        loadedJobsFor.current = selectedId
        return completeJobs
    }

    const copyForJobBook = async () => {
        setJobBookBusy(true)
        setJobBookFeedback('')
        setError('')
        try {
            const completeJobs = await loadCompleteOrderedJobs()
            await navigator.clipboard.writeText(
                buildSiteCheckJobBookRows(completeJobs, customerName, siteAddress),
            )
            setJobBookFeedback(`${completeJobs.length} Job Book rows copied in allocation order.`)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The Job Book rows could not be copied.')
        } finally {
            setJobBookBusy(false)
        }
    }

    const openJobNumberDialog = async () => {
        setJobBookBusy(true)
        setJobBookFeedback('')
        setError('')
        try {
            await loadCompleteOrderedJobs()
            setPastedJobNumbers('')
            setJobNumberError('')
            setShowJobNumberDialog(true)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The generated Jobs could not be loaded.')
        } finally {
            setJobBookBusy(false)
        }
    }

    const applyJobNumbers = async () => {
        setJobNumberError('')
        setJobBookBusy(true)
        try {
            await allocateJobNumbers(parseSiteCheckJobNumbers(pastedJobNumbers, jobs))
            const refreshedJobs = await loadCompleteOrderedJobs()
            setShowJobNumberDialog(false)
            setPastedJobNumbers('')
            setJobBookFeedback(`${refreshedJobs.length} Job numbers were allocated.`)
        } catch (cause) {
            setJobNumberError(cause instanceof Error ? cause.message : 'The Job numbers could not be allocated.')
        } finally {
            setJobBookBusy(false)
        }
    }

    const confirmClearJobNumber = async () => {
        if (!jobNumberToClear || !selectedId) return
        setClearNumberBusy(true)
        setClearNumberError('')
        try {
            await clearJobNumber(jobNumberToClear)
            const refreshedJobs = await loadAllJobs(selectedId)
            setJobs(refreshedJobs)
            setJobsNext(undefined)
            loadedJobsFor.current = selectedId
            setJobNumberToClear(null)
            setJobBookFeedback(`Job Number ${jobNumberToClear.gr_jobnumber?.trim()} was removed. The Site Check Job was preserved.`)
        } catch (cause) {
            setClearNumberError(cause instanceof Error ? cause.message : 'The Job Number could not be removed.')
        } finally {
            setClearNumberBusy(false)
        }
    }

    const deleteSelectedSiteCheck = async () => {
        if (!selected) return
        setDeleteBusy(true)
        setDeleteError('')
        try {
            await onDelete(selected)
        } catch (cause) {
            setDeleteError(cause instanceof Error ? cause.message : 'The Site Check could not be deleted.')
        } finally {
            setDeleteBusy(false)
        }
    }

    const emailAssignment = async () => {
        if (!selected) return
        setEmailBusy(true)
        setError('')
        try {
            const mailto = await prepareAssignmentEmail({
                siteCheckId: selected.gr_sitecheckid,
                customerName,
                siteName,
                frequencyLabel: frequencyLabel(selected),
                dueDate: selected.gr_duedatesnapshot,
                jobCount: selected.gr_expectedjobcount,
            })
            window.location.href = mailto
        } catch (cause) {
            setError(cause instanceof Error
                ? cause.message
                : 'The secure Site Check email link could not be created.')
        } finally {
            setEmailBusy(false)
        }
    }

    return <EditDrawerShell
        eyebrow="Site Checks"
        title={selected?.gr_name ?? `${siteName} history`}
        busy={deleteBusy || emailBusy}
        onClose={onClose}
        footer={<>
            {selected?.gr_status === SITE_CHECK_STATUSES.IN_PROGRESS && <button
                type="button"
                className="primary"
                disabled={deleteBusy || emailBusy}
                onClick={() => void emailAssignment()}
            >
                {emailBusy ? 'Preparing emailâ€¦' : 'Send to technician'}
            </button>}
            {selected && <button
                type="button"
                className="danger"
                disabled={deleteBusy}
                onClick={() => {
                    setDeleteError('')
                    setShowDeleteConfirmation(true)
                }}
            >
                Delete Site Check
            </button>}
            <button type="button" disabled={deleteBusy} onClick={onClose}>Close</button>
        </>}
    >
        <DrawerTabs
            tabs={[
                { id: 'summary', label: 'Summary' },
                { id: 'jobs', label: 'Jobs & Equipment' },
                { id: 'history', label: 'History' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
            ariaLabel="Site Check details"
        />

        {error && <div className="site-check-details-error" role="alert">{error}</div>}

        <div role="tabpanel" id="drawer-tab-panel-summary" aria-labelledby="drawer-tab-summary" hidden={activeTab !== 'summary'}>
            <EditDrawerSection title="Occurrence">
                {!selected ? <p>No Site Check occurrence is available.</p> : <>
                    <dl className="site-check-detail-grid">
                        <div><dt>Customer</dt><dd>{customerName}</dd></div>
                        <div><dt>Site</dt><dd>{siteName}</dd></div>
                        <div><dt>Frequency</dt><dd>{frequencyLabel(selected)}</dd></div>
                        <div><dt>Assigned technician</dt><dd>{technicianName(selected._gr_assignedtechnician_value)}</dd></div>
                        <div><dt>Status</dt><dd>{status}</dd></div>
                        <div><dt>Due date</dt><dd>{selected.gr_duedatesnapshot}</dd></div>
                        <div><dt>Started</dt><dd>{formatDateTime(selected.gr_startedon)}</dd></div>
                        <div><dt>Completed</dt><dd>{formatDateTime(selected.gr_completedon)}</dd></div>
                    </dl>
                    <div className="site-check-progress">
                        <div><strong>{progress.completed} of {progress.expected} complete</strong><span>{progress.remaining} remaining</span></div>
                        <progress value={progress.completed} max={progress.expected || 1} aria-label={`${progress.completed} of ${progress.expected} Site Check Jobs complete`} />
                        {progress.hasIntegrityMismatch && !jobsLoading && <p role="alert">Expected {progress.expected} Jobs but found {progress.total}. Completion is blocked until this is repaired.</p>}
                    </div>
                </>}
            </EditDrawerSection>
        </div>

        <div role="tabpanel" id="drawer-tab-panel-jobs" aria-labelledby="drawer-tab-jobs" hidden={activeTab !== 'jobs'}>
            <EditDrawerSection title="Generated Jobs and Equipment">
                {selected && <div className="site-check-job-book">
                    <div>
                        <strong>Job Book allocation</strong>
                        <span>Copy the generated Jobs to Excel, then paste the allocated Job numbers back in the same row order.</span>
                    </div>
                    <div>
                        <button type="button" disabled={jobBookBusy || jobsLoading} onClick={() => void copyForJobBook()}>
                            {jobBookBusy ? 'Working…' : 'Copy Jobs for Excel'}
                        </button>
                        <button type="button" disabled={jobBookBusy || jobsLoading} onClick={() => void openJobNumberDialog()}>
                            Paste Job numbers
                        </button>
                    </div>
                    {jobBookFeedback && <p role="status">{jobBookFeedback}</p>}
                </div>}
                {jobsLoading && jobs.length === 0 ? <p>Loading generated Jobs…</p>
                    : jobs.length === 0 ? <p>No generated Jobs were found.</p>
                        : <div className="site-check-job-list">
                            {jobs.map((job) => {
                                const jobStatus = JOB_STATUS_OPTIONS.find((option) => option.value === job.gr_status)?.label ?? 'Unknown'
                                return <article key={job.gr_jobid}>
                                    <div>
                                        <strong>{equipmentLabel(job)}</strong>
                                        <span>{job.gr_jobnumber?.trim() || 'Unnumbered Job'} · {jobStatus}</span>
                                        <small>{job.gr_Mechanic?.gr_name ?? 'Technician unassigned'}</small>
                                    </div>
                                    <div>
                                        <button type="button" onClick={(event) => onOpenJob(job.gr_jobid, event.currentTarget)}>Open Job</button>
                                        <button
                                            type="button"
                                            disabled={!job.gr_Equipment}
                                            onClick={(event) => job.gr_Equipment && onOpenEquipment(job.gr_Equipment.gr_equipmentid, event.currentTarget)}
                                        >
                                            Open Equipment
                                        </button>
                                        {job.gr_jobnumber?.trim() && <button
                                            type="button"
                                            className="site-check-clear-number"
                                            onClick={() => {
                                                setClearNumberError('')
                                                setJobNumberToClear(job)
                                            }}
                                        >
                                            Clear Job number
                                        </button>}
                                    </div>
                                </article>
                            })}
                        </div>}
                {jobsNext && <button type="button" disabled={jobsLoading} onClick={() => selectedId && void appendJobs(selectedId, jobsNext)}>
                    {jobsLoading ? 'Loading…' : 'Load more Jobs'}
                </button>}
            </EditDrawerSection>
            {exclusions.length > 0 && <EditDrawerSection title="Excluded from this occurrence">
                <p>These machines were unavailable when this Site Check started. They will be reconsidered at the next occurrence.</p>
                <div className="site-check-job-list">
                    {exclusions.map((exclusion) =>
                        <article key={exclusion.gr_sitecheckequipmentexclusionid}>
                            <div>
                                <strong>{excludedEquipmentLabel(exclusion)}</strong>
                                <span>{availabilityLabel(exclusion)}</span>
                            </div>
                            <div>
                                <button
                                    type="button"
                                    disabled={!exclusion.gr_Equipment}
                                    onClick={(event) => exclusion.gr_Equipment
                                        && onOpenEquipment(
                                            exclusion.gr_Equipment.gr_equipmentid,
                                            event.currentTarget,
                                        )}
                                >
                                    Open Equipment
                                </button>
                            </div>
                        </article>)}
                </div>
            </EditDrawerSection>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-history" aria-labelledby="drawer-tab-history" hidden={activeTab !== 'history'}>
            <EditDrawerSection title="Site Check History">
                {historyLoading && history.length === 0 ? <p>Loading history…</p>
                    : history.length === 0 ? <p>No Site Check history is available.</p>
                        : <ol className="site-check-history">
                            {history.map((check) => {
                                const complete = check.gr_status === SITE_CHECK_STATUSES.COMPLETE
                                const late = complete && wasSiteCheckCompletedLate(check.gr_completedon, check.gr_duedatesnapshot)
                                const selectedProgress = selectedId === check.gr_sitecheckid
                                    ? progress
                                    : null
                                const completedCount = complete
                                    ? check.gr_expectedjobcount
                                    : selectedProgress?.completed ?? 0
                                return <li key={check.gr_sitecheckid}>
                                    <button type="button" aria-current={selectedId === check.gr_sitecheckid ? 'true' : undefined} onClick={() => {
                                        loadedJobsFor.current = ''
                                        loadedExclusionsFor.current = ''
                                        setSelected(check)
                                        setActiveTab('summary')
                                    }}>
                                        <strong>{formatDateTime(check.gr_startedon)}</strong>
                                        <span>{complete ? 'Complete' : 'In progress'} · {completedCount}/{check.gr_expectedjobcount}</span>
                                        <small>{technicianName(check._gr_assignedtechnician_value)} · Due {check.gr_duedatesnapshot}{late ? ' · Completed late' : ''}</small>
                                    </button>
                                </li>
                            })}
                        </ol>}
                {historyNext && <button type="button" disabled={historyLoading} onClick={() => void appendHistory(historyNext)}>
                    {historyLoading ? 'Loading…' : 'Load more history'}
                </button>}
            </EditDrawerSection>
        </div>
        {showJobNumberDialog && <EditDrawerFormDialog
            eyebrow="Job Book allocation"
            title={`Allocate ${jobs.length} Job numbers`}
            error={jobNumberError}
            isBusy={jobBookBusy}
            submitLabel={jobBookBusy ? 'Applying…' : 'Apply Job numbers'}
            onCancel={() => {
                setShowJobNumberDialog(false)
                setJobNumberError('')
            }}
            onSubmit={() => void applyJobNumbers()}
        >
            <label className="site-check-job-number-field">
                <span>Job numbers, one per line</span>
                <textarea
                    rows={Math.min(Math.max(jobs.length, 5), 16)}
                    value={pastedJobNumbers}
                    onChange={(event) => setPastedJobNumbers(event.target.value)}
                    placeholder={'145410\n145411\n145412'}
                    autoFocus
                    disabled={jobBookBusy}
                />
            </label>
            <p>The first number is assigned to the first Job shown in the generated list. This update is atomic: either every number is saved or none are.</p>
            {jobs.some((job) => job.gr_jobnumber?.trim()) && <p><strong>Some Jobs already have numbers.</strong> Applying this list will replace them.</p>}
        </EditDrawerFormDialog>}
        {jobNumberToClear && <EditDrawerConfirmation
            eyebrow="Duplicate Job number"
            title={`Clear Job Number ${jobNumberToClear.gr_jobnumber?.trim()}?`}
            message={<>
                <p>This removes only the Job Number from this generated Site Check Job.</p>
                <p>The Job, Equipment relationship, Site Check progress, and any existing history will be preserved.</p>
            </>}
            error={clearNumberError}
            isBusy={clearNumberBusy}
            confirmLabel={clearNumberBusy ? 'Clearing…' : 'Clear Job number'}
            onCancel={() => {
                setJobNumberToClear(null)
                setClearNumberError('')
            }}
            onConfirm={() => void confirmClearJobNumber()}
        />}
        {showDeleteConfirmation && selected && <EditDrawerConfirmation
            eyebrow="Permanent deletion"
            title="Delete this Site Check and its Jobs?"
            message={<>
                <p>This permanently deletes the Site Check occurrence and all {selected.gr_expectedjobcount} generated Jobs.</p>
                <p>The Site Check Schedule, frequency, due date, Equipment scope, and manual selections will be preserved.</p>
            </>}
            error={deleteError}
            isBusy={deleteBusy}
            confirmLabel={deleteBusy ? 'Deleting…' : 'Delete Site Check and Jobs'}
            onCancel={() => {
                setShowDeleteConfirmation(false)
                setDeleteError('')
            }}
            onConfirm={() => void deleteSelectedSiteCheck()}
        />}
    </EditDrawerShell>
}
