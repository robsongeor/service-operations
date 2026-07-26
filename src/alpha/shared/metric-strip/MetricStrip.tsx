import type { ReactNode } from 'react'
import './MetricStrip.css'

export interface MetricStripItem {
    label: string
    value: ReactNode
    tone?: 'default' | 'warning' | 'danger'
    onActivate?: () => void
    active?: boolean
}

interface MetricStripProps {
    items: MetricStripItem[]
    ariaLabel: string
}

export default function MetricStrip({ items, ariaLabel }: MetricStripProps) {
    return <dl className="metric-strip" aria-label={ariaLabel}>
        {items.map((item) => <div
            className="metric-strip-item"
            data-tone={item.tone ?? 'default'}
            data-interactive={item.onActivate ? 'true' : 'false'}
            data-active={item.active ? 'true' : 'false'}
            key={item.label}
        >
            <dt>{item.label}</dt>
            <dd>{item.onActivate ? <button
                type="button"
                aria-label={`Filter by ${item.label}: ${String(item.value)}`}
                aria-pressed={item.active}
                onClick={item.onActivate}
            >{item.value}</button> : item.value}</dd>
        </div>)}
    </dl>
}
