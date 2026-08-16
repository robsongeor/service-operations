import { useMemo, useState } from 'react'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import DrawerTabs from '../../shared/drawer/DrawerTabs'
import SearchableSelect from '../../shared/searchable-select/SearchableSelect'
import EquipmentDrawer from '../../equipment/components/EquipmentDrawer'
import { isRoadRegistered } from '../../equipment/compliance/equipmentCompliance'
import type { EquipmentUpdateInput } from '../../equipment/types/equipmentManager.types'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Job } from '../../jobs/types/job.types'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types'
import type { JobScheduleOption } from '../../jobs/types/jobSchedule.types'
import type { Site } from '../../jobs/types/site.types'
import type { CreateWofInput, ServiceProvider, TechnicianQualification, UpdateWofInput, WofAssignmentMode, WofInspection, WofResult } from '../types/wof.types'
import { WOF_RESULTS } from '../types/wof.types'
import { getWofDeletionBlockReason, isQualificationValid, WOF_PROVIDER_TYPE_CODE } from '../utils/wofRules'
import { parseAlternateFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'

type Props = {
    inspection?: WofInspection; schedule?: JobScheduleOption
    equipment: Equipment[]; customers: Customer[]; sites: Site[]; jobs: Job[]
    qualifications: TechnicianQualification[]; providers: ServiceProvider[]
    onCreate: (input: CreateWofInput) => Promise<void>; onUpdate: (input: UpdateWofInput) => Promise<void>
    onDelete: (inspection: WofInspection) => Promise<void>
    onCreateCustomer: (input: { name: string }) => Promise<Customer>
    onCreateSite: (input: { customerId: string; name: string; address?: string }, customer?: Customer) => Promise<Site>
    onCreateEquipment: (input: EquipmentUpdateInput, site?: Site) => Promise<Equipment>
    onClose: () => void
}

export default function WofEditorDrawer(props: Props) {
    const { inspection, schedule, equipment, customers, sites, jobs, qualifications, providers, onCreate, onUpdate, onDelete, onCreateCustomer, onCreateSite, onCreateEquipment, onClose } = props
    const editing = Boolean(inspection)
    const completed = inspection?.gr_Job?.gr_status === JOB_STATUSES.COMPLETE
    const initialMode: WofAssignmentMode = inspection?.gr_ExternalProvider ? 'external' : 'internal'
    const initialPerformer = initialMode === 'external' ? inspection?.gr_ExternalProvider?.gr_serviceproviderid : inspection?.gr_InternalInspector?.gr_mechanicid
    const [equipmentId, setEquipmentId] = useState(inspection?.gr_Equipment?.gr_equipmentid || '')
    const [jobNumber, setJobNumber] = useState(inspection?.gr_Job?.gr_jobnumber || '')
    const [description, setDescription] = useState(inspection?.gr_Job?.gr_description || 'WOF inspection')
    const [scheduledDate, setScheduledDate] = useState(schedule?.gr_scheduledate || '')
    const [mode, setMode] = useState<WofAssignmentMode>(initialMode)
    const [performerId, setPerformerId] = useState(initialPerformer || '')
    const [registrationSnapshot, setRegistrationSnapshot] = useState(inspection?.gr_registrationnumbersnapshot || '')
    const [previousExpiry, setPreviousExpiry] = useState(inspection?.gr_previouswofexpiry || '')
    const [inspectionDate, setInspectionDate] = useState(inspection?.gr_inspectiondate || '')
    const [newExpiry, setNewExpiry] = useState(inspection?.gr_newwofexpiry || '')
    const [result, setResult] = useState<WofResult>(inspection?.gr_wofresult || WOF_RESULTS.PLANNED)
    const [certificate, setCertificate] = useState(inspection?.gr_certificatenumber || '')
    const [notes, setNotes] = useState(inspection?.gr_notes || '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [activeTab, setActiveTab] = useState<'details' | 'inspection'>('details')
    const [errorTab, setErrorTab] = useState<'details' | 'inspection' | null>(null)
    const [creatingEquipment, setCreatingEquipment] = useState(false)
    const [equipmentSaving, setEquipmentSaving] = useState(false)
    const [equipmentError, setEquipmentError] = useState('')
    const [confirmEquipmentChange, setConfirmEquipmentChange] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const selectedEquipment = equipment.find((item) => item.gr_equipmentid === equipmentId)
    const equipmentChanged = editing && equipmentId !== inspection?.gr_Equipment?.gr_equipmentid
    const currentInternal = inspection?.gr_InternalInspector
    const internalOptions = useMemo(() => qualifications.filter((item) => isQualificationValid(item, scheduledDate || undefined)).map((item) => ({ value: item.gr_Technician!.gr_mechanicid, label: item.gr_Technician!.gr_name, secondary: item.gr_certificatenumber || 'WOF certified' })).concat(currentInternal && !qualifications.some((item) => item.gr_Technician?.gr_mechanicid === currentInternal.gr_mechanicid && isQualificationValid(item, scheduledDate || undefined)) ? [{ value: currentInternal.gr_mechanicid, label: currentInternal.gr_name, secondary: 'Previously assigned — qualification not currently valid' }] : []).filter((item, index, all) => all.findIndex((candidate) => candidate.value === item.value) === index), [currentInternal, qualifications, scheduledDate])
    const eligibleProviders = providers.filter((item) => item.statecode !== 1 && item.gr_active && item.gr_ProviderType?.gr_active && item.gr_ProviderType.gr_code === WOF_PROVIDER_TYPE_CODE)
    const externalOptions = eligibleProviders.map((item) => ({ value: item.gr_serviceproviderid, label: item.gr_name, secondary: item.gr_contactname || undefined })).concat(inspection?.gr_ExternalProvider && !eligibleProviders.some((item) => item.gr_serviceproviderid === inspection.gr_ExternalProvider?.gr_serviceproviderid) ? [{ value: inspection.gr_ExternalProvider.gr_serviceproviderid, label: inspection.gr_ExternalProvider.gr_name, secondary: 'Previously assigned — provider inactive' }] : [])
    const deletionBlockReason = inspection ? getWofDeletionBlockReason(inspection) : null
    const selectableEquipment = equipment.filter((item) =>
        isRoadRegistered(item) || item.gr_equipmentid === inspection?.gr_Equipment?.gr_equipmentid,
    )

    const save = async (replaceSnapshots = false) => {
        const fail = (message: string, tab: 'details' | 'inspection') => {
            setError(message); setErrorTab(tab); setActiveTab(tab)
        }
        if (!selectedEquipment) return fail('Select equipment.', 'details')
        if (!description.trim()) return fail('Enter the work description.', 'details')
        if (!performerId) return fail(`Select an ${mode === 'internal' ? 'eligible technician' : 'eligible external provider'}.`, 'inspection')
        if (inspection && !inspection.linkedJobId) return fail('This WOF has no linked Job identifier. This is a data-integrity issue and the record cannot be updated.', 'details')
        if (inspection && result === WOF_RESULTS.PASSED && !inspectionDate) return fail('Enter the inspection date before recording a passed WOF.', 'inspection')
        if (inspection && result === WOF_RESULTS.PASSED && !newExpiry) return fail('Enter the new WOF expiry before recording a passed WOF.', 'inspection')
        if (mode === 'internal' && !internalOptions.some((item) => item.value === performerId && !item.secondary?.startsWith('Previously assigned'))) return fail('The technician is not qualified on the scheduled date.', 'inspection')
        if (mode === 'external' && !eligibleProviders.some((item) => item.gr_serviceproviderid === performerId)) return fail('The external provider is not currently eligible.', 'inspection')
        if (equipmentChanged && (registrationSnapshot || previousExpiry) && !replaceSnapshots) { setConfirmEquipmentChange(true); return }
        try {
            setBusy(true); setError(''); setErrorTab(null)
            const common: CreateWofInput = { equipment: selectedEquipment, jobNumber, description, scheduledDate, assignmentMode: mode, internalInspectorId: mode === 'internal' ? performerId : undefined, externalProviderId: mode === 'external' ? performerId : undefined }
            if (!inspection) await onCreate(common)
            else await onUpdate({ ...common, inspectionId: inspection.gr_wofinspectionid, jobId: inspection.linkedJobId!, registrationNumberSnapshot: equipmentChanged ? selectedEquipment.gr_registrationnumber || '' : registrationSnapshot, previousWofExpiry: equipmentChanged ? selectedEquipment.gr_currentwofexpiry || '' : previousExpiry, inspectionDate, newWofExpiry: newExpiry, result, certificateNumber: certificate, notes, scheduleOptionId: schedule?.gr_jobscheduleoptionid })
            onClose()
        } catch (caught) { setError(caught instanceof Error ? caught.message : `The WOF could not be ${editing ? 'updated' : 'created'}.`) }
        finally { setBusy(false) }
    }

    const deleteCurrentWof = async () => {
        if (!inspection || deletionBlockReason) return
        try {
            setDeleting(true)
            setDeleteError('')
            await onDelete(inspection)
            setConfirmDelete(false)
            onClose()
        } catch (caught) {
            setDeleteError(caught instanceof Error ? caught.message : 'The WOF could not be deleted.')
        } finally {
            setDeleting(false)
        }
    }

    return <>
        <EditDrawerShell eyebrow="Protected WOF workflow" title={editing ? 'Edit WOF' : 'Create WOF'} busy={busy || deleting} onClose={onClose} footer={<><div className="wof-drawer-footer-status"><span className="wof-drawer-error" role="alert">{error}</span>{editing && <button type="button" className="wof-delete-button" onClick={() => { setDeleteError(''); setConfirmDelete(true) }} disabled={busy || deleting || Boolean(deletionBlockReason)} title={deletionBlockReason || undefined}>Delete WOF</button>}</div><div><button type="button" onClick={onClose} disabled={busy || deleting}>Cancel</button> <button type="button" className="primary" onClick={() => void save()} disabled={busy || deleting}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create WOF'}</button></div></>}>
            <DrawerTabs ariaLabel="WOF sections" activeTab={activeTab} onChange={setActiveTab} tabs={[
                { id: 'details', label: 'Details', hasError: errorTab === 'details' },
                { id: 'inspection', label: 'Inspection Details', hasError: errorTab === 'inspection' },
            ]} />
            <div className="wof-form">
                {activeTab === 'details' && <div id="drawer-tab-panel-details" className="wof-form-tab" role="tabpanel" aria-labelledby="drawer-tab-details">
                <SearchableSelect id="wof-equipment" label="Equipment" required value={equipmentId} onChange={setEquipmentId} disabled={completed} placeholder="Select equipment" options={selectableEquipment.map((item) => ({ value: item.gr_equipmentid, label: item.gr_fleet || item.gr_serial || 'Unnamed equipment', secondary: [item.gr_registrationnumber, item.gr_make, item.gr_model].filter(Boolean).join(' · '), searchText: parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).join(' ') }))} />
                {!editing && <button type="button" className="wof-add-equipment" onClick={() => setCreatingEquipment(true)}>+ Add new equipment</button>}
                {completed && <p className="wof-protected-note">Equipment cannot be changed after the linked Job is completed.</p>}
                {selectedEquipment && <div className="wof-equipment-summary"><span>REGO <strong>{selectedEquipment.gr_registrationnumber || 'Not recorded'}</strong></span><span>Current expiry <strong>{selectedEquipment.gr_currentwofexpiry || 'Unknown'}</strong></span><span>Customer <strong>{selectedEquipment.gr_Site?.gr_Customer?.gr_name || 'Not recorded'}</strong></span><span>Site <strong>{selectedEquipment.gr_Site?.gr_name || 'Not recorded'}</strong></span></div>}
                <label>Job number<input value={jobNumber} onChange={(event) => setJobNumber(event.target.value)} /></label>
                <label>Work description *<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
                <label>Scheduled date<input type="date" value={scheduledDate} onChange={(event) => { setScheduledDate(event.target.value); if (!editing) setPerformerId('') }} /></label>
                {editing && deletionBlockReason && <p className="wof-protected-note">{deletionBlockReason}</p>}
                </div>}
                {activeTab === 'inspection' && <div id="drawer-tab-panel-inspection" className="wof-form-tab" role="tabpanel" aria-labelledby="drawer-tab-inspection">
                <fieldset><legend>Assignment type</legend><label><input type="radio" checked={mode === 'internal'} onChange={() => { setMode('internal'); setPerformerId('') }} /> Internal technician</label><label><input type="radio" checked={mode === 'external'} onChange={() => { setMode('external'); setPerformerId('') }} /> External provider</label></fieldset>
                <SearchableSelect id="wof-performer" label={mode === 'internal' ? 'Qualified technician' : 'WOF provider'} required value={performerId} onChange={setPerformerId} placeholder={`Select ${mode === 'internal' ? 'technician' : 'provider'}`} options={mode === 'internal' ? internalOptions : externalOptions} emptyLabel={mode === 'internal' ? 'No technicians are qualified for this date' : 'No active WOF providers'} />
                {editing && <><div className="wof-form-section"><strong>Inspection details</strong><span>Snapshot values are historical; current Equipment values are shown above.</span></div><label>Registration Number Snapshot<input value={registrationSnapshot} onChange={(event) => setRegistrationSnapshot(event.target.value)} /></label><label>Previous WOF Expiry<input type="date" value={previousExpiry} onChange={(event) => setPreviousExpiry(event.target.value)} /></label><label>Inspection Date<input type="date" value={inspectionDate} onChange={(event) => setInspectionDate(event.target.value)} /></label><label>New WOF Expiry<input type="date" value={newExpiry} onChange={(event) => setNewExpiry(event.target.value)} /></label><label>WOF Result<select value={result} onChange={(event) => setResult(Number(event.target.value) as WofResult)}><option value={WOF_RESULTS.PLANNED}>Planned</option><option value={WOF_RESULTS.PASSED}>Passed</option><option value={WOF_RESULTS.FAILED}>Failed</option><option value={WOF_RESULTS.CANCELLED}>Cancelled</option></select></label><label>Certificate Number<input value={certificate} onChange={(event) => setCertificate(event.target.value)} /></label><label>WOF Notes<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></>}
                {!editing && <p className="wof-protected-note">Inspection results can be recorded after the WOF and linked Job have been created.</p>}
                </div>}
            </div>
        </EditDrawerShell>
        {creatingEquipment && <EquipmentDrawer mode="create" initialValues={{ wofRequired: true }} customers={customers} sites={sites} equipmentList={equipment} jobs={jobs} isSaving={equipmentSaving} saveError={equipmentError} onClose={() => { if (!equipmentSaving) setCreatingEquipment(false) }} onCreateCustomer={onCreateCustomer} onCreateSite={onCreateSite} onCreate={async (input, resolvedSite) => { try { setEquipmentSaving(true); setEquipmentError(''); const created = await onCreateEquipment(input, resolvedSite); setEquipmentId(created.gr_equipmentid); setCreatingEquipment(false) } catch (caught) { setEquipmentError(caught instanceof Error ? caught.message : 'Equipment could not be created.'); throw caught } finally { setEquipmentSaving(false) } }} />}
        {confirmEquipmentChange && <EditDrawerConfirmation eyebrow="Equipment change" title="Replace WOF snapshot values?" message="Changing Equipment will replace the Registration Number snapshot and Previous WOF Expiry with values from the newly selected Equipment." confirmLabel="Replace and save" isBusy={busy} onCancel={() => setConfirmEquipmentChange(false)} onConfirm={() => { setConfirmEquipmentChange(false); void save(true) }} />}
        {confirmDelete && inspection && <EditDrawerConfirmation eyebrow="Delete WOF" title="Delete this orphan WOF record?" message={<><p>This will permanently delete the WOF Inspection record. No Job is linked, and no Job or Scheduler record will be deleted.</p><dl className="wof-delete-summary"><div><dt>Equipment</dt><dd>{selectedEquipment?.gr_fleet || selectedEquipment?.gr_serial || 'Unnamed equipment'}</dd></div><div><dt>REGO</dt><dd>{selectedEquipment?.gr_registrationnumber || registrationSnapshot || 'Not recorded'}</dd></div><div><dt>Customer</dt><dd>{selectedEquipment?.gr_Site?.gr_Customer?.gr_name || 'Not recorded'}</dd></div></dl></>} confirmLabel={deleting ? 'Deleting...' : 'Delete WOF'} isBusy={deleting} error={deleteError} onCancel={() => { setConfirmDelete(false); setDeleteError('') }} onConfirm={() => void deleteCurrentWof()} />}
    </>
}
