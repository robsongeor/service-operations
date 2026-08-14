import type { ReactNode } from 'react'

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
    return <div className="edit-confirmation-backdrop" role="presentation" onMouseDown={() => { if (!isBusy) onCancel() }}>
        <div className={['edit-form-dialog', dialogClassName].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby="edit-form-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className="edit-confirmation-eyebrow">{eyebrow}</p>
            <h3 id="edit-form-dialog-title">{title}</h3>
            <div className={['edit-form-dialog-fields', fieldsClassName].filter(Boolean).join(' ')}>{children}</div>
            {error && <p className="edit-confirmation-error" role="alert">{error}</p>}
            <div className="edit-confirmation-actions"><button type="button" onClick={onCancel} disabled={isBusy}>Cancel</button>{!hideSubmit && <button type="button" className={destructive ? 'danger' : 'primary'} onClick={onSubmit} disabled={isBusy || submitDisabled}>{submitLabel}</button>}</div>
        </div>
    </div>
}
