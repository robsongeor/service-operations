import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MetricStrip from '../shared/metric-strip/MetricStrip'
import PageHeader from '../shared/page-header/PageHeader'
import { currentNewZealandDateOnly } from '../shared/dates/dateOnly'
import { formatWofDateOnly } from '../wof/utils/wofRules'
import RunSiteCheckDrawer from './components/RunSiteCheckDrawer'
import SiteCheckDetailsDrawer from './components/SiteCheckDetailsDrawer'
import {
    buildSiteCheckDashboardProjection,
    type ReportableSiteCheckState,
    type SiteCheckDashboardItem,
} from './domain/siteCheckDashboard'
import { useSiteCheckWorkspace } from './hooks/useSiteCheckWorkspace'
import {
    SITE_CHECK_FREQUENCY_OPTIONS,
    type SiteCheck,
    type SiteCheckScheduleState,
} from './types/siteCheck.types'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Site } from '../jobs/types/site.types'
import './SiteChecksScreen.css'

type ViewFilter = 'needs-attention' | 'all' | ReportableSiteCheckState | 'invalid'
type SortKey = 'customer' | 'site' | 'state' | 'due'
type Sort = { key: SortKey; direction: 'ascending' | 'descending' }

const STATE_LABELS: Record<SiteCheckScheduleState, string> = {
    disabled: 'Disabled',
    invalid: 'Configuration required',
    'in-progress': 'In progress',
    overdue: 'Overdue',
    due: 'Due',
    'up-to-date': 'Up to date',
}
const STATE_ORDER: Record<SiteCheckScheduleState, number> = {
    overdue: 0,
    due: 1,
    'in-progress': 2,
    invalid: 3,
    'up-to-date': 4,
    disabled: 5,
}

function frequencyLabel(value?: number | null) {
    return SITE_CHECK_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? 'Not configured'
}

function rowMatchesView(item: SiteCheckDashboardItem, view: ViewFilter) {
    if (view === 'all') return item.state !== 'disabled'
    if (view === 'needs-attention') {
        return item.state === 'overdue' || item.state === 'due' || item.state === 'in-progress'
    }
    return item.state === view
}

export default function SiteChecksScreen() {
    const navigate = useNavigate()
    const workspace = useSiteCheckWorkspace()
    const [view, setView] = useState<ViewFilter>('needs-attention')
    const [search, setSearch] = useState('')
    const [technicianId, setTechnicianId] = useState('')
    const [frequency, setFrequency] = useState('')
    const [dueFrom, setDueFrom] = useState('')
    const [dueTo, setDueTo] = useState('')
    const [sort, setSort] = useState<Sort>({ key: 'due', direction: 'ascending' })
    const [runSite, setRunSite] = useState<Site | null>(null)
    const [runEquipment, setRunEquipment] = useState<Equipment[]>([])
    const [runLoading, setRunLoading] = useState(false)
    const [runLoadError, setRunLoadError] = useState('')
    const [details, setDetails] = useState<{
        site: Site
        check?: SiteCheck | null
        tab: 'summary' | 'jobs' | 'history'
    } | null>(null)
    const drawerTrigger = useRef<HTMLButtonElement | null>(null)

    const projection = buildSiteCheckDashboardProjection({
        schedules: workspace.schedules,
        siteChecks: workspace.siteChecks,
        jobs: workspace.jobs,
        today: currentNewZealandDateOnly(),
    })
    const sitesById = useMemo(() => new Map(workspace.sites.map((site) => [
        site.gr_siteid.toLowerCase(),
        site,
    ])), [workspace.sites])
    const mechanicsById = useMemo(() => new Map(workspace.mechanics.map((mechanic) => [
        mechanic.gr_mechanicid.toLowerCase(),
        mechanic,
    ])), [workspace.mechanics])
    const normalizedSearch = search.trim().toLowerCase()

    const rows = projection.items
        .filter((item) => item.state !== 'disabled')
        .filter((item) => rowMatchesView(item, view))
        .filter((item) => {
            const site = sitesById.get(item.siteId)
            const technician = item.activeSiteCheck
                ? mechanicsById.get(item.activeSiteCheck._gr_assignedtechnician_value.toLowerCase())
                : undefined
            if (normalizedSearch && ![
                site?.gr_name,
                site?.gr_Customer?.gr_name,
                technician?.gr_name,
            ].some((value) => value?.toLowerCase().includes(normalizedSearch))) return false
            if (technicianId && item.activeSiteCheck?._gr_assignedtechnician_value.toLowerCase() !== technicianId) return false
            if (frequency && String(item.schedule.gr_frequency ?? '') !== frequency) return false
            const due = item.schedule.gr_nextduedate ?? ''
            if (dueFrom && (!due || due < dueFrom)) return false
            if (dueTo && (!due || due > dueTo)) return false
            return Boolean(site)
        })
        .sort((left, right) => {
            const leftSite = sitesById.get(left.siteId)!
            const rightSite = sitesById.get(right.siteId)!
            const value = (item: SiteCheckDashboardItem, site: Site) => {
                if (sort.key === 'customer') return site.gr_Customer?.gr_name ?? ''
                if (sort.key === 'site') return site.gr_name
                if (sort.key === 'state') return String(STATE_ORDER[item.state]).padStart(2, '0')
                return item.schedule.gr_nextduedate ?? '9999-12-31'
            }
            const result = value(left, leftSite).localeCompare(value(right, rightSite), undefined, {
                sensitivity: 'base',
            })
            return result * (sort.direction === 'ascending' ? 1 : -1)
        })

    const setStateView = (state: ReportableSiteCheckState) => {
        setView((current) => current === state ? 'needs-attention' : state)
    }
    const changeSort = (key: SortKey) => setSort((current) => ({
        key,
        direction: current.key === key && current.direction === 'ascending'
            ? 'descending'
            : 'ascending',
    }))
    const resetFilters = () => {
        setView('needs-attention')
        setSearch('')
        setTechnicianId('')
        setFrequency('')
        setDueFrom('')
        setDueTo('')
    }
    const openRun = async (site: Site, trigger: HTMLButtonElement) => {
        drawerTrigger.current = trigger
        setRunLoadError('')
        setRunLoading(true)
        try {
            setRunEquipment(await workspace.loadSiteEquipment(site.gr_siteid))
            setRunSite(site)
        } catch (cause) {
            setRunLoadError(cause instanceof Error ? cause.message : 'Site Equipment could not be loaded.')
        } finally {
            setRunLoading(false)
        }
    }
    const closeDrawer = (close: () => void) => {
        const trigger = drawerTrigger.current
        close()
        drawerTrigger.current = null
        window.setTimeout(() => trigger?.focus(), 0)
    }
    const customerDashboardUrl = (site: Site) => {
        const params = new URLSearchParams()
        if (site.gr_Customer?.gr_customerid) params.set('customerId', site.gr_Customer.gr_customerid)
        params.set('siteId', site.gr_siteid)
        return `/customers?${params.toString()}`
    }

    return <main className="site-checks-screen">
        <PageHeader
            eyebrow="Recurring inspections"
            title="Site Checks"
            subtitle="See every participating Site, focus work that needs attention, and continue active checks."
            actions={<button type="button" onClick={() => void workspace.refresh()}>Refresh</button>}
        />

        <MetricStrip ariaLabel="Site Check status totals" items={[
            { label: 'Overdue', value: projection.summary.overdue, tone: 'danger', active: view === 'overdue', onActivate: () => setStateView('overdue') },
            { label: 'Due', value: projection.summary.due, tone: 'warning', active: view === 'due', onActivate: () => setStateView('due') },
            { label: 'In progress', value: projection.summary['in-progress'], active: view === 'in-progress', onActivate: () => setStateView('in-progress') },
            { label: 'Up to date', value: projection.summary['up-to-date'], active: view === 'up-to-date', onActivate: () => setStateView('up-to-date') },
        ]} />

        <section className="site-checks-controls" aria-label="Site Check filters">
            <label><span>View</span><select value={view} onChange={(event) => setView(event.target.value as ViewFilter)}>
                <option value="needs-attention">Needs attention</option>
                <option value="all">All enabled Sites</option>
                <option value="overdue">Overdue</option>
                <option value="due">Due</option>
                <option value="in-progress">In progress</option>
                <option value="up-to-date">Up to date</option>
                {projection.invalidCount > 0 && <option value="invalid">Configuration required ({projection.invalidCount})</option>}
            </select></label>
            <label className="site-checks-search"><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, Site, or technician" /></label>
            <label><span>Technician</span><select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
                <option value="">All technicians</option>
                {workspace.mechanics.filter((item) => item.statecode !== 1).map((item) =>
                    <option value={item.gr_mechanicid.toLowerCase()} key={item.gr_mechanicid}>{item.gr_name}</option>)}
            </select></label>
            <label><span>Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
                <option value="">All frequencies</option>
                {SITE_CHECK_FREQUENCY_OPTIONS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select></label>
            <label><span>Due from</span><input type="date" value={dueFrom} onChange={(event) => setDueFrom(event.target.value)} /></label>
            <label><span>Due to</span><input type="date" value={dueTo} onChange={(event) => setDueTo(event.target.value)} /></label>
            <button type="button" className="site-checks-reset" onClick={resetFilters}>Reset filters</button>
        </section>

        <p className="site-checks-result-count" aria-live="polite">
            {rows.length} {rows.length === 1 ? 'Site' : 'Sites'} shown
        </p>
        {runLoading && <div className="site-checks-state" role="status">Loading Site Equipment…</div>}
        {runLoadError && <div className="site-checks-state error" role="alert">{runLoadError}</div>}
        {workspace.isLoading && <div className="site-checks-state" role="status">Loading Site Checks…</div>}
        {workspace.loadError && <div className="site-checks-state error" role="alert">
            <p>{workspace.loadError}</p>
            {!workspace.requiresInteraction && <button type="button" onClick={() => void workspace.refresh()}>Try again</button>}
        </div>}

        {!workspace.isLoading && !workspace.loadError && <div className="site-checks-table-wrap">
            <table>
                <thead><tr>
                    <th><button type="button" onClick={() => changeSort('customer')}>Customer</button></th>
                    <th><button type="button" onClick={() => changeSort('site')}>Site</button></th>
                    <th>Frequency</th>
                    <th><button type="button" onClick={() => changeSort('state')}>State</button></th>
                    <th><button type="button" onClick={() => changeSort('due')}>Due date</button></th>
                    <th>Progress</th>
                    <th>Technician</th>
                    <th>Action</th>
                </tr></thead>
                <tbody>
                    {rows.map((item) => {
                        const site = sitesById.get(item.siteId)!
                        const technician = item.activeSiteCheck
                            ? mechanicsById.get(item.activeSiteCheck._gr_assignedtechnician_value.toLowerCase())
                            : undefined
                        const canStart = item.state === 'due' || item.state === 'overdue'
                        return <tr key={item.schedule.gr_sitecheckscheduleid}>
                            <td><button type="button" className="site-checks-link" onClick={() => navigate(customerDashboardUrl(site))}>{site.gr_Customer?.gr_name ?? 'Customer unavailable'}</button></td>
                            <td><button type="button" className="site-checks-link site" onClick={() => navigate(customerDashboardUrl(site))}>{site.gr_name}</button></td>
                            <td>{frequencyLabel(item.schedule.gr_frequency)}</td>
                            <td><span className={`site-checks-status ${item.state}`}>{STATE_LABELS[item.state]}</span></td>
                            <td>{formatWofDateOnly(item.schedule.gr_nextduedate) || 'Not configured'}</td>
                            <td>{item.progress
                                ? <span className="site-checks-progress">
                                    <strong>{item.submissionProgress?.submitted ?? 0}/{item.progress.expected} Job Cards submitted</strong>
                                    <small>{item.progress.completed}/{item.progress.expected} Jobs complete</small>
                                </span>
                                : '—'}</td>
                            <td>{technician?.gr_name ?? '—'}</td>
                            <td>{canStart
                                ? <button type="button" className="site-checks-action primary" onClick={(event) => void openRun(site, event.currentTarget)}>Start</button>
                                : <button type="button" className="site-checks-action" onClick={(event) => {
                                    drawerTrigger.current = event.currentTarget
                                    setDetails({
                                        site,
                                        check: item.activeSiteCheck,
                                        tab: item.state === 'in-progress' ? 'summary' : 'history',
                                    })
                                }}>{item.state === 'in-progress' ? 'Open' : 'History'}</button>}</td>
                        </tr>
                    })}
                    {rows.length === 0 && <tr><td colSpan={8} className="site-checks-empty">No enabled Site Checks match these filters.</td></tr>}
                </tbody>
            </table>
        </div>}

        {runSite && <RunSiteCheckDrawer
            customerName={runSite.gr_Customer?.gr_name ?? 'Customer unavailable'}
            siteName={runSite.gr_name}
            siteId={runSite.gr_siteid}
            schedule={workspace.schedules.find((item) => item._gr_site_value.toLowerCase() === runSite.gr_siteid.toLowerCase())}
            equipment={runEquipment}
            selectedEquipmentIds={workspace.scheduleEquipment.filter((selection) =>
                selection._gr_sitecheckschedule_value.toLowerCase() === workspace.schedules.find((item) =>
                    item._gr_site_value.toLowerCase() === runSite.gr_siteid.toLowerCase())?.gr_sitecheckscheduleid.toLowerCase()
            ).map((selection) => selection._gr_equipment_value)}
            mechanics={workspace.mechanics}
            busy={workspace.isStarting}
            error={workspace.startError}
            onStart={workspace.startSiteCheck}
            onComplete={(created) => {
                setDetails({ site: runSite, check: created, tab: 'jobs' })
                setRunSite(null)
            }}
            onClose={() => {
                if (!workspace.isStarting) closeDrawer(() => setRunSite(null))
            }}
        />}

        {details && <SiteCheckDetailsDrawer
            key={`${details.site.gr_siteid}-${details.check?.gr_sitecheckid ?? 'history'}`}
            customerName={details.site.gr_Customer?.gr_name ?? 'Customer unavailable'}
            siteName={details.site.gr_name}
            siteAddress={details.site.gr_address}
            siteId={details.site.gr_siteid}
            initialSiteCheck={details.check}
            initialTab={details.tab}
            technicianName={(id) => mechanicsById.get(id.toLowerCase())?.gr_name ?? 'Technician unavailable'}
            loadHistoryPage={workspace.loadHistoryPage}
            loadJobsPage={workspace.loadDetailJobsPage}
            loadAllJobs={workspace.loadAllDetailJobs}
            loadAllEquipmentExclusions={workspace.loadAllEquipmentExclusions}
            allocateJobNumbers={workspace.allocateJobNumbers}
            prepareAssignmentEmail={workspace.prepareAssignmentEmail}
            onDelete={async (check) => {
                await workspace.deleteOccurrence(check)
                closeDrawer(() => setDetails(null))
            }}
            onOpenJob={(jobId) => navigate(`/jobs?jobId=${encodeURIComponent(jobId)}`)}
            onOpenEquipment={(equipmentId) => navigate(`/equipment?equipmentId=${encodeURIComponent(equipmentId)}`)}
            onClose={() => closeDrawer(() => setDetails(null))}
        />}
    </main>
}
