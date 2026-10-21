import { useEffect, useMemo, useState } from 'react'
import { useUnifiedJobWorklist } from './hooks/useUnifiedJobWorklist'
import { UNIFIED_JOB_RUNTIME, UNIFIED_JOB_WALKTHROUGH } from './domain/unifiedJobWorkflow'
import JobRegistrationDialog from './components/JobRegistrationDialog'
import { useJobs } from './hooks/useJobs'
import JobsTable from './components/JobsTable'
import JobEditDrawer from './components/JobEditDrawer'
import JobCreateDrawer from './components/JobCreateDrawer'
import type { Job } from './types/job.types'
import { DEFAULT_JOBS_VIEW_STATE, applyJobsDefaultView, getJobsViewStateKey, restoreJobsViewState, type JobsViewState, type ScheduledJobsVisibility } from './types/jobsViewState.types'
import { jobStatusIsVisible, JOB_STATUSES, JOB_STATUS_OPTIONS, type JobStatus } from './types/jobStatus.types'
import { JOB_TYPE_OPTIONS, SERVICE_COORDINATION_JOB_TYPE_OPTIONS, serviceCoordinationJobTypeFilter } from './types/jobType.types'
import { APPLICATION_DEFAULT_JOBS_VIEW, canonicaliseJobStatuses, getJobsDefaultViewKey, restoreJobsDefaultView, saveJobsDefaultView, type JobsDefaultView } from './types/jobsDefaultView.types'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import PageSettingsButton from '../shared/settings/PageSettingsButton'
import PageSettingsDialog from '../shared/settings/PageSettingsDialog'
import './JobsScreen.css'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { JOBS_TABLE_COLUMNS, type JobsStickyThroughColumnId } from './types/jobsTableColumns'
import JobCompletionWorkflow from './components/JobCompletionWorkflow'
import EquipmentDrawer from '../equipment/components/EquipmentDrawer'
import type { Equipment } from './types/equipment.types'
import { useQuoteEditorOverlay } from '../quotes/QuoteEditorOverlayContext'
import { useOperationalScreenReady } from '../shared/data/OperationalScreenPerformanceContext'
import { useJobCardProgress, useServiceCoordination } from './hooks/useServiceCoordination'
import { JOB_CARD_PROGRESS_SUMMARY_ENABLED, SERVICE_COORDINATION_BRANCH_ENABLED, SERVICE_COORDINATION_WATCHLIST_ENABLED } from './domain/serviceCoordinationConfig'
import ServiceCoordinationViews from './components/ServiceCoordinationViews'
import { applicationAccessFromEnvironment } from '../../auth/applicationAccess'
import { runJobWorkflow } from './services/jobWorkflowApi'

export default function JobsScreen() {
    const navigate = useNavigate()
    const quoteEditor = useQuoteEditorOverlay()
    const [searchParams, setSearchParams] = useSearchParams()
    const activeAccount = useActiveMsalAccount()
    const { canManageJobs } = applicationAccessFromEnvironment(activeAccount)
    const signedInUser = getSignedInUserInfo(activeAccount)
    const storageKey = signedInUser ? getJobsViewStateKey(signedInUser.storageId) : null
    const defaultViewStorageKey = signedInUser ? getJobsDefaultViewKey(signedInUser.storageId) : null
    const [defaultView, setDefaultView] = useState<JobsDefaultView>(() => {
        const restored = defaultViewStorageKey
            ? restoreJobsDefaultView(defaultViewStorageKey) ?? APPLICATION_DEFAULT_JOBS_VIEW
            : APPLICATION_DEFAULT_JOBS_VIEW
        return UNIFIED_JOB_RUNTIME
            ? { ...restored, selectedJobType: serviceCoordinationJobTypeFilter(restored.selectedJobType) }
            : restored
    })
    const [viewState, setViewState] = useState<JobsViewState>(() => {
        const restored = UNIFIED_JOB_WALKTHROUGH ? { ...DEFAULT_JOBS_VIEW_STATE } : storageKey
            ? restoreJobsViewState(storageKey, true) ?? applyJobsDefaultView(defaultView)
            : DEFAULT_JOBS_VIEW_STATE
        return UNIFIED_JOB_RUNTIME
            ? { ...restored, selectedJobType: serviceCoordinationJobTypeFilter(restored.selectedJobType) }
            : restored
    })
    const coordination = useServiceCoordination()
    const activeCoordinationView = viewState.coordinationView === 'watchlist' && !SERVICE_COORDINATION_WATCHLIST_ENABLED
        ? 'branch'
        : viewState.coordinationView === 'all' && !SERVICE_COORDINATION_BRANCH_ENABLED
            ? 'branch'
            : viewState.coordinationView
    const branchWorklistActive = activeCoordinationView !== 'watchlist'
    const completedArchiveRequested = branchWorklistActive && viewState.visibleStatuses.length === 1
        && viewState.visibleStatuses[0] === JOB_STATUSES.COMPLETE
    const branchScopeReady = !SERVICE_COORDINATION_BRANCH_ENABLED || Boolean(coordination.context?.branch)
    const unifiedWorklist = useUnifiedJobWorklist(completedArchiveRequested, {
        enabled: branchScopeReady,
        operatingBranch: SERVICE_COORDINATION_BRANCH_ENABLED && activeCoordinationView === 'branch'
            ? coordination.context?.branch.value
            : undefined,
    })
    const watchedJobs = useMemo(() => coordination.watches.map((item) => item.job), [coordination.watches])
    const coordinatedJobs = useMemo(() => {
        const rows = new Map(unifiedWorklist.jobs.map((job) => [job.gr_jobid.toLowerCase(), job]))
        watchedJobs.forEach((job) => rows.set(job.gr_jobid.toLowerCase(), job))
        return [...rows.values()]
    }, [unifiedWorklist.jobs, watchedJobs])
    const scopedData = useMemo(() => ({ jobs: coordinatedJobs, equipment: [], sites: [], servicePlans: [], scheduleOptions: [], officeUpdates: [] }), [coordinatedJobs])
    const [allocationJob, setAllocationJob] = useState<Job | null>(null)
    const {
        jobs, equipmentList, mechanics, mechanicsLoading, mechanicsError, retryMechanics, sites, customers, siteContacts,
        scheduleOptions,
        servicePlans,
        officeUpdates,
        createJob, updateJob, deleteJob, updateJobStatus, updateJobFields,
        updateJobCardStatus,
        sendPrimaryJobEmail, queuePrimaryJobEmail, emailDeliveryStates, sendAssignmentJobEmail, retryConfirmedDeliveryStatus,
        createJobAssignment, deleteJobAssignment, withdrawJobAssignment,
        createContactForSite, createEquipment, createSite, createCustomer,
        updateEquipment, setupEquipmentMaintenance, saveEquipmentMaintenanceHistory, deleteEquipment,
        isEquipmentSaving, equipmentSaveError, clearEquipmentSaveError,
        createScheduleOption, updateScheduleOption, deleteScheduleOption,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        completionRequest, isCompletingJob, completionError, completeStandardJob, completeServiceJob, completeWofJob, cancelJobCompletion,
        jobsCacheStatus, jobsRealtimeStatus,
        referenceDataStatus, referenceDataError, prepareJobReferenceData, loadJobQuotes, loadJobAssignments, loadJobEmailDispatches,
        searchEquipmentForEditor, searchCustomersForEditor,
        loadCustomerSitesForEditor, loadSiteContactsForEditor, loadEquipmentForEditor,
        loadEquipmentServicePlansForEditor,
        isLoading, loadError, retryInitialLoad, fetchJobForDrawer, fetchJobCardDetails, fetchJobPhotoBody,
    } = useJobs(UNIFIED_JOB_RUNTIME ? { loadGlobalOperationalData: false, scopedData, onScopedDataChanged: unifiedWorklist.reload } : {})
    const displayedJobs = activeCoordinationView === 'watchlist'
        ? watchedJobs
        : (UNIFIED_JOB_RUNTIME ? unifiedWorklist.jobs : jobs)
    const progress = useJobCardProgress(displayedJobs)
    const pageIsLoading = isLoading
        || (SERVICE_COORDINATION_BRANCH_ENABLED && coordination.busy && branchWorklistActive)
        || (UNIFIED_JOB_RUNTIME && unifiedWorklist.busy && branchWorklistActive && unifiedWorklist.jobs.length === 0)
    useOperationalScreenReady('Jobs', !pageIsLoading)
    const [editingJob, setEditingJob] = useState<Job | null>(null)
    const [editingInitialTab, setEditingInitialTab] = useState<'details' | 'jobcard'>('details')
    const [isCreatingJob, setIsCreatingJob] = useState(false)
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [draftScheduledVisibility, setDraftScheduledVisibility] = useState<ScheduledJobsVisibility>(viewState.scheduledJobsVisibility)
    const [draftDefaultView, setDraftDefaultView] = useState<JobsDefaultView>(defaultView)
    const visibleStatuses = viewState.visibleStatuses

    useEffect(() => {
        if (!storageKey) return
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(viewState))
        } catch {
            // Jobs remains usable when browser storage is unavailable.
        }
    }, [storageKey, viewState])

    const createQuoteForJob = (jobId: string) => {
        setEditingJob(null)
        quoteEditor.createQuote(jobId)
    }

    const openQuote = (quoteId: string) => {
        setEditingJob(null)
        quoteEditor.openQuote(quoteId)
    }

    const toggleStatus = (status: JobStatus) => {
        setViewState((current) => ({
            ...current,
            visibleStatuses: current.visibleStatuses.includes(status)
                ? current.visibleStatuses.filter((currentStatus) => currentStatus !== status)
                : [...current.visibleStatuses, status],
        }))
    }

    const openJob = (job: Job, tab: 'details' | 'jobcard' = 'details') => {
        if (job.legacyBookEntry) { navigate('/job-book'); return }
        setEditingInitialTab(tab)
        setEditingJob(job)
    }

    const openEquipment = async (equipmentId: string) => {
        const equipment = equipmentList.find((item) =>
            item.gr_equipmentid.toLowerCase() === equipmentId.toLowerCase())
            ?? await loadEquipmentForEditor(equipmentId)
        if (!equipment) return
        clearEquipmentSaveError()
        setEditingEquipment(equipment)
    }

    const stopManagingJob = async (job: Job) => {
        const jobNumber = job.gr_jobnumber?.trim()
        if (!canManageJobs) throw new Error('Your current access does not permit this workflow action.')
        if (!jobNumber) throw new Error('Unnumbered drafts stay in Service Coordination. Delete the draft instead if it is no longer required.')
        if (!window.confirm(`Stop managing Job ${jobNumber}? It will remain in the Auckland Job Book, but will leave Service Coordination and personal watchlists.`)) return
        await runJobWorkflow(await unifiedWorklist.getAccessToken(), {
            kind: 'unmanage',
            jobId: job.gr_jobid,
            jobEtag: job['@odata.etag'] ?? '',
        })
        if (editingJob?.gr_jobid.toLowerCase() === job.gr_jobid.toLowerCase()) setEditingJob(null)
        await Promise.all([unifiedWorklist.reload(true), coordination.reload()])
    }

    useEffect(() => {
        const jobId = searchParams.get('jobId')
        if (!jobId || isLoading || editingJob) return
        const job = jobs.find((item) => item.gr_jobid.toLowerCase() === jobId.toLowerCase())
        if (!job) return
        const timer = window.setTimeout(() => {
            setEditingInitialTab('details')
            const next = new URLSearchParams(searchParams)
            next.delete('jobId')
            setSearchParams(next, { replace: true })
            setEditingJob(job)
        }, 0)
        return () => window.clearTimeout(timer)
    }, [editingJob, isLoading, jobs, searchParams, setSearchParams])

    const currentMatchesDefault = viewState.selectedJobType === defaultView.selectedJobType
        && canonicaliseJobStatuses(viewState.visibleStatuses).join(',') === canonicaliseJobStatuses(defaultView.visibleStatuses).join(',')
        && viewState.searchText === ''

    const resetToDefault = () => {
        const savedDefault = defaultViewStorageKey
            ? restoreJobsDefaultView(defaultViewStorageKey) ?? APPLICATION_DEFAULT_JOBS_VIEW
            : APPLICATION_DEFAULT_JOBS_VIEW
        const effectiveDefault = UNIFIED_JOB_RUNTIME
            ? { ...savedDefault, selectedJobType: serviceCoordinationJobTypeFilter(savedDefault.selectedJobType) }
            : savedDefault
        setDefaultView(effectiveDefault)
        setViewState((current) => ({
            ...current,
            selectedJobType: effectiveDefault.selectedJobType,
            visibleStatuses: [...effectiveDefault.visibleStatuses],
            searchText: '',
        }))
    }

    const filteredJobs = displayedJobs.filter((job) => job.legacyBookEntry ? viewState.selectedJobType === 'all' : jobStatusIsVisible(job.gr_status, visibleStatuses))
    const scheduledSettingLabels: Record<ScheduledJobsVisibility, string> = {
        all: 'All scheduled Jobs',
        today: 'Scheduled today',
        'today-tomorrow': 'Scheduled today and tomorrow',
        'this-week': 'Scheduled this week',
    }
    const sharedDrawerProps = {
        mechanics,
        mechanicsLoading,
        mechanicsError,
        onRetryMechanics: () => { void retryMechanics().catch(() => undefined) },
        equipmentList,
        sites,
        customers,
        siteContacts,
        servicePlans,
        onCreateCustomer: createCustomer,
        onCreateSite: createSite,
        onCreateContact: createContactForSite,
        onCreateEquipment: createEquipment,
        onSearchEquipment: searchEquipmentForEditor,
        onSearchCustomers: searchCustomersForEditor,
        onLoadCustomerSites: loadCustomerSitesForEditor,
        onLoadSiteContacts: loadSiteContactsForEditor,
        onLoadEquipment: loadEquipmentForEditor,
        onLoadEquipmentServicePlans: loadEquipmentServicePlansForEditor,
        referenceDataStatus,
        referenceDataError,
        onPrepareReferenceData: prepareJobReferenceData,
        onLoadJobQuotes: loadJobQuotes,
        onLoadJobAssignments: loadJobAssignments,
        onRefreshJob: fetchJobForDrawer,
        onLoadJobCardDetails: fetchJobCardDetails,
        onLoadJobPhoto: fetchJobPhotoBody,
    }

    return (
        <div className="jobs-page">
            <header className="jobs-page-header">
                <h1>Jobs</h1>
                <div className="jobs-page-header-actions">
                    <span>{displayedJobs.length} records</span>
                    {UNIFIED_JOB_RUNTIME && unifiedWorklist.backgroundBusy && <span className="jobs-cache-status">Loading additional jobs…</span>}
                    {jobsRealtimeStatus !== 'disabled' && (
                        <span className={`jobs-realtime-status ${jobsRealtimeStatus}`}>
                            {jobsRealtimeStatus === 'connected'
                                ? 'Live updates on'
                                : jobsRealtimeStatus === 'connecting' ? 'Connecting live updates…' : 'Live updates offline'}
                        </span>
                    )}
                    {jobsCacheStatus && (
                        <span className="jobs-cache-status">
                            {jobsCacheStatus.refreshing
                                ? 'Saved copy · refreshing…'
                                : jobsCacheStatus.source === 'device'
                                    ? `Saved copy from ${new Date(jobsCacheStatus.savedAt).toLocaleString('en-NZ')}`
                                    : `Updated ${new Date(jobsCacheStatus.savedAt).toLocaleString('en-NZ')}`}
                        </span>
                    )}
                    <PageSettingsButton
                        active={viewState.scheduledJobsVisibility !== 'all'}
                        title={viewState.scheduledJobsVisibility === 'all' ? 'Settings' : `Settings: ${scheduledSettingLabels[viewState.scheduledJobsVisibility]}`}
                        onClick={() => {
                            setDraftScheduledVisibility(viewState.scheduledJobsVisibility)
                            setDraftDefaultView({ ...defaultView, visibleStatuses: [...defaultView.visibleStatuses] })
                            setSettingsOpen(true)
                        }}
                    />
                    <button
                        className="jobs-intake-button"
                        type="button"
                        onClick={() => navigate('/job-book')}
                    >
                        Job Book
                    </button>
                    <button
                        className="jobs-create-button"
                        type="button"
                        onClick={() => setIsCreatingJob(true)}
                        disabled={isLoading || Boolean(loadError)}
                    >
                        + Create job
                    </button>
                </div>
            </header>
            {UNIFIED_JOB_RUNTIME && unifiedWorklist.error && <section className="jobs-filter-bar" aria-label="Job worklist notices">
                {unifiedWorklist.error && <span role="alert">{unifiedWorklist.error}</span>}
            </section>}
            {SERVICE_COORDINATION_BRANCH_ENABLED && coordination.contextError && <section className="jobs-filter-bar" aria-label="Branch setup notice">
                <span role="alert">{coordination.contextError}</span>
                <button type="button" onClick={() => { void coordination.reload() }}>Try again</button>
            </section>}
            {SERVICE_COORDINATION_WATCHLIST_ENABLED && coordination.watchError && <section className="jobs-filter-bar" aria-label="Watchlist notice">
                <span role="alert">{coordination.watchError}</span>
                <button type="button" onClick={() => { void coordination.reload() }}>Try again</button>
            </section>}
            {JOB_CARD_PROGRESS_SUMMARY_ENABLED && progress.error && <section className="jobs-filter-bar" aria-label="Job Card progress notice">
                <span role="alert">{progress.error}</span>
            </section>}

            {(SERVICE_COORDINATION_BRANCH_ENABLED || SERVICE_COORDINATION_WATCHLIST_ENABLED) && <ServiceCoordinationViews
                view={activeCoordinationView}
                branchLabel={coordination.context?.branch.label}
                allBranchesEnabled={SERVICE_COORDINATION_BRANCH_ENABLED}
                watchlistEnabled={SERVICE_COORDINATION_WATCHLIST_ENABLED}
                onChange={(coordinationView) => setViewState((current) => ({ ...current, coordinationView }))}
            />}

            {referenceDataStatus === 'error' && (
                <div className="jobs-reference-data-state jobs-reference-data-error" role="alert">
                    <span>Job details could not be prepared. {referenceDataError}</span>
                    <button type="button" onClick={() => { void prepareJobReferenceData().catch(() => undefined) }}>Try again</button>
                </div>
            )}

            {pageIsLoading ? (
                <section className="jobs-data-state" aria-live="polite">
                    <span className="jobs-loading-indicator" aria-hidden="true" />
                    <div>
                        <h2>Loading jobs</h2>
                        <p>Connecting to Dataverse and preparing the operations table.</p>
                    </div>
                </section>
            ) : loadError ? (
                <section className="jobs-data-state jobs-data-state-error" role="alert">
                    <div>
                        <h2>Jobs could not be loaded</h2>
                        <p>Dataverse returned an error. Check the details or try again.</p>
                        <details>
                            <summary>Error details</summary>
                            <pre>{loadError}</pre>
                        </details>
                    </div>
                    <button type="button" onClick={retryInitialLoad}>Try again</button>
                </section>
            ) : SERVICE_COORDINATION_BRANCH_ENABLED && branchWorklistActive && !coordination.context?.branch ? (
                <section className="jobs-data-state jobs-data-state-error" role="alert">
                    <div><h2>Branch setup required</h2><p>Your account needs a Service Coordination branch before Branch work can be loaded.</p></div>
                </section>
            ) : displayedJobs.length === 0 ? (
                <section className="jobs-data-state">
                    <div>
                        <h2>{activeCoordinationView === 'watchlist' ? 'No watched jobs' : 'No jobs found'}</h2>
                        <p>{activeCoordinationView === 'watchlist'
                            ? 'Jobs you watch will remain here until you remove them.'
                            : activeCoordinationView === 'all'
                                ? 'There are no Jobs in the current All branches view.'
                                : 'There are no Jobs in your home branch.'}</p>
                    </div>
                </section>
            ) : (
                <JobsTable
                    unifiedWorklist={UNIFIED_JOB_RUNTIME}
                    onAllocateNumber={UNIFIED_JOB_RUNTIME ? setAllocationJob : undefined}
                    jobs={filteredJobs}
                    coordinationView={activeCoordinationView}
                    watchedJobIds={coordination.watchedJobIds}
                    onToggleWatch={SERVICE_COORDINATION_WATCHLIST_ENABLED ? coordination.toggleWatch : undefined}
                    onStopManaging={canManageJobs ? stopManagingJob : undefined}
                    progressSummaries={progress.summaries}
                    progressUnavailable={JOB_CARD_PROGRESS_SUMMARY_ENABLED && Boolean(progress.error)}
                    signedInUserName={signedInUser?.displayName ?? ''}
                    visibleStatuses={visibleStatuses}
                    viewState={viewState}
                    onViewStateChange={setViewState}
                    onToggleStatus={toggleStatus}
                    onResetToDefault={resetToDefault}
                    resetToDefaultDisabled={currentMatchesDefault}
                    onStatusChange={async (jobId, status) => {
                        if (status === JOB_STATUSES.COMPLETE) {
                            await prepareJobReferenceData()
                        }
                        return updateJobStatus(jobId, status)
                    }}
                    onJobFieldsChange={updateJobFields}
                    onEmailTechnician={queuePrimaryJobEmail}
                    loadJobAssignments={loadJobAssignments}
                    loadJobEmailDispatches={loadJobEmailDispatches}
                    onCreateAssignment={createJobAssignment}
                    onEmailAssignment={sendAssignmentJobEmail}
                    onDeleteAssignment={deleteJobAssignment}
                    onWithdrawAssignment={withdrawJobAssignment}
                    emailDeliveryStates={emailDeliveryStates}
                    onEditJob={(job) => openJob(job)}
                    onOpenJobCard={(job) => openJob(job, 'jobcard')}
                    onOpenEquipment={(equipmentId) => { void openEquipment(equipmentId).catch(() => undefined) }}
                    mechanics={mechanics}
                    officeUpdates={officeUpdates}
                    scheduleOptions={scheduleOptions}
                    stickyThroughColumnId={defaultView.stickyThroughColumnId}
                />
            )}

            <PageSettingsDialog
                open={settingsOpen}
                title="Settings"
                description="Configure Jobs page visibility and your saved starting view."
                onCancel={() => setSettingsOpen(false)}
                onApply={() => {
                    setViewState((current) => ({ ...current, scheduledJobsVisibility: draftScheduledVisibility }))
                    const nextDefaultView = {
                        ...draftDefaultView,
                        visibleStatuses: canonicaliseJobStatuses(draftDefaultView.visibleStatuses),
                    }
                    if (defaultViewStorageKey && saveJobsDefaultView(defaultViewStorageKey, nextDefaultView)) {
                        setDefaultView(nextDefaultView)
                    }
                    setSettingsOpen(false)
                }}
            >
                <fieldset className="jobs-scheduled-settings">
                    <legend>Scheduled Jobs Visibility</legend>
                    {([
                        ['all', 'All scheduled Jobs'],
                        ['today', 'Today only'],
                        ['today-tomorrow', 'Today and tomorrow'],
                        ['this-week', 'This week (Monday–Sunday)'],
                    ] as const).map(([value, label]) => (
                        <label key={value}>
                            <input type="radio" name="scheduled-jobs-visibility" value={value} checked={draftScheduledVisibility === value} onChange={() => setDraftScheduledVisibility(value)} />
                            <span>{label}</span>
                        </label>
                    ))}
                </fieldset>
                <section className="jobs-default-view-settings" aria-labelledby="jobs-default-view-heading">
                    <div>
                        <h3 id="jobs-default-view-heading">Default View</h3>
                        <p>Choose the Jobs tab and statuses used when no previous view is retained, or when Reset to Default is selected. Saving does not change the currently active tab or statuses.</p>
                    </div>
                    <label className="jobs-default-tab">
                        <span>Default tab</span>
                        <select
                            value={draftDefaultView.selectedJobType}
                            onChange={(event) => setDraftDefaultView((current) => ({
                                ...current,
                                selectedJobType: event.target.value === 'all' || event.target.value === 'operational' || event.target.value === 'unnumbered'
                                    ? event.target.value
                                    : Number(event.target.value) as JobsDefaultView['selectedJobType'],
                            }))}
                        >
                            <option value="operational">Operational</option>
                            {(UNIFIED_JOB_RUNTIME ? SERVICE_COORDINATION_JOB_TYPE_OPTIONS : JOB_TYPE_OPTIONS).map((jobType) => <option key={jobType.value} value={jobType.value}>{jobType.label}</option>)}
                            <option value="unnumbered">Unnumbered</option>
                            <option value="all">All jobs (unfiltered)</option>
                        </select>
                    </label>
                    <label className="jobs-default-tab">
                        <span>Freeze columns through</span>
                        <select
                            value={draftDefaultView.stickyThroughColumnId ?? ''}
                            onChange={(event) => setDraftDefaultView((current) => ({
                                ...current,
                                stickyThroughColumnId: event.target.value
                                    ? event.target.value as JobsStickyThroughColumnId
                                    : null,
                            }))}
                        >
                            <option value="">None</option>
                            {JOBS_TABLE_COLUMNS.filter((column) => column.selectable).map((column) => (
                                <option key={column.id} value={column.id}>{column.label}</option>
                            ))}
                        </select>
                        <small>Keeps this column and every column before it visible while scrolling horizontally.</small>
                    </label>
                    <fieldset className="jobs-default-statuses">
                        <legend>Default statuses</legend>
                        {JOB_STATUS_OPTIONS.map((status) => (
                            <label key={status.value}>
                                <input
                                    type="checkbox"
                                    checked={draftDefaultView.visibleStatuses.includes(status.value)}
                                    onChange={() => setDraftDefaultView((current) => ({
                                        ...current,
                                        visibleStatuses: current.visibleStatuses.includes(status.value)
                                            ? current.visibleStatuses.filter((currentStatus) => currentStatus !== status.value)
                                            : [...current.visibleStatuses, status.value],
                                    }))}
                                />
                                <span>{status.label}</span>
                            </label>
                        ))}
                        <small>No statuses selected means no Jobs are shown, matching the existing status-filter behaviour.</small>
                    </fieldset>
                </section>
            </PageSettingsDialog>

            {isCreatingJob && (
                <JobCreateDrawer
                    {...sharedDrawerProps}
                    existingJobs={jobs}
                    onCreateJob={(input) => createJob({
                        ...input,
                        coordinatorManaged: true,
                        ...(SERVICE_COORDINATION_BRANCH_ENABLED && coordination.context?.branch
                            ? { operatingBranch: coordination.context.branch.value }
                            : {}),
                    })}
                    onCreateScheduleOption={createScheduleOption}
                    closeAfterCreate={false}
                    onCreated={async (jobId) => {
                        const createdJob = await fetchJobForDrawer(jobId)
                        if (!createdJob) throw new Error('The Job was created, but its edit view could not be loaded.')
                        setIsCreatingJob(false)
                        setEditingInitialTab('details')
                        setEditingJob(createdJob)
                    }}
                    onClose={() => setIsCreatingJob(false)}
                />
            )}

            {allocationJob && <JobRegistrationDialog job={allocationJob} mode="allocate" getAccessToken={unifiedWorklist.getAccessToken} onSaved={() => unifiedWorklist.reload(true)} onClose={() => setAllocationJob(null)} />}
            {editingJob && (
                <JobEditDrawer
                    {...sharedDrawerProps}
                    job={editingJob}
                    initialTab={editingInitialTab}
                    onSave={updateJob}
                    onDelete={deleteJob}
                    scheduleOptions={scheduleOptions}
                    onCreateScheduleOption={createScheduleOption}
                    onUpdateScheduleOption={updateScheduleOption}
                    onDeleteScheduleOption={deleteScheduleOption}
                    servicePlans={servicePlans}
                    onCreateQuote={createQuoteForJob}
                    onOpenQuote={openQuote}
                    onJobCardStatusChange={updateJobCardStatus}
                    onCreateAssignment={createJobAssignment}
                    onSendPrimary={sendPrimaryJobEmail}
                    onSendAssignment={sendAssignmentJobEmail}
                    onRetryConfirmedDeliveryStatus={retryConfirmedDeliveryStatus}
                    onDeleteAssignment={deleteJobAssignment}
                    officeUpdates={officeUpdates.filter((update) => update.jobId.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
                    onCreateOfficeUpdate={createJobOfficeUpdate}
                    onSaveOfficeAttention={updateJobOfficeAttention}
                    watched={coordination.watchedJobIds.has(editingJob.gr_jobid.toLowerCase())}
                    onToggleWatch={SERVICE_COORDINATION_WATCHLIST_ENABLED ? () => coordination.toggleWatch(editingJob) : undefined}
                    onClose={() => {
                        setEditingJob(null)
                        setEditingInitialTab('details')
                    }}
                />
            )}
            {editingEquipment && (
                <EquipmentDrawer
                    mode="edit"
                    equipment={editingEquipment}
                    equipmentList={equipmentList}
                    servicePlans={servicePlans.filter((plan) =>
                        plan._gr_equipment_value?.toLowerCase() === editingEquipment.gr_equipmentid.toLowerCase())}
                    customers={customers}
                    sites={sites}
                    jobs={jobs}
                    isSaving={isEquipmentSaving}
                    saveError={equipmentSaveError}
                    onClose={() => setEditingEquipment(null)}
                    onSave={async (input) => {
                        const updated = await updateEquipment(editingEquipment, input)
                        setEditingEquipment(updated)
                    }}
                    onSaveMaintenanceHistory={async (plans, input) => {
                        const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input)
                        setEditingEquipment(updated)
                    }}
                    onDelete={async () => {
                        await deleteEquipment(editingEquipment.gr_equipmentid)
                        setEditingEquipment(null)
                    }}
                />
            )}
            <JobCompletionWorkflow
                key={completionRequest?.job.gr_jobid ?? 'no-completion'}
                request={completionRequest}
                equipment={equipmentList}
                jobs={jobs}
                servicePlans={servicePlans}
                isCompleting={isCompletingJob}
                error={completionError}
                onCancel={cancelJobCompletion}
                onSetupMaintenance={setupEquipmentMaintenance}
                onCompleteStandard={completeStandardJob}
                onCompleteService={completeServiceJob}
                onCompleteWof={completeWofJob}
            />
        </div>
    )
}
