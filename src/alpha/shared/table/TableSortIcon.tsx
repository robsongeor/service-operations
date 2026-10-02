import './OperationsTable.css'

export type SortDirection = 'ascending' | 'descending'

export default function TableSortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
    const path = !active ? 'm5 6 3-3 3 3M11 10l-3 3-3-3'
        : direction === 'ascending' ? 'm4.5 7 3.5-3.5L11.5 7M8 3.5v9' : 'M8 3.5v9M4.5 9l3.5 3.5L11.5 9'
    return <svg className="operations-table-sort-icon jobs-table-sort-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={path} /></svg>
}
