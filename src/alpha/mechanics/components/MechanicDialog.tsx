import { useState, type FormEvent } from 'react'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import type { MechanicInput } from '../services/mechanicsApi'
import type { QualificationType, TechnicianQualification, TechnicianQualificationInput } from '../../wof/types/wof.types'
import QualificationManager from './QualificationManager'

type Props = {
    mechanic: Mechanic | null
    isSaving: boolean
    error: string
    onClose: () => void
    onSave: (input: MechanicInput) => Promise<void>
    qualifications: TechnicianQualification[]
    qualificationTypes: QualificationType[]
    onCreateQualification: (input: TechnicianQualificationInput) => Promise<void>
    onUpdateQualification: (id: string, input: TechnicianQualificationInput) => Promise<void>
    onDeactivateQualification: (id: string) => Promise<void>
}

export default function MechanicDialog({ mechanic, isSaving, error, onClose, onSave, qualifications, qualificationTypes, onCreateQualification, onUpdateQualification, onDeactivateQualification }: Props) {
    const [name, setName] = useState(mechanic?.gr_name ?? '')
    const [phone, setPhone] = useState(mechanic?.gr_phone ?? '')
    const [email, setEmail] = useState(mechanic?.gr_email ?? '')
    const [camNumber, setCamNumber] = useState(mechanic?.gr_camnumber ?? '')
    const [rego, setRego] = useState(mechanic?.gr_rego ?? '')
    const [region, setRegion] = useState(mechanic?.gr_region ?? '')

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        await onSave({ name, phone, email, camNumber, rego, region })
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
                    <div className="mechanic-form-section">
                        <strong>Vehicle and Region</strong>
                        <span>Optional technician vehicle and operating-area details.</span>
                    </div>
                    <div className="mechanic-vehicle-grid">
                        <label className="mechanic-field">
                            <span>CAM Number</span>
                            <input value={camNumber} placeholder="Enter vehicle fleet number..." onChange={(event) => setCamNumber(event.target.value)} />
                        </label>
                        <label className="mechanic-field">
                            <span>Vehicle Rego</span>
                            <input value={rego} placeholder="Enter vehicle registration..." onChange={(event) => setRego(event.target.value)} />
                        </label>
                        <label className="mechanic-field mechanic-region-field">
                            <span>Region</span>
                            <input value={region} placeholder="Enter region..." onChange={(event) => setRegion(event.target.value)} />
                        </label>
                    </div>
                    <QualificationManager mechanic={mechanic} qualifications={qualifications} qualificationTypes={qualificationTypes} busy={isSaving} onCreate={onCreateQualification} onUpdate={onUpdateQualification} onDeactivate={onDeactivateQualification} />
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
