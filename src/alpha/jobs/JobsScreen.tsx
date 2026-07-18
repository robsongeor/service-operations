import { useState } from 'react'
import { useJobs } from './hooks/useJobs'
import JobsTable from './components/JobsTable'
import JobEditDrawer from './components/JobEditDrawer'
import JobCreateDrawer from './components/JobCreateDrawer'
import { emailJobToMechanic } from './services/jobEmail'
import type { Job } from './types/job.types'
import { JOB_STATUSES, type JobStatus } from './types/jobStatus.types'
import './JobsScreen.css'

export default function JobsScreen() {
    const {
        jobs, equipmentList, mechanics, sites, customers, siteContacts,
        scheduleOptions,
        createJob, updateJob, deleteJob, updateJobStatus, updateJobFields,
        createContactForSite, createEquipment, createSite, createCustomer,
        createScheduleOption, updateScheduleOption, deleteScheduleOption,
    } = useJobs()
    const [editingJob, setEditingJob] = useState<Job | null>(null)
    const [isCreatingJob, setIsCreatingJob] = useState(false)
    const [visibleStatuses, setVisibleStatuses] = useState<JobStatus[]>([
        JOB_STATUSES.UNALLOCATED,
        JOB_STATUSES.ALLOCATED,
        JOB_STATUSES.WAITING_FOR_PARTS,
        JOB_STATUSES.COMPLETE,
    ])

    const toggleStatus = (status: JobStatus) => {
        setVisibleStatuses((current) => current.includes(status)
            ? current.filter((currentStatus) => currentStatus !== status)
            : [...current, status])
    }

    const filteredJobs = jobs.filter((job) => visibleStatuses.includes(job.gr_status))
    const sharedDrawerProps = {
        mechanics,
        equipmentList,
        sites,
        customers,
        siteContacts,
        onCreateCustomer: createCustomer,
        onCreateSite: createSite,
        onCreateContact: createContactForSite,
        onCreateEquipment: createEquipment,
    }

    return (
        <div className="jobs-page">
            <header className="jobs-page-header">
                <h1>Jobs</h1>
                <button className="jobs-create-button" type="button" onClick={() => setIsCreatingJob(true)}>
                    + Create job
                </button>
            </header>

            <JobsTable
                jobs={filteredJobs}
                visibleStatuses={visibleStatuses}
                onToggleStatus={toggleStatus}
                onStatusChange={updateJobStatus}
                onJobFieldsChange={updateJobFields}
                onEmailJob={emailJobToMechanic}
                onEditJob={setEditingJob}
                mechanics={mechanics}
            />

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
                    onSave={updateJob}
                    onDelete={deleteJob}
                    scheduleOptions={scheduleOptions}
                    onCreateScheduleOption={createScheduleOption}
                    onUpdateScheduleOption={updateScheduleOption}
                    onDeleteScheduleOption={deleteScheduleOption}
                    onClose={() => setEditingJob(null)}
                />
            )}
        </div>
    )
}
