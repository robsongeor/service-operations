import { useState } from 'react'
import type { Job } from '../types/job.types'
import './JobsTable.css'
import type { Mechanic } from '../types/mechanic.types'

type Props = {
    jobs: Job[]
    visibleStatuses: number[]
    onToggleStatus: (status: number) => void
    onStatusChange: (jobId: string, status: number) => void
    onJobFieldsChange: (
        jobId: string,
        fields: {
            gr_jobnumber?: string
            gr_description?: string
            gr_ordernumber?: string
            'gr_Mechanic@odata.bind'?: string | null
        }
    ) => void
    onEmailJob: (job: Job) => void
    mechanics: Mechanic[]
}

const statusOptions = [
    { label: 'Unallocated', value: 122830001 },
    { label: 'Allocated', value: 122830000 },
    { label: 'Waiting for parts', value: 122830002 },
    { label: 'Complete', value: 122830003 },
]

export default function JobsTable({
    jobs,
    visibleStatuses,
    onToggleStatus,
    onStatusChange,
    onJobFieldsChange,
    onEmailJob,
    mechanics,
}: Props) {


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
                        <th>
                            Status
                            <div className="jobs-table-toolbar">
                                {statusOptions.map((status) => {
                                    const isActive = visibleStatuses.includes(status.value)

                                    return (
                                        <button
                                            key={status.value}
                                            type="button"
                                            className={
                                                isActive
                                                    ? 'status-filter active'
                                                    : 'status-filter'
                                            }
                                            onClick={() => onToggleStatus(status.value)}
                                        >

                                            {status.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </th>
                        <th>Order Number</th>
                        <th>Email</th>
                    </tr>
                </thead>

                <tbody>
                    {jobs.map((job) => (
                        <tr key={job.gr_jobid}>
                            <td>
                                <input
                                    type="text"
                                    defaultValue={job.gr_jobnumber}
                                    onBlur={(e) => {
                                        const newValue = e.target.value.trim()

                                        if (newValue !== job.gr_jobnumber) {
                                            onJobFieldsChange(job.gr_jobid, {
                                                gr_jobnumber: newValue,
                                            })
                                        }
                                    }}
                                />
                            </td>

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

                            <td>
                                <textarea
                                    defaultValue={job.gr_description}
                                    rows={2}
                                    style={{ width: '100%', resize: 'vertical' }}
                                    onBlur={(e) => {
                                        const newValue = e.target.value.trim()

                                        if (newValue !== job.gr_description) {
                                            onJobFieldsChange(job.gr_jobid, {
                                                gr_description: newValue,
                                            })
                                        }
                                    }}
                                />
                            </td>
                            <td>
                                {job.gr_Contact
                                    ? `${job.gr_Contact.gr_name} - ${job.gr_Contact.gr_phone}`
                                    : ''}
                            </td>
                            <td>
                                <select
                                    value={job.gr_Mechanic?.gr_mechanicid ?? ''}
                                    onChange={(e) => {
                                        const mechanicId = e.target.value

                                        onJobFieldsChange(job.gr_jobid, {
                                            'gr_Mechanic@odata.bind': mechanicId
                                                ? `/gr_mechanics(${mechanicId})`
                                                : null,
                                        })
                                    }}
                                >
                                    <option value="">Unassigned</option>

                                    {mechanics.map((mech) => (
                                        <option key={mech.gr_mechanicid} value={mech.gr_mechanicid}>
                                            {mech.gr_name}
                                        </option>
                                    ))}
                                </select>
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

                            <td>
                                <input
                                    type="text"
                                    defaultValue={job.gr_ordernumber}
                                    onBlur={(e) => {
                                        const newValue = e.target.value.trim()

                                        if (newValue !== job.gr_ordernumber) {
                                            onJobFieldsChange(job.gr_jobid, {
                                                gr_ordernumber: newValue,
                                            })
                                        }
                                    }}
                                />
                            </td>

                            <td>
                                <button
                                    type="button"
                                    onClick={() => onEmailJob(job)}
                                    disabled={!job.gr_Mechanic}
                                >
                                    Email
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}