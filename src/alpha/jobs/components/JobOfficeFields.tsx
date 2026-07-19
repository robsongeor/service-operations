import { useState } from 'react'
import { OFFICE_ACTION_OPTIONS, OFFICE_ACTIONS, type JobOfficeUpdate, type OfficeAction } from '../types/officeAction.types'

type Props = { action: OfficeAction; owner: string; attentionRequired: boolean; updates: JobOfficeUpdate[]; onActionChange: (action: OfficeAction) => void; onOwnerChange: (owner: string) => void; onAttentionRequiredChange: (required: boolean) => void; onAddUpdate: (text: string) => Promise<JobOfficeUpdate> }

const dateTimeFormatter = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

export default function JobOfficeFields({ action, owner, attentionRequired, updates, onActionChange, onOwnerChange, onAttentionRequiredChange, onAddUpdate }: Props) {
    const [newUpdate, setNewUpdate] = useState('')
    const [updateError, setUpdateError] = useState('')
    const [isAddingUpdate, setIsAddingUpdate] = useState(false)
    const addUpdate = async () => {
        const text = newUpdate.trim()
        if (!text) { setUpdateError('Enter an update before adding it.'); return }
        try { setIsAddingUpdate(true); setUpdateError(''); await onAddUpdate(text); setNewUpdate('') }
        catch (error) { setUpdateError(error instanceof Error ? error.message : 'The office update could not be added. Please try again.') }
        finally { setIsAddingUpdate(false) }
    }
    return <section className="job-office-section job-edit-field-wide">
        <div className="job-edit-divider"><h3>Office</h3><p>Track the next office task needed to keep this Job moving.</p></div>
        <div className="job-office-fields">
            <label className="job-edit-field"><span>Current Office Action</span><select value={action} onChange={(event) => onActionChange(Number(event.target.value) as OfficeAction)}>{OFFICE_ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="job-edit-field"><span>Office Action Owner</span><input value={owner} onChange={(event) => onOwnerChange(event.target.value)} placeholder="Enter person responsible..." /></label>
        </div>
        <label className="job-office-attention">
            <input type="checkbox" checked={attentionRequired} onChange={(event) => onAttentionRequiredChange(event.target.checked)} />
            <span><strong>Office Attention Required</strong><small>Turn this on when someone in the office needs to take action now.</small></span>
        </label>
        {attentionRequired && action === OFFICE_ACTIONS.NONE && <p className="job-office-hint">Consider selecting a Current Office Action so other managers know what is required.</p>}
        <div className="job-office-add"><label className="job-edit-field"><span>Add Update</span><textarea rows={3} value={newUpdate} onChange={(event) => { setNewUpdate(event.target.value); setUpdateError('') }} placeholder="Describe the current situation..." /></label>{updateError && <p className="job-edit-error" role="alert">{updateError}</p>}<button type="button" disabled={isAddingUpdate} onClick={() => void addUpdate()}>{isAddingUpdate ? 'Adding...' : 'Add Update'}</button></div>
        <div className="job-office-history"><h4>Update History</h4>{updates.length === 0 ? <p>No office updates yet.</p> : [...updates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((update) => <article key={update.id}><p>{update.text}</p><time dateTime={update.createdAt}>{dateTimeFormatter.format(new Date(update.createdAt))}{update.createdByName ? ` · ${update.createdByName}` : ''}</time></article>)}</div>
    </section>
}
