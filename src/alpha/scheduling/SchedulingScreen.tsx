import { useEffect, useMemo, useState } from 'react'
import { useJobs } from '../jobs/hooks/useJobs'
import { jobIsSchedulerEligible } from '../jobs/types/jobSchedulerEligibility'
import {
    SCHEDULE_TYPE,
    type JobScheduleOption,
} from '../jobs/types/jobSchedule.types'
import type { Job } from '../jobs/types/job.types'
import JobEditDrawer from '../jobs/components/JobEditDrawer'
import JobCompletionWorkflow from '../jobs/components/JobCompletionWorkflow'
import JobTypeTabs from '../jobs/components/JobTypeTabs'
import { JOB_TYPES, SCHEDULER_JOB_TYPE_OPTIONS } from '../jobs/types/jobType.types'
import '../jobs/components/JobTypeControls.css'
import './SchedulingScreen.css'
import { useNavigate } from 'react-router-dom'
import { getJobTypeLabel } from '../jobs/types/jobType.types'
import {
    SCHEDULING_DISPLAY_MODE_KEY,
    SCHEDULING_JOB_TYPE_FILTER_KEY,
    restoreSchedulingDisplayMode,
    restoreSchedulingJobTypeFilter,
    type SchedulingDisplayMode,
    type SchedulingJobTypeFilter,
} from './schedulingDisplayMode'

const dayHeadingFormatter = new Intl.DateTimeFormat('en-NZ', { weekday: 'short' })
const dayNumberFormatter = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
})
const rangeFormatter = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('en-NZ', {
    hour: 'numeric',
    minute: '2-digit',
})

function startOfWeek(value: Date) {
    const date = new Date(value)
    date.setHours(12, 0, 0, 0)
    const daysSinceMonday = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - daysSinceMonday)
    return date
}

function addDays(value: Date, days: number) {
    const date = new Date(value)
    date.setDate(date.getDate() + days)
    return date
}

function dateKey(value: Date | string) {
    if (typeof value === 'string') return value.slice(0, 10)

    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function scheduleLabel(option: JobScheduleOption) {
    switch (option.gr_scheduletype) {
        case SCHEDULE_TYPE.WEEK:
            return 'Flexible this week'
        case SCHEDULE_TYPE.ANY_TIME:
            return 'Any time'
        case SCHEDULE_TYPE.MORNING:
            return 'Morning'
        case SCHEDULE_TYPE.AFTER_TIME:
            return option.gr_scheduletime
                ? `After ${timeFormatter.format(new Date(option.gr_scheduletime))}`
                : 'After time'
        case SCHEDULE_TYPE.EXACT_TIME:
            return option.gr_scheduletime
                ? timeFormatter.format(new Date(option.gr_scheduletime))
                : 'Exact time'
    }
}

function ScheduleCard({
    option,
    job,
    onOpen,
    variant,
}: {
    option: JobScheduleOption
    job?: Job
    onOpen: (job: Job) => void
    variant: 'expanded' | 'compact'
}) {
    const customerName = job?.gr_Site?.gr_Customer?.gr_name || 'No customer'
    const jobNumber = job?.gr_jobnumber || 'Unnumbered job'
    const jobType = getJobTypeLabel(job?.gr_jobtype)
    const confirmationLabel = option.gr_confirmed ? 'Confirmed' : 'Option'

    return (
        <button
            type="button"
            className={`job-type-colour schedule-card schedule-card-${variant}${option.gr_confirmed ? ' confirmed' : ''}`}
            data-job-type={job?.gr_jobtype ?? ''}
            onClick={() => job && onOpen(job)}
            disabled={!job}
            aria-label={job ? `Edit ${customerName}, job ${jobNumber}, ${jobType}, ${confirmationLabel}` : undefined}
        >
            {variant === 'compact' && (
                <div className="schedule-card-compact-content" aria-hidden="true">
                    <strong className="schedule-card-customer" title={customerName}>{customerName}</strong>
                    <div className="schedule-card-topline">
                        <span>{jobNumber}</span>
                        <span>{confirmationLabel}</span>
                    </div>
                    <p>{job?.gr_description || 'No description'}</p>
                </div>
            )}
            <div className="schedule-card-expanded-content">
                <strong className="schedule-card-customer" title={customerName}>{customerName}</strong>
                <div className="schedule-card-topline">
                    <span>{jobNumber}</span>
                    <span>{confirmationLabel}</span>
                </div>
                <p>{job?.gr_description || 'No description'}</p>
                <div className="schedule-card-detail">
                    <span>{job?.gr_Equipment?.gr_fleet || 'No equipment'}</span>
                    <span>{job?.gr_Site?.gr_name || 'No site'}</span>
                </div>
                <div className="schedule-card-footer">
                    <span>{job?.gr_Mechanic?.gr_name || 'Unassigned'}</span>
                    <span>{scheduleLabel(option)}</span>
                </div>
            </div>
        </button>
    )
}

function getCardVariant(
    displayMode: SchedulingDisplayMode,
    option: JobScheduleOption,
    todayKey: string,
): 'expanded' | 'compact' {
    if (displayMode === 'expanded') return 'expanded'
    return displayMode === 'today-expanded'
        && option.gr_scheduletype !== SCHEDULE_TYPE.WEEK
        && dateKey(option.gr_scheduledate) === todayKey
        ? 'expanded'
        : 'compact'
}

export default function SchedulingScreen() {
    const navigate = useNavigate()
    const {
        jobs,
        scheduleOptions,
        jobQuotes,
        jobAssignments,
        servicePlans,
        mechanics,
        equipmentList,
        sites,
        customers,
        siteContacts,
        createCustomer,
        createSite,
        createContactForSite,
        createEquipment,
        updateJob,
        updateJobCardStatus,
        sendPrimaryJobEmail,
        sendAssignmentJobEmail,
        createJobAssignment,
        deleteJobAssignment,
        deleteJob,
        createScheduleOption,
        updateScheduleOption,
        deleteScheduleOption,
        completionRequest, isCompletingJob, completionError, completeServiceJob, completeWofJob, cancelJobCompletion,
        isLoading,
        loadError,
        retryInitialLoad,
    } = useJobs()
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
    const [editingJob, setEditingJob] = useState<Job | null>(null)
    const [displayMode, setDisplayMode] = useState<SchedulingDisplayMode>(restoreSchedulingDisplayMode)
    const [selectedJobType, setSelectedJobType] = useState<SchedulingJobTypeFilter>(restoreSchedulingJobTypeFilter)

    useEffect(() => {
        try {
            sessionStorage.setItem(SCHEDULING_DISPLAY_MODE_KEY, displayMode)
        } catch {
            // The planner remains usable when storage is unavailable.
        }
    }, [displayMode])

    useEffect(() => {
        try {
            sessionStorage.setItem(SCHEDULING_JOB_TYPE_FILTER_KEY, String(selectedJobType))
        } catch {
            // The planner remains usable when storage is unavailable.
        }
    }, [selectedJobType])

    const createQuoteForJob = (jobId: string) => {
        setEditingJob(null)
        navigate(`/quotes?new=1&jobId=${encodeURIComponent(jobId)}`)
    }

    const openQuote = (quoteId: string) => {
        setEditingJob(null)
        navigate(`/quotes?quoteId=${encodeURIComponent(quoteId)}`)
    }

    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
        [weekStart],
    )
    const weekEnd = weekDays[6]
    const jobsById = useMemo(
        () => new Map(jobs.map((job) => [job.gr_jobid.toLowerCase(), job])),
        [jobs],
    )
    const optionsThisWeek = scheduleOptions.filter((option) => {
        const optionDate = dateKey(option.gr_scheduledate)
        return optionDate >= dateKey(weekStart) && optionDate <= dateKey(weekEnd)
    })
    const visibleOptionsThisWeek = optionsThisWeek.filter((option) => {
        const job = jobsById.get(option._gr_job_value?.toLowerCase())
        if (!job || !jobIsSchedulerEligible(job)) return false
        if (selectedJobType === 'all') return true
        return job.gr_jobtype === selectedJobType
    })
    const excludedSiteCheckOptions = optionsThisWeek.filter((option) =>
        jobsById.get(option._gr_job_value?.toLowerCase())?.gr_jobtype === JOB_TYPES.SITE_CHECK)
    const flexibleWeekOptions = visibleOptionsThisWeek.filter(
        (option) => option.gr_scheduletype === SCHEDULE_TYPE.WEEK,
    )
    const todayKey = dateKey(new Date())

    return (
        <div className="scheduling-page">
            <header className="scheduling-page-header">
                <div>
                    <p>Operations</p>
                    <h1>Scheduling</h1>
                </div>
                <div className="scheduling-week-controls">
                    <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                        Today
                    </button>
                    <div>
                        <button
                            type="button"
                            aria-label="Previous week"
                            onClick={() => setWeekStart((current) => addDays(current, -7))}
                        >
                            ←
                        </button>
                        <button
                            type="button"
                            aria-label="Next week"
                            onClick={() => setWeekStart((current) => addDays(current, 7))}
                        >
                            →
                        </button>
                    </div>
                </div>
            </header>

            {isLoading ? (
                <section className="scheduling-data-state" aria-live="polite">
                    <h2>Loading schedule</h2>
                    <p>Connecting to Dataverse and preparing the weekly planner.</p>
                </section>
            ) : loadError ? (
                <section className="scheduling-data-state scheduling-data-state-error" role="alert">
                    <div>
                        <h2>Schedule could not be loaded</h2>
                        <p>Dataverse returned an error. Check the details or try again.</p>
                        <details>
                            <summary>Error details</summary>
                            <pre>{loadError}</pre>
                        </details>
                    </div>
                    <button type="button" onClick={retryInitialLoad}>Try again</button>
                </section>
            ) : (
            <>
            <section className="scheduling-summary">
                <div>
                    <span>Seven-day planner</span>
                    <h2>{rangeFormatter.format(weekStart)} – {rangeFormatter.format(weekEnd)}</h2>
                </div>
                <div className="scheduling-summary-controls">
                    <div className="scheduling-display-mode" role="group" aria-label="Schedule card display mode">
                        {([
                            ['expanded', 'Expanded'],
                            ['compact', 'Compact'],
                            ['today-expanded', 'Today Expanded'],
                        ] as const).map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                className={displayMode === mode ? 'active' : ''}
                                aria-pressed={displayMode === mode}
                                onClick={() => setDisplayMode(mode)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <span>{visibleOptionsThisWeek.length} scheduled {visibleOptionsThisWeek.length === 1 ? 'option' : 'options'}</span>
                </div>
            </section>

            <div className="scheduling-job-type-filter">
                <JobTypeTabs
                    selectedJobType={selectedJobType}
                    includeOperational={false}
                    jobTypeOptions={SCHEDULER_JOB_TYPE_OPTIONS}
                    onChange={(jobType) => {
                        if (jobType !== 'unconfirmed' && jobType !== 'operational') setSelectedJobType(jobType)
                    }}
                    ariaLabel="Filter scheduled jobs by type"
                />
            </div>

            {excludedSiteCheckOptions.length > 0 && <p className="scheduling-site-check-audit" role="status">
                {excludedSiteCheckOptions.length} historical Site Check schedule option{excludedSiteCheckOptions.length === 1 ? ' is' : 's are'} hidden. Review the source Jobs before any separately approved cleanup.
            </p>}

            <div className="schedule-board-scroll">
                <div className="schedule-board">
                    {flexibleWeekOptions.length > 0 && (
                        <section className="schedule-flexible-lane">
                            <div>
                                <strong>Flexible this week</strong>
                                <span>Can be completed on any suitable day</span>
                            </div>
                            <div className="schedule-flexible-cards">
                                {flexibleWeekOptions.map((option) => (
                                    <ScheduleCard
                                        key={option.gr_jobscheduleoptionid}
                                        option={option}
                                        job={jobsById.get(option._gr_job_value?.toLowerCase())}
                                        onOpen={setEditingJob}
                                        variant={getCardVariant(displayMode, option, todayKey)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="schedule-week-grid">
                        {weekDays.map((day) => {
                            const currentDateKey = dateKey(day)
                            const dayOptions = visibleOptionsThisWeek.filter(
                                (option) =>
                                    option.gr_scheduletype !== SCHEDULE_TYPE.WEEK
                                    && dateKey(option.gr_scheduledate) === currentDateKey,
                            )

                            return (
                                <section
                                    className={`schedule-day${currentDateKey === todayKey ? ' today' : ''}`}
                                    key={currentDateKey}
                                >
                                    <header>
                                        <span>{dayHeadingFormatter.format(day)}</span>
                                        <strong>{dayNumberFormatter.format(day)}</strong>
                                        <small>{dayOptions.length}</small>
                                    </header>
                                    <div className="schedule-day-cards">
                                        {dayOptions.map((option) => (
                                            <ScheduleCard
                                                key={option.gr_jobscheduleoptionid}
                                                option={option}
                                                job={jobsById.get(option._gr_job_value?.toLowerCase())}
                                                onOpen={setEditingJob}
                                                variant={getCardVariant(displayMode, option, todayKey)}
                                            />
                                        ))}
                                        {dayOptions.length === 0 && (
                                            <span className="schedule-empty-day">No scheduled work</span>
                                        )}
                                    </div>
                                </section>
                            )
                        })}
                    </div>
                </div>
            </div>
            </>
            )}

            {editingJob && (
                <JobEditDrawer
                    job={editingJob}
                    mechanics={mechanics}
                    equipmentList={equipmentList}
                    sites={sites}
                    customers={customers}
                    siteContacts={siteContacts}
                    scheduleOptions={scheduleOptions}
                    servicePlans={servicePlans}
                    onCreateCustomer={createCustomer}
                    onCreateSite={createSite}
                    onCreateContact={createContactForSite}
                    onCreateEquipment={createEquipment}
                    onSave={updateJob}
                    onDelete={deleteJob}
                    onCreateScheduleOption={createScheduleOption}
                    onUpdateScheduleOption={updateScheduleOption}
                    onDeleteScheduleOption={deleteScheduleOption}
                    quotes={jobQuotes.filter((quote) =>
                        quote._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase(),
                    )}
                    assignments={jobAssignments.filter((assignment) =>
                        assignment._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase(),
                    )}
                    onCreateQuote={createQuoteForJob}
                    onOpenQuote={openQuote}
                    onJobCardStatusChange={updateJobCardStatus}
                    onCreateAssignment={createJobAssignment}
                    onSendPrimary={sendPrimaryJobEmail}
                    onSendAssignment={sendAssignmentJobEmail}
                    onDeleteAssignment={deleteJobAssignment}
                    onClose={() => setEditingJob(null)}
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
