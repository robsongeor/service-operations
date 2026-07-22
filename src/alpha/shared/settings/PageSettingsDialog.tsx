import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './PageSettings.css'

type Props = {
    open: boolean
    title?: string
    description?: string
    children: ReactNode
    onCancel: () => void
    onApply: () => void
    applyLabel?: string
}

export default function PageSettingsDialog({ open, title = 'Settings', description, children, onCancel, onApply, applyLabel = 'Apply' }: Props) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)
    const onCancelRef = useRef(onCancel)

    useEffect(() => {
        onCancelRef.current = onCancel
    }, [onCancel])

    useEffect(() => {
        if (!open) return
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus())
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancelRef.current()
            if (event.key !== 'Tab' || !dialogRef.current) return
            const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
            if (!focusable.length) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener('keydown', onKeyDown)
            previousFocusRef.current?.focus()
        }
    }, [open])

    if (!open) return null
    return createPortal(
        <div className="page-settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
            <div ref={dialogRef} className="page-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="page-settings-title" aria-describedby={description ? 'page-settings-description' : undefined}>
                <header>
                    <div><h2 id="page-settings-title">{title}</h2>{description && <p id="page-settings-description">{description}</p>}</div>
                    <button type="button" aria-label="Close settings" onClick={onCancel}>×</button>
                </header>
                <div className="page-settings-body">{children}</div>
                <footer><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={onApply}>{applyLabel}</button></footer>
            </div>
        </div>,
        document.body,
    )
}
