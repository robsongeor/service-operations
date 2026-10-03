import { useState } from 'react'
import EditDrawerFormDialog from '../shared/drawer/EditDrawerFormDialog'
import { JOB_BOOK_VOID_REASON_MAX_LENGTH, jobBookVoidBlockedReason, jobBookVoidReasonError } from './jobBookEntryWorkflow'
import type { JobBookRow } from './jobBookPrototype'

type Props = {
    row: JobBookRow
    busy: boolean
    error: string
    needsReload: boolean
    onCancel: () => void
    onSubmit: (reason: string) => void
    onReload: () => void
}

export default function JobBookVoidDialog({ row, busy, error, needsReload, onCancel, onSubmit, onReload }: Props) {
    const [reason, setReason] = useState('')
    const blocked = jobBookVoidBlockedReason(row)
    return <EditDrawerFormDialog
        eyebrow="Job Book entry"
        title={`Mark Job ${row.jobNumber} as void?`}
        destructive
        isBusy={busy}
        error={error}
        submitLabel={busy ? 'Saving…' : 'Mark as void'}
        submitDisabled={needsReload || Boolean(blocked || jobBookVoidReasonError(reason))}
        onCancel={onCancel}
        onSubmit={() => onSubmit(reason)}
    >
        <p className="edit-form-dialog-context">The entry and its number will stay in the Job Book. It cannot be edited, managed or marked as entered in GreenTree or Timecloud after this. There is no undo here.</p>
        <p className="edit-form-dialog-context"><strong>{row.customer || 'No customer recorded'}</strong><br />{row.description || 'No description recorded'}</p>
        {blocked && <p className="edit-confirmation-error" role="alert">{blocked}</p>}
        <label><span>Reason *</span><textarea required maxLength={JOB_BOOK_VOID_REASON_MAX_LENGTH} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="For example: Duplicate of Job 123456, Customer cancelled, or Entered by mistake" /></label>
        {needsReload && <button type="button" onClick={onReload} disabled={busy}>Reload latest entry</button>}
    </EditDrawerFormDialog>
}
