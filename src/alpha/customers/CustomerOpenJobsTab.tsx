import { useMemo } from 'react'
import type { Job } from '../jobs/types/job.types'
import { getJobTypeLabel } from '../jobs/types/jobType.types'
import { JOB_STATUS_OPTIONS } from '../jobs/types/jobStatus.types'
import { jobNeedsOfficeAttention, type JobOfficeUpdate } from '../jobs/types/officeAction.types'

type Props = {
    jobs: Job[]
    officeUpdates: JobOfficeUpdate[]
    isLoading: boolean
    error: string
    onOpenJob: (job: Job) => void
}

type JobGroup = {
    id: string
    name: string
    address: string
    jobs: Job[]
}

export default function CustomerOpenJobsTab({ jobs, officeUpdates, isLoading, error, onOpenJob }: Props) {
    const latestUpdates = useMemo(() => officeUpdates.reduce<Record<string, JobOfficeUpdate>>((latest, update) => {
        const jobId = update.jobId.toLowerCase()
        if (!latest[jobId] || latest[jobId].createdAt < update.createdAt) latest[jobId] = update
        return latest
    }, {}), [officeUpdates])

    const groups = useMemo(() => {
        const grouped = new Map<string, JobGroup>()
        for (const job of jobs) {
            const id = job.gr_Site?.gr_siteid ?? '__unassigned__'
            const group = grouped.get(id) ?? {
                id,
                name: job.gr_Site?.gr_name || 'Unassigned / Customer-wide',
                address: job.gr_Site?.gr_address || '',
                jobs: [],
            }
            group.jobs.push(job)
            grouped.set(id, group)
        }

        return [...grouped.values()]
            .map((group) => ({ ...group, jobs: [...group.jobs].sort((a, b) => b.createdon.localeCompare(a.createdon)) }))
            .sort((a, b) => a.id === '__unassigned__' ? 1 : b.id === '__unassigned__' ? -1 : a.name.localeCompare(b.name))
    }, [jobs])

    if (isLoading) return <section className="customer-workspace-state">Loading open Jobs...</section>
    if (error) return <section className="customer-workspace-state error" role="alert">Open Jobs could not be loaded. {error}</section>
    if (jobs.length === 0) return <section className="customer-workspace-state">No open Jobs for this Customer.</section>

    return <section className="customer-open-jobs-panel" role="tabpanel">
        <header><div><span>Current workload</span><h3>Open Jobs</h3></div><strong>{jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'}</strong></header>
        <div className="customer-job-groups">
            {groups.map((group) => <section key={group.id} className="customer-job-group">
                <header>
                    <div><h4>{group.name}</h4>{group.address && <p>{group.address}</p>}</div>
                    <span>{group.jobs.length} open</span>
                </header>
                <div className="customer-job-list">
                    {group.jobs.map((job) => {
                        const status = JOB_STATUS_OPTIONS.find((option) => option.value === job.gr_status)?.label ?? 'Unknown'
                        const latestUpdate = latestUpdates[job.gr_jobid.toLowerCase()]
                        return <button type="button" key={job.gr_jobid} onClick={() => onOpenJob(job)}>
                            <div className="customer-job-number">
                                <span>{jobNeedsOfficeAttention(job) && <i title="Office attention required" aria-label="Office attention required" />}{job.gr_jobnumber || 'No Job Number'}</span>
                                <small>{getJobTypeLabel(job.gr_jobtype)}</small>
                            </div>
                            <span className="customer-job-status" data-status={job.gr_status}>{status}</span>
                            <div><strong>{job.gr_Equipment?.gr_fleet || 'No Equipment'}</strong><small>{job.gr_description || 'No description'}</small></div>
                            <div><strong>{job.gr_Mechanic?.gr_name || 'Unallocated'}</strong><small>{latestUpdate?.text || 'No office update'}</small></div>
                        </button>
                    })}
                </div>
            </section>)}
        </div>
    </section>
}
