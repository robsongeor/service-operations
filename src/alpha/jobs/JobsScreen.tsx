import { useEffect, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import JobsTable from './components/JobsTable'
import JobEditDrawer from './components/JobEditDrawer'
import JobCreateDrawer from './components/JobCreateDrawer'
import type { Job } from './types/job.types'
import type { JobStatus } from './types/jobStatus.types'
import { JOBS_VIEW_STATE_KEY, restoreJobsViewState, type JobsViewState } from './types/jobsViewState.types'
import './JobsScreen.css'
import { useNavigate } from 'react-router-dom'

export default function JobsScreen() {
    const navigate = useNavigate()
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
    const [viewState, setViewState] = useState<JobsViewState>(restoreJobsViewState)
    const visibleStatuses = viewState.visibleStatuses

    useEffect(() => {
        sessionStorage.setItem(JOBS_VIEW_STATE_KEY, JSON.stringify(viewState))
    }, [viewState])

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
                <button
                    className="jobs-create-button"
                    type="button"
                    onClick={() => setIsCreatingJob(true)}
                    disabled={isLoading || Boolean(loadError)}
                >
                    + Create job
                </button>
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
                    onEmailJob={sendPrimaryJobEmail}
                    onEditJob={setEditingJob}
                    mechanics={mechanics}
                    officeUpdates={officeUpdates}
                />
            )}

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
