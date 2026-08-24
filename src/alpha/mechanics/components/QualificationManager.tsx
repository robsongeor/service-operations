import { useState } from 'react'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import SearchableSelect from '../../shared/searchable-select/SearchableSelect'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import type { QualificationType, TechnicianQualification, TechnicianQualificationInput } from '../../wof/types/wof.types'
import { getQualificationStatus } from '../../wof/utils/wofRules'

type Props = {
    mechanic: Mechanic | null
    qualifications: TechnicianQualification[]
    qualificationTypes: QualificationType[]
    qualificationsLoading: boolean
    qualificationTypesLoading: boolean
    qualificationsError: string
    qualificationTypesError: string
    busy: boolean
    onRetryQualifications: () => void
    onRetryQualificationTypes: () => void
    onCreate: (input: TechnicianQualificationInput) => Promise<void>
    onUpdate: (id: string, input: TechnicianQualificationInput) => Promise<void>
    onDeactivate: (id: string) => Promise<void>
}

const statusLabels = { valid: 'Valid', future: 'Starts in future', expired: 'Expired', inactive: 'Inactive', 'type-inactive': 'Qualification type inactive', 'missing-type': 'Type unavailable' }

export default function QualificationManager({ mechanic, qualifications, qualificationTypes, qualificationsLoading, qualificationTypesLoading, qualificationsError, qualificationTypesError, busy, onRetryQualifications, onRetryQualificationTypes, onCreate, onUpdate, onDeactivate }: Props) {
    const [editing, setEditing] = useState<TechnicianQualification | null | undefined>(undefined)
    const [deactivating, setDeactivating] = useState<TechnicianQualification | null>(null)
    const [typeId, setTypeId] = useState('')
    const [certificate, setCertificate] = useState('')
    const [validFrom, setValidFrom] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [active, setActive] = useState(true)
    const [notes, setNotes] = useState('')
    const [error, setError] = useState('')
    const [deactivateError, setDeactivateError] = useState('')

    const openForm = (qualification: TechnicianQualification | null) => {
        setEditing(qualification); setTypeId(qualification?.gr_QualificationType?.gr_qualificationtypeid || '')
        setCertificate(qualification?.gr_certificatenumber || ''); setValidFrom(qualification?.gr_validfrom || '')
        setExpiryDate(qualification?.gr_expirydate || ''); setActive(qualification?.gr_active ?? true); setNotes(qualification?.gr_notes || ''); setError('')
    }
    const save = async () => {
        if (!mechanic) return setError('Save the technician before adding qualifications.')
        const type = qualificationTypes.find((item) => item.gr_qualificationtypeid === typeId)
        const input: TechnicianQualificationInput = { technicianId: mechanic.gr_mechanicid, technicianName: mechanic.gr_name, qualificationTypeId: typeId, qualificationTypeName: type?.gr_name || '', certificateNumber: certificate, validFrom, expiryDate, active, notes }
        try { setError(''); if (editing) await onUpdate(editing.gr_technicianqualificationid, input); else await onCreate(input); setEditing(undefined) }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'The qualification could not be saved.') }
    }

    if (!mechanic) return <section className="mechanic-qualifications"><div className="mechanic-form-section"><strong>Qualifications</strong><span>Save the technician before adding qualifications.</span></div></section>

    return <section className="mechanic-qualifications" onKeyDown={(event) => { if (editing !== undefined && event.key === 'Enter' && !event.defaultPrevented && event.target instanceof HTMLElement && event.target.tagName !== 'TEXTAREA') { event.preventDefault(); void save() } }}>
        <div className="mechanic-qualifications-heading"><div><strong>Qualifications</strong><span>Manage reusable qualifications and certification periods.</span></div><button type="button" disabled={busy || qualificationTypesLoading || Boolean(qualificationTypesError)} onClick={() => openForm(null)}>{qualificationTypesLoading ? 'Loading types…' : 'Add Qualification'}</button></div>
        {qualificationsError ? <div className="mechanic-supporting-data-error" role="alert"><span>{qualificationsError}</span><button type="button" onClick={onRetryQualifications}>Try again</button></div> : qualificationsLoading ? <p className="mechanic-qualification-empty">Loading qualifications…</p> : qualifications.length === 0 ? <p className="mechanic-qualification-empty">No qualifications have been added to this technician.</p> : <div className="mechanic-qualification-list">{qualifications.map((qualification) => {
            const status = getQualificationStatus(qualification)
            return <article key={qualification.gr_technicianqualificationid}><div><strong>{qualification.gr_QualificationType?.gr_name || 'Unknown qualification'}</strong><span className={`qualification-status ${status}`}>{statusLabels[status]}</span><small>{[qualification.gr_certificatenumber && `Certificate ${qualification.gr_certificatenumber}`, qualification.gr_validfrom && `From ${qualification.gr_validfrom}`, qualification.gr_expirydate && `Expires ${qualification.gr_expirydate}`].filter(Boolean).join(' · ') || 'No certificate or dates recorded'}</small></div><div><button type="button" onClick={() => openForm(qualification)}>Edit</button>{qualification.gr_active && <button type="button" onClick={() => setDeactivating(qualification)}>Deactivate</button>}</div></article>
        })}</div>}
        {qualificationTypesError && <div className="mechanic-supporting-data-error" role="alert"><span>{qualificationTypesError}</span><button type="button" onClick={onRetryQualificationTypes}>Retry qualification types</button></div>}
        {editing !== undefined && <EditDrawerFormDialog eyebrow="Technician qualification" title={editing ? 'Edit qualification' : 'Add qualification'} isBusy={busy} error={error} submitLabel={editing ? 'Save changes' : 'Add qualification'} onCancel={() => setEditing(undefined)} onSubmit={() => void save()}>
            <SearchableSelect id="qualification-type" label="Qualification Type" required value={typeId} onChange={setTypeId} placeholder="Select qualification type" options={qualificationTypes.filter((type) => type.gr_active || type.gr_qualificationtypeid === typeId).map((type) => ({ value: type.gr_qualificationtypeid, label: type.gr_name, secondary: type.gr_code }))} />
            <label>Certificate Number<input value={certificate} onChange={(event) => setCertificate(event.target.value)} /></label>
            <label>Valid From<input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label>
            <label>Expiry Date<input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></label>
            <label className="qualification-active"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label>
            <label>Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </EditDrawerFormDialog>}
        {deactivating && <EditDrawerConfirmation eyebrow="Qualification" title="Deactivate qualification?" message="It will no longer make the technician eligible for work requiring this qualification." confirmLabel="Deactivate" isBusy={busy} error={deactivateError} onCancel={() => { setDeactivating(null); setDeactivateError('') }} onConfirm={() => void onDeactivate(deactivating.gr_technicianqualificationid).then(() => { setDeactivating(null); setDeactivateError('') }).catch((caught) => setDeactivateError(caught instanceof Error ? caught.message : 'The qualification could not be deactivated.'))} />}
    </section>
}
