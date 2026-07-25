import { useEffect, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import JobsTable from './components/JobsTable'
import JobEditDrawer from './components/JobEditDrawer'
import JobCreateDrawer from './components/JobCreateDrawer'
import type { Job } from './types/job.types'
import { DEFAULT_JOBS_VIEW_STATE, applyJobsDefaultView, getJobsViewStateKey, restoreJobsViewState, type JobsViewState, type ScheduledJobsVisibility } from './types/jobsViewState.types'
import { JOB_STATUSES, JOB_STATUS_OPTIONS, type JobStatus } from './types/jobStatus.types'
import { JOB_TYPE_OPTIONS } from './types/jobType.types'
import { APPLICATION_DEFAULT_JOBS_VIEW, canonicaliseJobStatuses, getJobsDefaultViewKey, restoreJobsDefaultView, saveJobsDefaultView, type JobsDefaultView } from './types/jobsDefaultView.types'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import PageSettingsButton from '../shared/settings/PageSettingsButton'
import PageSettingsDialog from '../shared/settings/PageSettingsDialog'
import './JobsScreen.css'
import { useNavigate } from 'react-router-dom'
import { JOBS_TABLE_COLUMNS, type JobsStickyThroughColumnId } from './types/jobsTableColumns'
import JobCompletionWorkflow from './components/JobCompletionWorkflow'

export default function JobsScreen() {
    const navigate = useNavigate()
    const activeAccount = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(activeAccount)
    const storageKey = signedInUser ? getJobsViewStateKey(signedInUser.storageId) : null
    const defaultViewStorageKey = signedInUser ? getJobsDefaultViewKey(signedInUser.storageId) : null
    const {
        jobs, equipmentList, mechanics, sites, customers, siteContacts,
        scheduleOptions,
        jobQuotes,
        jobAssignments,
        servicePlans,
        officeUpdates,
        createJob, updateJob, deleteJob, updateJobStatus, updateJobFields,
        updateJobCardStatus,
        sendPrimaryJobEmail, sendAssignmentJobEmail, prepareTechnicianJobEmail,
        createJobAssignment, deleteJobAssignment,
        createContactForSite, createEquipment, createSite, createCustomer,
        createScheduleOption, updateScheduleOption, deleteScheduleOption,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        completionRequest, isCompletingJob, completionError, completeServiceJob, completeWofJob, cancelJobCompletion,
        isLoading, loadError, retryInitialLoad, fetchJobForDrawer,
    } = useJobs()
    const [editingJob, setEditingJob] = useState<Job | null>(null)
    const [editingInitialTab, setEditingInitialTab] = useState<'details' | 'jobcard'>('details')
    const [isCreatingJob, setIsCreatingJob] = useState(false)
    const [defaultView, setDefaultView] = useState<JobsDefaultView>(() => defaultViewStorageKey
        ? restoreJobsDefaultView(defaultViewStorageKey) ?? APPLICATION_DEFAULT_JOBS_VIEW
        : APPLICATION_DEFAULT_JOBS_VIEW)
    const [viewState, setViewState] = useState<JobsViewState>(() => storageKey
        ? restoreJobsViewState(storageKey, true) ?? applyJobsDefaultView(defaultView)
        : DEFAULT_JOBS_VIEW_STATE)
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
        navigate(`/quotes?new=1&jobId=${encodeURIComponent(jobId)}`)
    }

    const openQuote = (quoteId: string) => {
        setEditingJob(null)
        navigate(`/quotes?quoteId=${encodeURIComponent(quoteId)}`)
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
        setEditingInitialTab(tab)
        setEditingJob(job)
        void fetchJobForDrawer(job.gr_jobid).then((refreshedJob) => {
            if (!refreshedJob) return
            setEditingJob((current) => current?.gr_jobid === job.gr_jobid ? refreshedJob : current)
        }).catch(() => {
            // The already-loaded Job remains available if the background refresh fails.
        })
    }

    const currentMatchesDefault = viewState.selectedJobType === defaultView.selectedJobType
        && canonicaliseJobStatuses(viewState.visibleStatuses).join(',') === canonicaliseJobStatuses(defaultView.visibleStatuses).join(',')
        && viewState.searchText === ''

    const resetToDefault = () => {
        const savedDefault = defaultViewStorageKey
            ? restoreJobsDefaultView(defaultViewStorageKey) ?? APPLICATION_DEFAULT_JOBS_VIEW
            : APPLICATION_DEFAULT_JOBS_VIEW
        setDefaultView(savedDefault)
        setViewState((current) => ({
            ...current,
            selectedJobType: savedDefault.selectedJobType,
            visibleStatuses: [...savedDefault.visibleStatuses],
            searchText: '',
        }))
    }

    const filteredJobs = jobs.filter((job) => visibleStatuses.includes(job.gr_status))
    const scheduledSettingLabels: Record<ScheduledJobsVisibility, string> = {
        all: 'All scheduled Jobs',
        today: 'Scheduled today',
        'today-tomorrow': 'Scheduled today and tomorrow',
        'this-week': 'Scheduled this week',
    }
    const sharedDrawerProps = {
        mechanics,
        equipmentList,
        sites,
        customers,
        siteContacts,
        servicePlans,
        onCreateCustomer: createCustomer,
        onCreateSite: createSite,
        onCreateContact: createContactForSite,
        onCreateEquipment: createEquipment,
    }

    return (
        <div className="jobs-page">
            <header className="jobs-page-header">
                <h1>Jobs</h1>
                <div className="jobs-page-header-actions">
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
                        className="jobs-create-button"
                        type="button"
                        onClick={() => setIsCreatingJob(true)}
                        disabled={isLoading || Boolean(loadError)}
                    >
                        + Create job
                    </button>
                </div>
            </header>

            {isLoading ? (
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
            ) : jobs.length === 0 ? (
                <section className="jobs-data-state">
                    <div>
                        <h2>No jobs found</h2>
                        <p>Dataverse is connected, but the jobs table contains no records.</p>
                    </div>
                </section>
            ) : (
                <JobsTable
                    jobs={filteredJobs}
                    visibleStatuses={visibleStatuses}
                    viewState={viewState}
                    onViewStateChange={setViewState}
                    onToggleStatus={toggleStatus}
                    onResetToDefault={resetToDefault}
                    resetToDefaultDisabled={currentMatchesDefault}
                    onStatusChange={updateJobStatus}
                    onJobFieldsChange={updateJobFields}
                    onEmailTechnician={prepareTechnicianJobEmail}
                    onEditJob={(job) => openJob(job)}
                    onOpenJobCard={(job) => openJob(job, 'jobcard')}
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
                        visibleStatuses: canonicaliseJobStatuses(
                            draftDefaultView.selectedJobType === 'unconfirmed'
                                && !draftDefaultView.visibleStatuses.includes(JOB_STATUSES.UNCONFIRMED)
                                ? [...draftDefaultView.visibleStatuses, JOB_STATUSES.UNCONFIRMED]
                                : draftDefaultView.visibleStatuses,
                        ),
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
                                selectedJobType: event.target.value === 'all' || event.target.value === 'unconfirmed'
                                    ? event.target.value
                                    : Number(event.target.value) as JobsDefaultView['selectedJobType'],
                            }))}
                        >
                            <option value="all">All jobs</option>
                            {JOB_TYPE_OPTIONS.map((jobType) => <option key={jobType.value} value={jobType.value}>{jobType.label}</option>)}
                            <option value="unconfirmed">Unconfirmed</option>
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
                    onCreateJob={createJob}
                    onCreateScheduleOption={createScheduleOption}
                    onClose={() => setIsCreatingJob(false)}
                />
            )}

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
                    quotes={jobQuotes.filter((quote) =>
                        quote._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase(),
                    )}
                    assignments={jobAssignments.filter((assignment) =>
                        assignment._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase(),
                    )}
                    servicePlans={servicePlans}
                    onCreateQuote={createQuoteForJob}
                    onOpenQuote={openQuote}
                    onJobCardStatusChange={updateJobCardStatus}
                    onCreateAssignment={createJobAssignment}
                    onSendPrimary={sendPrimaryJobEmail}
                    onSendAssignment={sendAssignmentJobEmail}
                    onDeleteAssignment={deleteJobAssignment}
                    officeUpdates={officeUpdates.filter((update) => update.jobId.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
                    onCreateOfficeUpdate={createJobOfficeUpdate}
                    onSaveOfficeAttention={updateJobOfficeAttention}
                    onClose={() => {
                        setEditingJob(null)
                        setEditingInitialTab('details')
                    }}
                />
            )}
            <JobCompletionWorkflow
                key={completionRequest?.job.gr_jobid ?? 'no-completion'}
                request={completionRequest}
                equipment={equipmentList}
                servicePlans={servicePlans}
                isCompleting={isCompletingJob}
                error={completionError}
                onCancel={cancelJobCompletion}
                onCompleteService={completeServiceJob}
                onCompleteWof={completeWofJob}
            />
        </div>
    )
}
