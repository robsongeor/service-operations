import type { ReactNode } from 'react'

type Props = {
    eyebrow: string
    title: string
    busy?: boolean
    children: ReactNode
    footer: ReactNode
    onClose: () => void
}

export default function JobDrawerShell({
    eyebrow,
    title,
    busy = false,
    children,
    footer,
    onClose,
}: Props) {
    return (
        <div
            className="job-edit-backdrop"
            role="presentation"
            onMouseDown={() => {
                if (!busy) onClose()
            }}
        >
            <aside
                className="job-edit-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="job-drawer-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="job-edit-header">
                    <div>
                        <p>{eyebrow}</p>
                        <h2 id="job-drawer-title">{title}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close job drawer"
                    >
                        ×
                    </button>
                </header>

                <div className="job-edit-body">{children}</div>
                <footer className="job-edit-footer">{footer}</footer>
            </aside>
        </div>
    )
}
