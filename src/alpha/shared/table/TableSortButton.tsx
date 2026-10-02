import type { ReactNode } from 'react'
import TableSortIcon, { type SortDirection } from './TableSortIcon'

export default function TableSortButton({ children, label, active, direction, onClick }: {
    children: ReactNode; label: string; active: boolean; direction: SortDirection; onClick: () => void
}) {
    return <button type="button" className="operations-table-sort" aria-label={label} title={label} onClick={onClick}>
        {children}<TableSortIcon active={active} direction={direction} />
    </button>
}
