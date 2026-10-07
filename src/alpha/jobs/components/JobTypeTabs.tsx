import { JOB_TYPE_OPTIONS, type JobTypeFilter } from '../types/jobType.types'
import './JobTypeControls.css'

type Props = {
    selectedJobType: JobTypeFilter
    onChange: (jobType: JobTypeFilter) => void
    ariaLabel?: string
    includeUnconfirmed?: boolean
    includeUnnumbered?: boolean
    includeOperational?: boolean
    jobTypeOptions?: typeof JOB_TYPE_OPTIONS
    allLabel?: string
}

export default function JobTypeTabs({
    selectedJobType,
    onChange,
    ariaLabel = 'Filter jobs by type',
    includeUnconfirmed = false,
    includeUnnumbered = false,
    includeOperational = true,
    jobTypeOptions = JOB_TYPE_OPTIONS,
    allLabel = 'All jobs',
}: Props) {
    return (
        <div className="job-type-tabs" role="tablist" aria-label={ariaLabel}>
            {includeUnnumbered && (
                <button type="button" role="tab" aria-selected={selectedJobType === 'unnumbered'} className={selectedJobType === 'unnumbered' ? 'job-type-tab job-status-tab active' : 'job-type-tab job-status-tab'} onClick={() => onChange('unnumbered')}>
                    Unnumbered
                </button>
            )}
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
                {allLabel}
            </button>
        </div>
    )
}
