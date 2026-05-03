import type { Job } from '../types/job.types'

type Props = {
    jobs: Job[]
}

export default function JobsTable({ jobs }: Props) {

    return (
        <table>
            <thead>
                <tr>
                    <th>Job Number</th>
                    <th>Description</th>
                    <th>Equipment</th>
                    <th>Mechanic</th>
                    <th>Site</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Order Number</th>
                </tr>
            </thead>

            <tbody>
                {jobs.map((job) => (
                    <tr key={job.gr_jobid}>
                        <td>{job.gr_jobnumber}</td>


                        <td>{job.gr_description}</td>
                        <td>
                            {job.gr_Equipment
                                ? `${job.gr_Equipment.gr_fleet} - ${job.gr_Equipment.gr_make} ${job.gr_Equipment.gr_model} - ${job.gr_Equipment.gr_serial}`
                                : 'No equipment'}
                        </td>
                        <td>

                            {job.gr_Mechanic
                                ? `${job.gr_Mechanic.gr_name}`
                                : 'No mechanic'}
                        </td>
                        <td>
                            {job.gr_Site
                                ? `${job.gr_Site.gr_Customer?.gr_name ?? 'Unknown'} - ${job.gr_Site.gr_name} - ${job.gr_Site.gr_address}`
                                : 'No site'}
                        </td>
                        <td>
                            {job.gr_Contact
                                ? `${job.gr_Contact.gr_name} - ${job.gr_Contact.gr_phone}`
                                : 'No contact'}
                        </td>
                        <td>{job.gr_status}</td>
                        <td>{job.gr_ordernumber}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}