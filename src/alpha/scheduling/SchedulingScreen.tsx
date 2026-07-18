import { useMemo, useState } from 'react'
import { useJobs } from '../jobs/hooks/useJobs'
import {
    SCHEDULE_TYPE,
    type JobScheduleOption,
} from '../jobs/types/jobSchedule.types'
import type { Job } from '../jobs/types/job.types'
import JobEditDrawer from '../jobs/components/JobEditDrawer'
import './SchedulingScreen.css'
import { useNavigate } from 'react-router-dom'

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
}: {
    option: JobScheduleOption
    job?: Job
    onOpen: (job: Job) => void
}) {
    return (
        <button
            type="button"
            className={`schedule-card${option.gr_confirmed ? ' confirmed' : ''}`}
            onClick={() => job && onOpen(job)}
            disabled={!job}
            aria-label={job ? `Edit job ${job.gr_jobnumber || 'without a job number'}` : undefined}
        >
            <div className="schedule-card-topline">
                <span>{scheduleLabel(option)}</span>
                <span>{option.gr_confirmed ? 'Confirmed' : 'Option'}</span>
            </div>
            <strong>{job?.gr_jobnumber || 'Unnumbered job'}</strong>
            <p>{job?.gr_description || 'No description'}</p>
            <div className="schedule-card-detail">
                <span>{job?.gr_Site?.gr_Customer?.gr_name || 'No customer'}</span>
                <span>{job?.gr_Site?.gr_name || 'No site'}</span>
            </div>
            <div className="schedule-card-footer">
                <span>{job?.gr_Mechanic?.gr_name || 'Unassigned'}</span>
                {job?.gr_Equipment?.gr_fleet && <span>{job.gr_Equipment.gr_fleet}</span>}
            </div>
        </button>
    )
}

export default function SchedulingScreen() {
    const navigate = useNavigate()
    const {
        jobs,
        scheduleOptions,
        jobQuotes,
        jobAssignments,
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
        isLoading,
        loadError,
        retryInitialLoad,
    } = useJobs()
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
    const [editingJob, setEditingJob] = useState<Job | null>(null)

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
    const flexibleWeekOptions = optionsThisWeek.filter(
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
                <span>{optionsThisWeek.length} scheduled {optionsThisWeek.length === 1 ? 'option' : 'options'}</span>
            </section>

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
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="schedule-week-grid">
                        {weekDays.map((day) => {
                            const currentDateKey = dateKey(day)
                            const dayOptions = optionsThisWeek.filter(
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
        </div>
    )
}
