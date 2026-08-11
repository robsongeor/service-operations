import { useEffect, useMemo, useState } from 'react'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection.tsx'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell.tsx'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation.tsx'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog.tsx'
import DrawerTabs from '../../shared/drawer/DrawerTabs.tsx'
import ChargeableInvoiceCorrectionDialog from './ChargeableInvoiceCorrectionDialog.tsx'
import { getReadyToProcessBlockers } from '../domain/chargeableInvoiceState.ts'
import {
    CHARGEABLE_INVOICE_LINE_TYPES,
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_DOCUMENT_TYPES,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    CHARGEABLE_INVOICE_UPLOAD_STATUSES,
    CHARGEABLE_INVOICE_WAITING_ON,
    type ChargeableInvoiceDocument,
    type ChargeableInvoiceWaitingOn,
    type ChargeableInvoiceWorkspace as Workspace,
} from '../types/chargeableInvoice.types.ts'
import { validateChargeableInvoiceRequirements, type ChargeableInvoiceRequirementsDraft } from '../domain/chargeableInvoiceState.ts'
import type { ChargeableInvoiceCorrectionDraft } from '../domain/chargeableInvoiceCorrectionDraft.ts'
import { buildChargeableInvoiceCorrectionInstructions } from '../domain/chargeableInvoiceCorrectionInstructions.ts'

type Tab = 'summary' | 'invoice' | 'history'

type Props = {
    workspace: Workspace | null
    loading: boolean
    saving: boolean
    error: string
    onStart: () => Promise<void>
    onSaveWaiting: (waitingOn: ChargeableInvoiceWaitingOn | null, note: string) => Promise<void>
    onSaveRequirements: (draft: ChargeableInvoiceRequirementsDraft) => Promise<void>
    onSavePhotoTechnician: (technicianId: string) => Promise<void>
    onPreparePhotoRequest: () => Promise<string>
    onUploadPhotos: (files: File[]) => Promise<void>
    onMarkReady: () => Promise<void>
    onMarkDoNotProcess: (reason: string) => Promise<void>
    onAddCorrection: (draft: ChargeableInvoiceCorrectionDraft) => Promise<void>
    onLoadDocument: (document: ChargeableInvoiceDocument) => Promise<Blob>
    onDownload: (document: ChargeableInvoiceDocument) => Promise<void>
    onClose: () => void
}

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const dateTime = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

const waitingOptions = [
    ['Technician', CHARGEABLE_INVOICE_WAITING_ON.TECHNICIAN],
    ['Customer', CHARGEABLE_INVOICE_WAITING_ON.CUSTOMER],
    ['Nargiza / Accounts', CHARGEABLE_INVOICE_WAITING_ON.ACCOUNTS],
    ['Sales', CHARGEABLE_INVOICE_WAITING_ON.SALES],
    ['Management', CHARGEABLE_INVOICE_WAITING_ON.MANAGEMENT],
    ['Other', CHARGEABLE_INVOICE_WAITING_ON.OTHER],
] as const

function formatDateTime(value?: string | null) {
    if (!value) return '—'
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed)
}

function eventLabel(value: number) {
    return [
        'Invoice uploaded', 'Job matched', 'Review started', 'Correction added', 'Correction changed',
        'Waiting changed', 'Technician selected', 'Photo request prepared', 'Photos received',
        'Revised invoice uploaded', 'Revision compared', 'PO requirement changed',
        'Approval PDF generated', 'PO request prepared', 'PO received', 'Ready to process',
        'Do not process', 'Manual note',
    ][value - 122830000] ?? 'Review activity'
}

function WaitingEditor({ workspace, saving, onSave }: {
    workspace: Workspace
    saving: boolean
    onSave: (waitingOn: ChargeableInvoiceWaitingOn | null, note: string) => Promise<void>
}) {
    const [waitingOn, setWaitingOn] = useState<ChargeableInvoiceWaitingOn | null>(workspace.review.gr_waitingon ?? null)
    const [waitingNote, setWaitingNote] = useState(workspace.review.gr_waitingnote ?? '')
    return <>
        <label className="chargeable-field">Waiting on<select value={waitingOn ?? ''} disabled={saving || !workspace.review.gr_reviewstartedon || workspace.review.gr_disposition != null} onChange={(event) => setWaitingOn(event.currentTarget.value ? Number(event.currentTarget.value) as ChargeableInvoiceWaitingOn : null)}><option value="">Not waiting</option>{waitingOptions.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="chargeable-field">Waiting note<textarea rows={4} value={waitingNote} disabled={saving || !workspace.review.gr_reviewstartedon || waitingOn == null || workspace.review.gr_disposition != null} onChange={(event) => setWaitingNote(event.currentTarget.value)} /></label>
        <button type="button" className="chargeable-secondary" disabled={saving || !workspace.review.gr_reviewstartedon || waitingOn != null && !waitingNote.trim()} onClick={() => void onSave(waitingOn, waitingNote)}>Save Waiting state</button>
    </>
}

function RequirementsEditor({ workspace, saving, onSave }: {
    workspace: Workspace
    saving: boolean
    onSave: (draft: ChargeableInvoiceRequirementsDraft) => Promise<void>
}) {
    const review = workspace.review
    const [draft, setDraft] = useState<ChargeableInvoiceRequirementsDraft>({
        poRequired: review.gr_porequired ?? null,
        poNumber: review.gr_ponumber ?? '',
        poReceived: Boolean(review.gr_poreceivedon),
        photosRequired: review.gr_photosrequired ?? null,
        photosStatus: review.gr_photosstatus ?? null,
    })
    const validation = validateChargeableInvoiceRequirements(draft)
    const disabled = saving || !review.gr_reviewstartedon || review.gr_disposition != null
    const triState = (value: string) => value === '' ? null : value === 'yes'
    return <>
        <div className="chargeable-decision-grid">
            <label className="chargeable-field">PO required<select value={draft.poRequired == null ? '' : draft.poRequired ? 'yes' : 'no'} disabled={disabled} onChange={(event) => setDraft((current) => ({ ...current, poRequired: triState(event.currentTarget.value), poReceived: event.currentTarget.value === 'yes' && current.poReceived }))}><option value="">Undecided</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            <label className="chargeable-field">Confirmed PO number<input value={draft.poNumber} maxLength={100} disabled={disabled || draft.poRequired !== true} onChange={(event) => setDraft((current) => ({ ...current, poNumber: event.currentTarget.value }))} /></label>
            <label className="chargeable-check"><input type="checkbox" checked={draft.poReceived} disabled={disabled || draft.poRequired !== true || !draft.poNumber.trim()} onChange={(event) => setDraft((current) => ({ ...current, poReceived: event.currentTarget.checked }))} />PO received from customer</label>
            <label className="chargeable-field">Supporting photos required<select value={draft.photosRequired == null ? '' : draft.photosRequired ? 'yes' : 'no'} disabled={disabled} onChange={(event) => setDraft((current) => ({ ...current, photosRequired: triState(event.currentTarget.value), photosStatus: event.currentTarget.value === 'yes' ? current.photosStatus ?? CHARGEABLE_INVOICE_PHOTO_STATUSES.NOT_REQUESTED : null }))}><option value="">Undecided</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            <label className="chargeable-field">Photo status<select value={draft.photosStatus ?? ''} disabled={disabled || draft.photosRequired !== true} onChange={(event) => setDraft((current) => ({ ...current, photosStatus: event.currentTarget.value ? Number(event.currentTarget.value) as typeof current.photosStatus : null }))}><option value="">Choose status</option><option value={CHARGEABLE_INVOICE_PHOTO_STATUSES.NOT_REQUESTED}>Not requested</option><option value={CHARGEABLE_INVOICE_PHOTO_STATUSES.REQUESTED}>Requested</option><option value={CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED}>Received</option></select></label>
        </div>
        <p className="chargeable-evidence-note">GreenTree Order No is source evidence only. Enter a confirmed customer PO deliberately.</p>
        {validation && <p className="chargeable-inline-error" role="alert">{validation}</p>}
        <button type="button" className="chargeable-secondary" disabled={disabled || Boolean(validation)} onClick={() => void onSave(draft)}>Save PO and photo decisions</button>
    </>
}

function PhotoWorkflow({ workspace, saving, onSaveTechnician, onPrepare, onUpload }: {
    workspace: Workspace
    saving: boolean
    onSaveTechnician: (technicianId: string) => Promise<void>
    onPrepare: () => Promise<string>
    onUpload: (files: File[]) => Promise<void>
}) {
    const review = workspace.review
    const [technicianId, setTechnicianId] = useState(review._gr_photorequesttechnician_value ?? '')
    const [files, setFiles] = useState<File[]>([])
    const [inputKey, setInputKey] = useState(0)
    const selected = workspace.technicians.find((technician) => technician.gr_mechanicid === technicianId)
    const saved = review._gr_photorequesttechnician_value === technicianId && Boolean(selected)
    const received = workspace.documents.filter((document) =>
        document.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO
        && document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE).length
    const disabled = saving || review.gr_photosrequired !== true || review.gr_disposition != null
    const prepare = async () => {
        try { window.location.href = await onPrepare() } catch { /* workspace error contains the safe detail */ }
    }
    const upload = async () => {
        try {
            await onUpload(files)
            setFiles([])
            setInputKey((current) => current + 1)
        } catch { /* workspace error contains the safe detail */ }
    }
    if (review.gr_photosrequired !== true) return <p>Record that supporting photos are required to enable this workflow.</p>
    return <>
        <div className="chargeable-decision-grid">
            <label className="chargeable-field">Photo-request technician<select value={technicianId} disabled={disabled} onChange={(event) => setTechnicianId(event.currentTarget.value)}><option value="">Choose technician</option>{workspace.technicians.map((technician) => <option key={technician.gr_mechanicid} value={technician.gr_mechanicid}>{technician.gr_name}{technician.gr_email ? '' : ' — no email'}</option>)}</select></label>
            <div className="chargeable-field"><span>Saved selection</span><strong>{saved ? selected?.gr_name : 'Not saved'}</strong></div>
            <div className="chargeable-field"><span>Request prepared</span><strong>{formatDateTime(review.gr_photorequestpreparedon)}</strong></div>
            <div className="chargeable-field"><span>Photos retained</span><strong>{received}</strong></div>
        </div>
        <div className="chargeable-action-row">
            <button type="button" className="chargeable-secondary" disabled={disabled || !selected || saved} onClick={() => void onSaveTechnician(technicianId)}>Save technician</button>
            <button type="button" className="chargeable-secondary" disabled={disabled || !saved || !selected?.gr_email} onClick={() => void prepare()}>Prepare photo-request email</button>
        </div>
        <p className="chargeable-evidence-note">Preparing opens an editable email draft in your email application. It does not send or prove delivery.</p>
        <label className="chargeable-field">Supporting photos<input key={inputKey} type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" disabled={disabled || !saved} onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} /></label>
        {files.length > 0 && <p>{files.length} photo{files.length === 1 ? '' : 's'} selected. Each file must be 5 MiB or smaller; a review may retain up to 20.</p>}
        <button type="button" className="chargeable-secondary" disabled={disabled || !saved || files.length === 0} onClick={() => void upload()}>{saving ? 'Uploading…' : 'Upload selected photos'}</button>
    </>
}

export default function ChargeableInvoiceWorkspace({
    workspace, loading, saving, error, onStart, onSaveWaiting, onSaveRequirements,
    onSavePhotoTechnician, onPreparePhotoRequest, onUploadPhotos,
    onMarkReady, onMarkDoNotProcess, onAddCorrection, onLoadDocument, onDownload, onClose,
}: Props) {
    const [tab, setTab] = useState<Tab>('summary')
    const [showReadyConfirmation, setShowReadyConfirmation] = useState(false)
    const [showDoNotProcess, setShowDoNotProcess] = useState(false)
    const [dispositionReason, setDispositionReason] = useState('')
    const [dispositionError, setDispositionError] = useState('')
    const [previewUrl, setPreviewUrl] = useState('')
    const [previewBusy, setPreviewBusy] = useState(false)
    const [showCorrectionDialog, setShowCorrectionDialog] = useState(false)
    const [instructionFeedback, setInstructionFeedback] = useState('')
    const review = workspace?.review

    const currentRevision = useMemo(() => workspace?.revisions.find((revision) =>
        revision.gr_chargeableinvoicerevisionid === review?._gr_currentrevision_value)
        ?? workspace?.revisions[0], [review?._gr_currentrevision_value, workspace?.revisions])
    const currentLines = useMemo(() => workspace?.lines.filter((line) =>
        line._gr_revision_value === currentRevision?.gr_chargeableinvoicerevisionid) ?? [],
    [currentRevision?.gr_chargeableinvoicerevisionid, workspace?.lines])
    const revisionNumbers = useMemo(() => new Map(workspace?.revisions.map((revision) =>
        [revision.gr_chargeableinvoicerevisionid, revision.gr_revisionnumber]) ?? []), [workspace?.revisions])
    const sourceDocument = useMemo(() => workspace?.documents.find((document) =>
        document.gr_chargeableinvoicedocumentid === currentRevision?._gr_sourcedocument_value
        && document.gr_contenttype === 'application/pdf'),
    [currentRevision?._gr_sourcedocument_value, workspace?.documents])
    const correctionInstructions = useMemo(() => {
        if (!workspace) return null
        try { return buildChargeableInvoiceCorrectionInstructions(workspace) } catch { return null }
    }, [workspace])
    const blockers = review ? [
        ...getReadyToProcessBlockers(review),
        ...(workspace?.corrections.some((correction) =>
            correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING
            || correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE)
            ? ['Resolve all outstanding invoice corrections.'] : []),
    ] : []

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    const loadPdfPreview = async () => {
        if (!sourceDocument) return
        setPreviewBusy(true)
        try {
            const blob = await onLoadDocument(sourceDocument)
            setPreviewUrl(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })))
        } catch { /* the review hook exposes the safe load error */
        } finally {
            setPreviewBusy(false)
        }
    }

    const copyCorrectionInstructions = async () => {
        if (!correctionInstructions) return
        try {
            await navigator.clipboard.writeText(correctionInstructions.text)
            setInstructionFeedback(`${correctionInstructions.count} correction instruction${correctionInstructions.count === 1 ? '' : 's'} copied.`)
        } catch {
            setInstructionFeedback('The correction instructions could not be copied. Use Download instead.')
        }
    }

    const downloadCorrectionInstructions = () => {
        if (!correctionInstructions) return
        const url = URL.createObjectURL(new Blob([correctionInstructions.text], { type: 'text/plain;charset=utf-8' }))
        const link = window.document.createElement('a')
        link.href = url
        link.download = correctionInstructions.fileName
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
        setInstructionFeedback(`${correctionInstructions.count} correction instruction${correctionInstructions.count === 1 ? '' : 's'} downloaded. No communication was sent.`)
    }

    return <EditDrawerShell
        eyebrow="Chargeable invoice"
        title={review?.gr_invoicenumber || 'Loading review…'}
        busy={saving}
        onClose={onClose}
        footer={<>
            {review && !review.gr_reviewstartedon && <button type="button" className="primary" disabled={saving} onClick={() => void onStart()}>{saving ? 'Starting…' : 'Start review'}</button>}
            {review?.gr_reviewstartedon && review.gr_disposition == null && <button type="button" className="primary" disabled={saving || blockers.length > 0} onClick={() => { setDispositionError(''); setShowReadyConfirmation(true) }}>Ready to Process</button>}
            {review?.gr_reviewstartedon && review.gr_disposition == null && <button type="button" className="danger" disabled={saving || review.gr_waitingon != null} onClick={() => { setDispositionReason(''); setDispositionError(''); setShowDoNotProcess(true) }}>Do Not Process</button>}
            <button type="button" disabled={saving} onClick={onClose}>Close</button>
        </>}
    >
        <DrawerTabs
            tabs={[{ id: 'summary', label: 'Summary' }, { id: 'invoice', label: 'Invoice' }, { id: 'history', label: 'History' }]}
            activeTab={tab}
            onChange={setTab}
            ariaLabel="Chargeable Invoice Review details"
        />
        {error && <div className="chargeable-banner error" role="alert">{error}</div>}
        {loading && <p>Loading invoice review…</p>}

        <div role="tabpanel" id="drawer-tab-panel-summary" aria-labelledby="drawer-tab-summary" hidden={tab !== 'summary'}>
            {review && <>
                <EditDrawerSection title="Review context">
                    <dl className="chargeable-detail-grid">
                        <div><dt>Job</dt><dd>{review.gr_Job?.gr_jobnumber || review.gr_greentreereference}</dd></div>
                        <div><dt>Customer</dt><dd>{review.gr_Customer?.gr_name || '—'}</dd></div>
                        <div><dt>Site</dt><dd>{review.gr_Site?.gr_name || '—'}</dd></div>
                        <div><dt>Equipment</dt><dd>{review.gr_Equipment?.gr_fleet || review.gr_Equipment?.gr_serial || '—'}</dd></div>
                        <div><dt>Invoice date</dt><dd>{review.gr_invoicedate}</dd></div>
                        <div><dt>Review started</dt><dd>{formatDateTime(review.gr_reviewstartedon)}</dd></div>
                    </dl>
                </EditDrawerSection>
                <EditDrawerSection title="Waiting">
                    <WaitingEditor key={`${review.gr_chargeableinvoicereviewid}-${review['@odata.etag']}`} workspace={workspace} saving={saving} onSave={onSaveWaiting} />
                </EditDrawerSection>
                <EditDrawerSection title="Ready-to-process checks">
                    {blockers.length ? <ul className="chargeable-blockers">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="chargeable-ready-message">All recorded prerequisites are satisfied. The terminal Ready action will be added in its confirmation slice.</p>}
                </EditDrawerSection>
                <EditDrawerSection title="PO and supporting photos">
                    <RequirementsEditor key={`${review.gr_chargeableinvoicereviewid}-requirements-${review['@odata.etag']}`} workspace={workspace} saving={saving} onSave={onSaveRequirements} />
                </EditDrawerSection>
                <EditDrawerSection title="Photo request and uploads">
                    <PhotoWorkflow key={`${review.gr_chargeableinvoicereviewid}-photos-${review['@odata.etag']}`} workspace={workspace} saving={saving} onSaveTechnician={onSavePhotoTechnician} onPrepare={onPreparePhotoRequest} onUpload={onUploadPhotos} />
                </EditDrawerSection>
            </>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-invoice" aria-labelledby="drawer-tab-invoice" hidden={tab !== 'invoice'}>
            {currentRevision && <>
                <EditDrawerSection title="Source PDF">
                    {!sourceDocument ? <p>The current revision has no available source PDF.</p> : previewUrl
                        ? <iframe className="chargeable-pdf-viewer" src={previewUrl} title={`Source invoice ${currentRevision.gr_invoicenumber}`} />
                        : <div className="chargeable-pdf-placeholder"><p>The PDF loads only when requested and remains protected by your delegated Dataverse access.</p><button type="button" className="chargeable-secondary" disabled={previewBusy} onClick={() => void loadPdfPreview()}>{previewBusy ? 'Loading PDF…' : 'View source PDF'}</button></div>}
                </EditDrawerSection>
                <EditDrawerSection title={`Revision ${currentRevision.gr_revisionnumber}`}>
                    <dl className="chargeable-detail-grid">
                        <div><dt>Headline</dt><dd>{currentRevision.gr_headline || '—'}</dd></div>
                        <div><dt>Order No evidence</dt><dd>{currentRevision.gr_rawordernumber || '—'}</dd></div>
                        <div><dt>Date of Job</dt><dd>{currentRevision.gr_dateofjob || '—'}</dd></div>
                        <div><dt>Total</dt><dd>{currentRevision.gr_total == null ? '—' : money.format(currentRevision.gr_total)}</dd></div>
                    </dl>
                    {currentRevision.gr_repairdescription && <><h4>Description of repair work</h4><p>{currentRevision.gr_repairdescription}</p></>}
                    {currentRevision.gr_workcompleted && <><h4>Work completed</h4><p>{currentRevision.gr_workcompleted}</p></>}
                </EditDrawerSection>
                <EditDrawerSection title="Invoice lines">
                    <div className="chargeable-workspace-table-wrap"><table className="chargeable-workspace-table"><thead><tr><th>Type</th><th>Description</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>{currentLines.map((line) => <tr key={line.gr_chargeableinvoicelineid}><td>{line.gr_linetype === CHARGEABLE_INVOICE_LINE_TYPES.LABOUR ? 'Labour' : line.gr_linetype === CHARGEABLE_INVOICE_LINE_TYPES.PARTS ? 'Parts' : 'Other'}</td><td>{line.gr_description}</td><td>{line.gr_quantity ?? '—'}</td><td>{line.gr_unitprice == null ? '—' : money.format(line.gr_unitprice)}</td><td>{line.gr_extendedprice == null ? '—' : money.format(line.gr_extendedprice)}</td></tr>)}</tbody></table></div>
                </EditDrawerSection>
                <EditDrawerSection title="Corrections">
                    {workspace?.corrections.length ? <ul className="chargeable-correction-list">{workspace.corrections.map((correction) => <li key={correction.gr_chargeableinvoicecorrectionid}><strong>{correction.gr_requesteddescription || correction.gr_requestedtext || correction.gr_fieldkey || 'Line correction'}</strong><span>{correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING ? 'Outstanding' : correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION ? `Matched in revision ${revisionNumbers.get(correction._gr_matchedrevision_value || '') ?? ''}`.trim() : correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE ? 'Not made in latest revision' : 'Superseded'}</span></li>)}</ul> : <p>No corrections have been recorded.</p>}
                    <div className="chargeable-action-row"><button type="button" className="chargeable-secondary" disabled={!correctionInstructions} onClick={() => void copyCorrectionInstructions()}>Copy correction instructions</button><button type="button" className="chargeable-secondary" disabled={!correctionInstructions} onClick={downloadCorrectionInstructions}>Download correction instructions</button></div>
                    <p className="chargeable-evidence-note">Instructions include unresolved corrections only and are prepared for manual handoff. Nothing is sent automatically.</p>
                    {instructionFeedback && <p role="status" aria-live="polite">{instructionFeedback}</p>}
                    {review?.gr_reviewstartedon && review.gr_disposition == null && <button type="button" className="chargeable-secondary" disabled={saving} onClick={() => setShowCorrectionDialog(true)}>Add correction</button>}
                </EditDrawerSection>
                <EditDrawerSection title="Documents">
                    <ul className="chargeable-document-list">{workspace?.documents.map((document) => <li key={document.gr_chargeableinvoicedocumentid}><span><strong>{document.gr_filename || document.gr_name}</strong><small>{(document.gr_bytecount / 1024).toFixed(0)} KiB · {document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE ? 'Complete' : document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.FAILED ? 'Failed' : 'Pending'}</small></span><button type="button" className="chargeable-secondary" disabled={document.gr_uploadstatus !== CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE} onClick={() => void onDownload(document)}>Download</button></li>)}</ul>
                </EditDrawerSection>
            </>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-history" aria-labelledby="drawer-tab-history" hidden={tab !== 'history'}>
            <EditDrawerSection title="Activity">
                {workspace?.activities.length ? <ol className="chargeable-activity-list">{workspace.activities.map((activity) => <li key={activity.gr_chargeableinvoiceactivityid}><strong>{eventLabel(activity.gr_event)}</strong><span>{formatDateTime(activity.gr_occurredon)} · {activity['_createdby_value@OData.Community.Display.V1.FormattedValue'] || 'Manager'}</span>{activity.gr_detail && <p>{activity.gr_detail}</p>}</li>)}</ol> : <p>No activity is available.</p>}
            </EditDrawerSection>
        </div>
        {showReadyConfirmation && <EditDrawerConfirmation eyebrow="Terminal review decision" title="Mark Ready to Process?" message="This moves the invoice to the Ready queue. It does not change the Job or send a communication." error={dispositionError} isBusy={saving} confirmLabel="Mark Ready" onCancel={() => setShowReadyConfirmation(false)} onConfirm={() => { void onMarkReady().then(() => setShowReadyConfirmation(false)).catch((cause) => setDispositionError(cause instanceof Error ? cause.message : 'The review could not be updated.')) }} />}
        {showDoNotProcess && <EditDrawerFormDialog eyebrow="Terminal review decision" title="Do Not Process" error={dispositionError} isBusy={saving} submitLabel="Confirm Do Not Process" onCancel={() => setShowDoNotProcess(false)} onSubmit={() => { if (!dispositionReason.trim()) { setDispositionError('Enter the reason this invoice must not be processed.'); return } void onMarkDoNotProcess(dispositionReason).then(() => setShowDoNotProcess(false)).catch((cause) => setDispositionError(cause instanceof Error ? cause.message : 'The review could not be updated.')) }}><label className="chargeable-field">Reason<textarea rows={5} value={dispositionReason} maxLength={4000} onChange={(event) => setDispositionReason(event.currentTarget.value)} /></label></EditDrawerFormDialog>}
        {showCorrectionDialog && workspace && <ChargeableInvoiceCorrectionDialog workspace={workspace} saving={saving} onAdd={onAddCorrection} onClose={() => setShowCorrectionDialog(false)} />}
    </EditDrawerShell>
}
