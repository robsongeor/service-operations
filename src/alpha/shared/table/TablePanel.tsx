import type { ReactNode } from 'react'
import './OperationsTable.css'

/** Shared table surface; features retain their own columns, rows and business actions. */
export default function TablePanel({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <section className={`operations-table-panel ${className}`.trim()}>{children}</section>
}
