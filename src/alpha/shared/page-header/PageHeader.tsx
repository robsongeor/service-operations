import type { ReactNode } from 'react'
import './PageHeader.css'

type Props = {
    title: string
    eyebrow?: string
    subtitle?: string
    actions?: ReactNode
}

export default function PageHeader({ title, eyebrow, subtitle, actions }: Props) {
    return <header className="page-header">
        <div className="page-header-copy">
            {eyebrow && <span>{eyebrow}</span>}
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
    </header>
}
