import { JOB_TYPE_OPTIONS, type JobType } from '../types/jobType.types'
import './JobTypeControls.css'

export type JobTypeFilter = JobType | 'all'

type Props = {
    selectedJobType: JobTypeFilter
    onChange: (jobType: JobTypeFilter) => void
    ariaLabel?: string
}

export default function JobTypeTabs({ selectedJobType, onChange, ariaLabel = 'Filter jobs by type' }: Props) {
    return (
        <div className="job-type-tabs" role="tablist" aria-label={ariaLabel}>
            <button type="button" role="tab" aria-selected={selectedJobType === 'all'} className={selectedJobType === 'all' ? 'job-type-tab active' : 'job-type-tab'} onClick={() => onChange('all')}>
                All jobs
            </button>
            {JOB_TYPE_OPTIONS.map((jobType) => (
                <button key={jobType.value} type="button" role="tab" aria-selected={selectedJobType === jobType.value} className={selectedJobType === jobType.value ? 'job-type-tab active' : 'job-type-tab'} onClick={() => onChange(jobType.value)}>
                    {jobType.label}
                </button>
            ))}
        </div>
    )
}
