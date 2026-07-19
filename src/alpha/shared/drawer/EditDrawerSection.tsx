import type { ReactNode } from 'react'

type Props = { title: string; meta?: ReactNode; children: ReactNode; className?: string }

export default function EditDrawerSection({ title, meta, children, className = '' }: Props) {
    return <section className={`edit-drawer-section ${className}`}><div className="edit-drawer-section-heading"><h3>{title}</h3>{meta}</div>{children}</section>
}
