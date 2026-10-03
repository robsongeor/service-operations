import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import './EditDrawer.css'

type Props = {
    eyebrow: string
    title: string
    children: ReactNode
    error?: string
    isBusy?: boolean
    destructive?: boolean
    submitDisabled?: boolean
    hideSubmit?: boolean
    submitLabel: string
    onCancel: () => void
    onSubmit: () => void
    fieldsClassName?: string
    dialogClassName?: string
}

export default function EditDrawerFormDialog({ eyebrow, title, children, error, isBusy = false, destructive = false, submitDisabled = false, hideSubmit = false, submitLabel, onCancel, onSubmit, fieldsClassName = '', dialogClassName = '' }: Props) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const titleId = useId()
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
        return () => { requestAnimationFrame(() => { if (previous?.isConnected && !previous.matches(':disabled')) previous.focus() }) }
    }, [])
    useEffect(() => {
        const dialog = dialogRef.current
        if (!isBusy && !dialog?.contains(document.activeElement)) {
            (dialog?.querySelector<HTMLElement>('textarea, input, button:not([disabled])') ?? dialog)?.focus()
        }
    }, [isBusy])
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation()
            event.preventDefault()
            if (!isBusy) onCancel()
        }
        if (event.key !== 'Tab') return
        event.stopPropagation()
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter((element) => element.offsetParent !== null)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (!first) { event.preventDefault(); dialogRef.current?.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus() }
    }
    return <div className="edit-confirmation-backdrop" role="presentation" onMouseDown={() => { if (!isBusy) onCancel() }}>
        <div ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown} className={['edit-form-dialog', dialogClassName].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
            <p className="edit-confirmation-eyebrow">{eyebrow}</p>
            <h3 id={titleId}>{title}</h3>
            <div className={['edit-form-dialog-fields', fieldsClassName].filter(Boolean).join(' ')}>{children}</div>
            {error && <p className="edit-confirmation-error" role="alert">{error}</p>}
            <div className="edit-confirmation-actions"><button type="button" onClick={onCancel} disabled={isBusy}>Cancel</button>{!hideSubmit && <button type="button" className={destructive ? 'danger' : 'primary'} onClick={onSubmit} disabled={isBusy || submitDisabled}>{submitLabel}</button>}</div>
        </div>
    </div>
}
