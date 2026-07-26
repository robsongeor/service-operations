import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import './EditDrawer.css'

type Props = {
    eyebrow: string
    title: string
    busy?: boolean
    children: ReactNode
    footer: ReactNode
    headerAction?: ReactNode
    onClose: () => void
}

export default function EditDrawerShell({ eyebrow, title, busy = false, children, footer, headerAction, onClose }: Props) {
    const drawerRef = useRef<HTMLElement>(null)
    const titleId = useId()

    useEffect(() => {
        drawerRef.current?.focus()
    }, [])

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape' && !busy) {
            event.preventDefault()
            onClose()
            return
        }
        if (event.key !== 'Tab') return
        const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [])].filter((element) => element.offsetParent !== null)
        if (!focusable.length) {
            event.preventDefault()
            drawerRef.current?.focus()
            return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
        }
    }

    return <div className="edit-drawer-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose() }}>
        <aside
            ref={drawerRef}
            className="edit-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
        >
            <header className="edit-drawer-header">
                <div><p>{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
                <div className="edit-drawer-header-actions">
                    {headerAction}
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close edit drawer">x</button>
                </div>
            </header>
            <div className="edit-drawer-body">{children}</div>
            <footer className="edit-drawer-footer">{footer}</footer>
        </aside>
    </div>
}
