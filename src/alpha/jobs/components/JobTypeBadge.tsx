import { getJobTypeLabel, type JobType } from '../types/jobType.types'
import './JobTypeControls.css'

type Props = { jobType?: JobType }

export default function JobTypeBadge({ jobType }: Props) {
    return <span className="job-type-colour job-type-badge" data-job-type={jobType ?? ''}>{getJobTypeLabel(jobType)}</span>
}
