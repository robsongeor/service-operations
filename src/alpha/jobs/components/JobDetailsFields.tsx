import { useState, type ReactNode } from 'react'
import type { Mechanic } from '../types/mechanic.types'
import { JOB_DESCRIPTION_MAX_LENGTH } from '../domain/jobDescription'
import SearchableMechanicSelect from './SearchableMechanicSelect'
import './JobIntakeFields.css'

type Props = {
    additionalFields?: ReactNode
    description: string
    descriptionError?: string
    onDescriptionChange: (value: string) => void
    mechanics: Mechanic[]
    mechanicId: string
    mechanicName?: string
    onMechanicChange?: (mechanicId: string, mechanicName: string) => void
    allowCustomMechanic?: boolean
    mechanicDisabledMessage?: string
    mechanicsLoading?: boolean
    mechanicsError?: string
    onRetryMechanics?: () => void
    customerPo: string
    onCustomerPoChange: (value: string) => void
    divided?: boolean
}

export default function JobDetailsFields({
    additionalFields,
    description,
    descriptionError = '',
    onDescriptionChange,
    mechanics,
    mechanicId,
    mechanicName = '',
    onMechanicChange,
    allowCustomMechanic = false,
    mechanicDisabledMessage,
    mechanicsLoading = false,
    mechanicsError = '',
    onRetryMechanics,
    customerPo,
    onCustomerPoChange,
    divided = false,
}: Props) {
    const [mechanicOpen, setMechanicOpen] = useState(false)
    return <>
        <div className={`job-book-intake-section-heading job-edit-field-wide${divided ? ' job-edit-divider' : ''}`}>
            <h3>Job details</h3>
            <p>Record what is required and who should attend.</p>
        </div>
        {additionalFields}
        <label className={`job-book-intake-field job-edit-field-wide${descriptionError ? ' error' : ''}`}>
            <span>Description of the job <span className="job-book-required-mark">*</span></span>
            <textarea required maxLength={JOB_DESCRIPTION_MAX_LENGTH} aria-label="Job description (required)" placeholder="Describe the fault or work required" rows={4} value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
            {descriptionError && <small className="job-book-intake-field-error" role="alert">{descriptionError}</small>}
        </label>
        <div className="job-edit-field job-edit-field-wide">
            <span>Mechanic</span>
            {mechanicDisabledMessage
                ? <span className="job-edit-field-note">{mechanicDisabledMessage}</span>
                : onMechanicChange
                    ? <SearchableMechanicSelect mechanics={mechanics} selectedId={mechanicId} selectedName={mechanicName} isOpen={mechanicOpen} isSaving={false} variant="drawer" onOpen={() => setMechanicOpen(true)} onClose={() => setMechanicOpen(false)} onSelect={(id) => { onMechanicChange(id, mechanics.find((item) => item.gr_mechanicid === id)?.gr_name ?? ''); setMechanicOpen(false) }} onSelectCustom={allowCustomMechanic ? (name) => { onMechanicChange('', name); setMechanicOpen(false) } : undefined} />
                    : <span>{mechanicName || 'Not assigned'}</span>}
            {!mechanicDisabledMessage && mechanicsLoading && <small>Loading Staff choices…</small>}
            {!mechanicDisabledMessage && mechanicsError && <small className="job-edit-field-error" role="alert">Staff choices are unavailable. {onRetryMechanics && <button type="button" onClick={onRetryMechanics}>Try again</button>}</small>}
        </div>
        <label className="job-book-intake-field job-edit-field-wide">
            <span>Customer PO <small>(optional)</small></span>
            <input aria-label="Customer purchase order" placeholder="Enter a PO number if supplied" value={customerPo} onChange={(event) => onCustomerPoChange(event.target.value)} />
        </label>
    </>
}
