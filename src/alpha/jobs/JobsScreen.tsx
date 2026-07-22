import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useJobs } from './hooks/useJobs'
import JobsTable from './components/JobsTable'
import JobEditDrawer from './components/JobEditDrawer'
import JobCreateDrawer from './components/JobCreateDrawer'
import type { Job } from './types/job.types'
import type { JobStatus } from './types/jobStatus.types'
import { DEFAULT_JOBS_VIEW_STATE, getJobsViewStateKey, restoreJobsViewState, type JobsViewState, type ScheduledJobsVisibility } from './types/jobsViewState.types'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import PageSettingsButton from '../shared/settings/PageSettingsButton'
import PageSettingsDialog from '../shared/settings/PageSettingsDialog'
import './JobsScreen.css'
import { useNavigate } from 'react-router-dom'

export default function JobsScreen() {
    const navigate = useNavigate()
    const { accounts } = useMsal()
    const signedInUser = getSignedInUserInfo(accounts[0])
    const storageKey = signedInUser ? getJobsViewStateKey(signedInUser.storageId) : null
    const {
        jobs, equipmentList, mechanics, sites, customers, siteContacts,
        scheduleOptions,
        jobQuotes,
        jobAssignments,
        servicePlans,
        officeUpdates,
        createJob, updateJob, deleteJob, updateJobStatus, updateJobFields,
        updateJobCardStatus,
        sendPrimaryJobEmail, sendAssignmentJobEmail,
        createJobAssignment, deleteJobAssignment,
        createContactForSite, createEquipment, createSite, createCustomer,
        createScheduleOption, updateScheduleOption, deleteScheduleOption,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        isLoading, loadError, retryInitialLoad,
    } = useJobs()
    const [editingJob, setEditingJob] = useState<Job | null>(null)
    const [editingInitialTab, setEditingInitialTab] = useState<'details' | 'jobcard'>('details')
    const [isCreatingJob, setIsCreatingJob] = useState(false)
    const [viewState, setViewState] = useState<JobsViewState>(() => storageKey
        ? restoreJobsViewState(storageKey, true)
        : DEFAULT_JOBS_VIEW_STATE)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [draftScheduledVisibility, setDraftScheduledVisibility] = useState<ScheduledJobsVisibility>(viewState.scheduledJobsVisibility)
    const visibleStatuses = viewState.visibleStatuses

    useEffect(() => {
        if (!storageKey) return
        sessionStorage.setItem(storageKey, JSON.stringify(viewState))
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
                        onClick={() => { setDraftScheduledVisibility(viewState.scheduledJobsVisibility); setSettingsOpen(true) }}
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
                    onStatusChange={updateJobStatus}
                    onJobFieldsChange={updateJobFields}
                    onEditJob={setEditingJob}
                    mechanics={mechanics}
                    officeUpdates={officeUpdates}
                    scheduleOptions={scheduleOptions}
                />
            )}

            <PageSettingsDialog
                open={settingsOpen}
                title="Settings"
                description="Choose which scheduled Jobs appear. Unscheduled Jobs are always shown."
                onCancel={() => setSettingsOpen(false)}
                onApply={() => {
                    setViewState((current) => ({ ...current, scheduledJobsVisibility: draftScheduledVisibility }))
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
        </div>
    )
}
