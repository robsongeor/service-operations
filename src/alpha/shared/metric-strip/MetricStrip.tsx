import type { ReactNode } from 'react'
import './MetricStrip.css'

export interface MetricStripItem {
    label: string
    value: ReactNode
    tone?: 'default' | 'warning' | 'danger'
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
            key={item.label}
        >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
        </div>)}
    </dl>
}
