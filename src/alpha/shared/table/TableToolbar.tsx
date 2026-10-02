import type { ReactNode } from 'react'
import './OperationsTable.css'

type Props = {
    eyebrow: string
    title: string
    searchLabel: string
    placeholder?: string
    search: string
    onSearch: (value: string) => void
    count: string
    actions?: ReactNode
}

export default function TableToolbar({ eyebrow, title, searchLabel, placeholder, search, onSearch, count, actions }: Props) {
    return <div className="operations-table-toolbar">
        <div><p className="operations-table-eyebrow">{eyebrow}</p><h2>{title}</h2></div>
        <div className="operations-table-toolbar-actions">
            <label className="operations-table-search"><span className="operations-visually-hidden">{searchLabel}</span>
                <input type="search" placeholder={placeholder} value={search} onChange={(event) => onSearch(event.target.value)} />
            </label>
            <span className="operations-table-count" role="status">{count}</span>{actions}
        </div>
    </div>
}
