import type { ReactNode } from 'react'

type Props = { title: string; eyebrow: string; message: ReactNode; error?: string; isBusy?: boolean; confirmLabel: string; onCancel: () => void; onConfirm: () => void }

export default function EditDrawerConfirmation({ title, eyebrow, message, error, isBusy = false, confirmLabel, onCancel, onConfirm }: Props) {
    return <div className="edit-confirmation-backdrop" role="presentation" onMouseDown={() => { if (!isBusy) onCancel() }}>
        <div className="edit-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-confirmation-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="edit-confirmation-icon" aria-hidden="true">!</div><div><p className="edit-confirmation-eyebrow">{eyebrow}</p><h3 id="edit-confirmation-title">{title}</h3><div className="edit-confirmation-message">{message}</div></div>
            {error && <p className="edit-confirmation-error" role="alert">{error}</p>}
            <div className="edit-confirmation-actions"><button type="button" onClick={onCancel} disabled={isBusy}>Cancel</button><button type="button" className="danger" onClick={onConfirm} disabled={isBusy}>{confirmLabel}</button></div>
        </div>
    </div>
}
