import { JOB_TYPE_OPTIONS, type JobTypeFilter } from '../types/jobType.types'
import './JobTypeControls.css'

type Props = {
    selectedJobType: JobTypeFilter
    onChange: (jobType: JobTypeFilter) => void
    ariaLabel?: string
    includeUnconfirmed?: boolean
    includeOperational?: boolean
    jobTypeOptions?: typeof JOB_TYPE_OPTIONS
}

export default function JobTypeTabs({
    selectedJobType,
    onChange,
    ariaLabel = 'Filter jobs by type',
    includeUnconfirmed = false,
    includeOperational = true,
    jobTypeOptions = JOB_TYPE_OPTIONS,
}: Props) {
    return (
        <div className="job-type-tabs" role="tablist" aria-label={ariaLabel}>
            {includeOperational && <button type="button" role="tab" aria-selected={selectedJobType === 'operational'} className={selectedJobType === 'operational' ? 'job-type-tab active' : 'job-type-tab'} onClick={() => onChange('operational')}>
                Operational
            </button>}
            {jobTypeOptions.map((jobType) => (
                <button key={jobType.value} type="button" role="tab" aria-selected={selectedJobType === jobType.value} className={selectedJobType === jobType.value ? 'job-type-tab active' : 'job-type-tab'} onClick={() => onChange(jobType.value)}>
                    {jobType.label}
                </button>
            ))}
            {includeUnconfirmed && (
                <button type="button" role="tab" aria-selected={selectedJobType === 'unconfirmed'} className={selectedJobType === 'unconfirmed' ? 'job-type-tab job-status-tab active' : 'job-type-tab job-status-tab'} onClick={() => onChange('unconfirmed')}>
                    Unconfirmed
                </button>
            )}
            <button type="button" role="tab" aria-selected={selectedJobType === 'all'} className={selectedJobType === 'all' ? 'job-type-tab active' : 'job-type-tab'} onClick={() => onChange('all')}>
                All jobs
            </button>
        </div>
    )
}
