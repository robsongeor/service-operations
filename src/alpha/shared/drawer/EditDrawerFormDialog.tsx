import type { ReactNode } from 'react'

type Props = {
    eyebrow: string
    title: string
    children: ReactNode
    error?: string
    isBusy?: boolean
    submitLabel: string
    onCancel: () => void
    onSubmit: () => void
}

export default function EditDrawerFormDialog({ eyebrow, title, children, error, isBusy = false, submitLabel, onCancel, onSubmit }: Props) {
    return <div className="edit-confirmation-backdrop" role="presentation" onMouseDown={() => { if (!isBusy) onCancel() }}>
        <div className="edit-form-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-form-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className="edit-confirmation-eyebrow">{eyebrow}</p>
            <h3 id="edit-form-dialog-title">{title}</h3>
            <div className="edit-form-dialog-fields">{children}</div>
            {error && <p className="edit-confirmation-error" role="alert">{error}</p>}
            <div className="edit-confirmation-actions"><button type="button" onClick={onCancel} disabled={isBusy}>Cancel</button><button type="button" className="primary" onClick={onSubmit} disabled={isBusy}>{submitLabel}</button></div>
        </div>
    </div>
}
