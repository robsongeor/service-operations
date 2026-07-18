import { useState, type FormEvent } from 'react'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import type { MechanicInput } from '../services/mechanicsApi'

type Props = {
    mechanic: Mechanic | null
    isSaving: boolean
    error: string
    onClose: () => void
    onSave: (input: MechanicInput) => Promise<void>
}

export default function MechanicDialog({ mechanic, isSaving, error, onClose, onSave }: Props) {
    const [name, setName] = useState(mechanic?.gr_name ?? '')
    const [phone, setPhone] = useState(mechanic?.gr_phone ?? '')
    const [email, setEmail] = useState(mechanic?.gr_email ?? '')

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        await onSave({ name, phone, email })
    }

    return (
        <div className="mechanic-dialog-backdrop" role="presentation" onMouseDown={onClose}>
            <section
                className="mechanic-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mechanic-dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header>
                    <div>
                        <span>Mechanic directory</span>
                        <h2 id="mechanic-dialog-title">{mechanic ? 'Edit mechanic' : 'Add mechanic'}</h2>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose}>×</button>
                </header>
                <form onSubmit={(event) => void submit(event)}>
                    <label className="mechanic-field">
                        <span>Name *</span>
                        <input required autoFocus value={name} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label className="mechanic-field">
                        <span>Phone</span>
                        <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                    </label>
                    <label className="mechanic-field">
                        <span>Email</span>
                        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                    </label>
                    {error && <p className="mechanic-form-error" role="alert">{error}</p>}
                    <footer>
                        <button type="button" className="mechanic-secondary-button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="mechanic-primary-button" disabled={isSaving}>
                            {isSaving ? 'Saving…' : mechanic ? 'Save changes' : 'Add mechanic'}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    )
}
