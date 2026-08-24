import { useState, type FormEvent } from 'react'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import type { MechanicInput } from '../services/mechanicsApi'
import type { QualificationType, TechnicianQualification, TechnicianQualificationInput } from '../../wof/types/wof.types'
import QualificationManager from './QualificationManager'
import { canReceiveInternalEmail, STAFF_DEPARTMENTS, STAFF_DEPARTMENT_OPTIONS } from '../staffDirectory.ts'

type Props = {
    mechanic: Mechanic | null
    isSaving: boolean
    error: string
    onClose: () => void
    onSave: (input: MechanicInput) => Promise<void>
    qualifications: TechnicianQualification[]
    qualificationTypes: QualificationType[]
    qualificationsLoading: boolean
    qualificationTypesLoading: boolean
    qualificationsError: string
    qualificationTypesError: string
    onRetryQualifications: () => void
    onRetryQualificationTypes: () => void
    onCreateQualification: (input: TechnicianQualificationInput) => Promise<void>
    onUpdateQualification: (id: string, input: TechnicianQualificationInput) => Promise<void>
    onDeactivateQualification: (id: string) => Promise<void>
}

export default function MechanicDialog({ mechanic, isSaving, error, onClose, onSave, qualifications, qualificationTypes, qualificationsLoading, qualificationTypesLoading, qualificationsError, qualificationTypesError, onRetryQualifications, onRetryQualificationTypes, onCreateQualification, onUpdateQualification, onDeactivateQualification }: Props) {
    const [name, setName] = useState(mechanic?.gr_name ?? '')
    const [phone, setPhone] = useState(mechanic?.gr_phone ?? '')
    const [email, setEmail] = useState(mechanic?.gr_email ?? '')
    const [camNumber, setCamNumber] = useState(mechanic?.gr_camnumber ?? '')
    const [rego, setRego] = useState(mechanic?.gr_rego ?? '')
    const [region, setRegion] = useState(mechanic?.gr_region ?? '')
    const [department, setDepartment] = useState(mechanic?.gr_department ?? STAFF_DEPARTMENTS.SERVICE)
    const [jobAssignmentEnabled, setJobAssignmentEnabled] = useState(mechanic?.gr_jobassignmentenabled !== false)
    const [customerEmailCcEnabled, setCustomerEmailCcEnabled] = useState(mechanic?.gr_customeremailccenabled === true)
    const [validationError, setValidationError] = useState('')

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        setValidationError('')
        if (customerEmailCcEnabled && !canReceiveInternalEmail({ statecode: 0, gr_email: email })) {
            setValidationError('Enter a valid staff email before including this person on customer emails.')
            return
        }
        await onSave({ name, phone, email, camNumber, rego, region, department, jobAssignmentEnabled, customerEmailCcEnabled })
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
                        <span>Staff directory</span>
                        <h2 id="mechanic-dialog-title">{mechanic ? 'Edit staff member' : 'Add staff member'}</h2>
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
                    <label className="mechanic-field">
                        <span>Department *</span>
                        <select value={department} onChange={(event) => setDepartment(Number(event.target.value))}>
                            {STAFF_DEPARTMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className="mechanic-assignment-toggle">
                        <input type="checkbox" checked={jobAssignmentEnabled} onChange={(event) => setJobAssignmentEnabled(event.target.checked)} />
                        <span><strong>Can be assigned Jobs</strong><small>Show this staff member in technician, scheduling, and job assignment lists.</small></span>
                    </label>
                    <label className="mechanic-assignment-toggle">
                        <input type="checkbox" checked={customerEmailCcEnabled} onChange={(event) => setCustomerEmailCcEnabled(event.target.checked)} />
                        <span><strong>CC on customer emails</strong><small>Include this staff member on quotation and Chargeable Invoice customer PO emails.</small></span>
                    </label>
                    {jobAssignmentEnabled && <><div className="mechanic-form-section">
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
                    <QualificationManager mechanic={mechanic} qualifications={qualifications} qualificationTypes={qualificationTypes} qualificationsLoading={qualificationsLoading} qualificationTypesLoading={qualificationTypesLoading} qualificationsError={qualificationsError} qualificationTypesError={qualificationTypesError} busy={isSaving} onRetryQualifications={onRetryQualifications} onRetryQualificationTypes={onRetryQualificationTypes} onCreate={onCreateQualification} onUpdate={onUpdateQualification} onDeactivate={onDeactivateQualification} /></>}
                    {(validationError || error) && <p className="mechanic-form-error" role="alert">{validationError || error}</p>}
                    <footer>
                        <button type="button" className="mechanic-secondary-button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="mechanic-primary-button" disabled={isSaving}>
                            {isSaving ? 'Saving…' : mechanic ? 'Save changes' : 'Add staff member'}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    )
}
