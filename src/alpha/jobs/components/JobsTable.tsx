import type { Job } from '../types/job.types'
import './JobsTable.css'

type Props = {
    jobs: Job[]
    onStatusChange: (jobId: string, status: number) => void
}

const statusOptions = [
    { label: 'Unallocated', value: 122830001 },
    { label: 'Allocated', value: 122830000 },
    { label: 'Waiting for parts', value: 122830002 },
    { label: 'Complete', value: 122830003 },
]

export default function JobsTable({ jobs, onStatusChange }: Props) {

    return (
        <div className="jobs-table-wrapper">
            <table className="jobs-table">
                <thead>
                    <tr>
                        <th>Job Number</th>
                        <th>Equipment</th>
                        <th>Site</th>
                        <th>Description</th>
                        <th>Contact</th>
                        <th>Mechanic</th>
                        <th>Status</th>
                        <th>Order Number</th>
                    </tr>
                </thead>

                <tbody>
                    {jobs.map((job) => (
                        <tr key={job.gr_jobid}>
                            <td>{job.gr_jobnumber}</td>

                            <td>
                                {job.gr_Equipment
                                    ? `${job.gr_Equipment.gr_fleet} - ${job.gr_Equipment.gr_make} ${job.gr_Equipment.gr_model} - ${job.gr_Equipment.gr_serial}`
                                    : ''}
                            </td>

                            <td>
                                {job.gr_Site
                                    ? `${job.gr_Site.gr_Customer?.gr_name ?? 'Unknown'} - ${job.gr_Site.gr_name} - ${job.gr_Site.gr_address}`
                                    : ''}
                            </td>

                            <td>{job.gr_description}</td>
                            <td>
                                {job.gr_Contact
                                    ? `${job.gr_Contact.gr_name} - ${job.gr_Contact.gr_phone}`
                                    : ''}
                            </td>
                            <td>

                                {job.gr_Mechanic
                                    ? `${job.gr_Mechanic.gr_name}`
                                    : ''}
                            </td>

                            <td>
                                <select
                                    value={job.gr_status}
                                    onChange={(e) => {
                                        const newStatus = Number(e.target.value)
                                        onStatusChange(job.gr_jobid, newStatus)
                                    }}
                                >
                                    {statusOptions.map((status) => (
                                        <option key={status.value} value={status.value}>
                                            {status.label}
                                        </option>
                                    ))}
                                </select>
                            </td>

                            <td>{job.gr_ordernumber}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}