import { useState } from 'react'

export type JobContactCreateInput = {
    name: string
    phone?: string
    email?: string
}

type Props = {
    description?: string
    onCreate: (input: JobContactCreateInput) => Promise<void>
    onCancel: () => void
}

// Shared by every job-creation drawer so Contact validation and feedback stay consistent.
export default function JobContactCreatePanel({ description, onCreate, onCancel }: Props) {
    const [contact, setContact] = useState({ name: '', phone: '', email: '' })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const create = async () => {
        if (saving) return
        const name = contact.name.trim()
        if (!name) return setError('Enter a contact name.')
        setSaving(true)
        setError('')
        try {
            await onCreate({
                name,
                phone: contact.phone.trim() || undefined,
                email: contact.email.trim() || undefined,
            })
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Contact could not be created.')
        } finally {
            setSaving(false)
        }
    }

    return <div className="job-edit-create-panel job-edit-field-wide">
        <div><h4>New contact</h4><p>{description || 'Create and select a contact for the chosen site.'}</p></div>
        <label className="job-edit-field"><span>Contact name</span><input autoFocus disabled={saving} value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></label>
        <label className="job-edit-field"><span>Phone</span><input type="tel" disabled={saving} value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></label>
        <label className="job-edit-field"><span>Email</span><input type="email" disabled={saving} value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label>
        {error && <p className="job-edit-error" role="alert">{error}</p>}
        <div className="job-edit-create-actions">
            <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="button" className="primary" onClick={() => void create()} disabled={saving}>{saving ? 'Creating…' : 'Create contact'}</button>
        </div>
    </div>
}
