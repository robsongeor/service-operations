import type { JobsViewState } from '../types/jobsViewState.types'

type Props = {
    active: boolean
    direction: JobsViewState['sort']['direction']
}

export default function JobsTableSortIcon({ active, direction }: Props) {
    if (!active) {
        return <svg className="jobs-table-sort-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3-3 3 3M11 10l-3 3-3-3" /></svg>
    }

    return direction === 'ascending'
        ? <svg className="jobs-table-sort-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 7 3.5-3.5L11.5 7M8 3.5v9" /></svg>
        : <svg className="jobs-table-sort-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M4.5 9l3.5 3.5L11.5 9" /></svg>
}
