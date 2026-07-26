import { useEffect, useMemo, useRef, useState } from 'react'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import DrawerTabs from '../../shared/drawer/DrawerTabs'
import { JOB_STATUS_OPTIONS } from '../../jobs/types/jobStatus.types'
import { calculateSiteCheckProgress, wasSiteCheckCompletedLate } from '../domain/siteCheckCalculations'
import {
    SITE_CHECK_FREQUENCY_OPTIONS,
    SITE_CHECK_STATUSES,
    type SiteCheck,
    type SiteCheckDetailJob,
    type SiteCheckPage,
} from '../types/siteCheck.types'
import './SiteCheckDetailsDrawer.css'

type Tab = 'summary' | 'jobs' | 'history'

type Props = {
    customerName: string
    siteName: string
    siteId: string
    initialSiteCheck?: SiteCheck | null
    initialTab?: Tab
    technicianName: (id: string) => string
    loadHistoryPage: (siteId: string, nextLink?: string) => Promise<SiteCheckPage<SiteCheck>>
    loadJobsPage: (siteCheckId: string, nextLink?: string) => Promise<SiteCheckPage<SiteCheckDetailJob>>
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

export default function SiteCheckDetailsDrawer({
    customerName,
    siteName,
    siteId,
    initialSiteCheck,
    initialTab = 'summary',
    technicianName,
    loadHistoryPage,
    loadJobsPage,
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
    const [historyLoading, setHistoryLoading] = useState(false)
    const [jobsLoading, setJobsLoading] = useState(false)
    const [error, setError] = useState('')
    const selectedId = selected?.gr_sitecheckid
    const loadedJobsFor = useRef('')

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

    const progress = useMemo(
        () => calculateSiteCheckProgress(jobs, selected?.gr_expectedjobcount ?? 0),
        [jobs, selected?.gr_expectedjobcount],
    )
    const status = selected?.gr_status === SITE_CHECK_STATUSES.COMPLETE ? 'Complete' : 'In progress'

    return <EditDrawerShell
        eyebrow="Site Checks"
        title={selected?.gr_name ?? `${siteName} history`}
        onClose={onClose}
        footer={<button type="button" onClick={onClose}>Close</button>}
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
                                    </div>
                                </article>
                            })}
                        </div>}
                {jobsNext && <button type="button" disabled={jobsLoading} onClick={() => selectedId && void appendJobs(selectedId, jobsNext)}>
                    {jobsLoading ? 'Loading…' : 'Load more Jobs'}
                </button>}
            </EditDrawerSection>
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
    </EditDrawerShell>
}
