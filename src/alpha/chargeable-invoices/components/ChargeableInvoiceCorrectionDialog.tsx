import { useMemo, useState } from 'react'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog.tsx'
import {
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    CHARGEABLE_INVOICE_LINE_TYPES,
    type ChargeableInvoiceCorrectionType,
    type ChargeableInvoiceLineType,
    type ChargeableInvoiceWorkspace,
} from '../types/chargeableInvoice.types.ts'
import {
    buildChargeableInvoiceCorrectionFields,
    type ChargeableInvoiceCorrectionDraft,
} from '../domain/chargeableInvoiceCorrectionDraft.ts'

type Props = {
    workspace: ChargeableInvoiceWorkspace
    saving: boolean
    onAdd: (draft: ChargeableInvoiceCorrectionDraft) => Promise<void>
    onClose: () => void
}

const headerOptions = [
    ['Invoice date', 'invoiceDate'], ['Headline', 'headline'], ['Meter', 'meter'],
    ['Date of Job', 'dateOfJob'], ['Service interval', 'serviceInterval'], ['Next due', 'nextDue'],
    ['Subtotal', 'subtotal'], ['GST amount', 'gstAmount'], ['Total', 'total'],
] as const

const storyOptions = [['Description of repair work', 'repairDescription'], ['Work completed', 'workCompleted']] as const

function blankDraft(): ChargeableInvoiceCorrectionDraft {
    return {
        type: CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD,
        fieldKey: 'dateOfJob', requestedText: '', sourceLineId: '', requestedLineType: null,
        requestedDescription: '', requestedQuantity: '', requestedUnitPrice: '',
    }
}

export default function ChargeableInvoiceCorrectionDialog({ workspace, saving, onAdd, onClose }: Props) {
    const [draft, setDraft] = useState(blankDraft)
    const [error, setError] = useState('')
    const revision = workspace.revisions.find((item) => item.gr_chargeableinvoicerevisionid === workspace.review._gr_currentrevision_value)
        ?? workspace.revisions[0]
    const lines = useMemo(() => workspace.lines.filter((line) => line._gr_revision_value === revision?.gr_chargeableinvoicerevisionid), [revision?.gr_chargeableinvoicerevisionid, workspace.lines])
    const isHeader = draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD
    const isStory = draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY
    const isAdd = draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE
    const isChange = draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE
    const isRemove = draft.type === CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE

    const changeType = (type: ChargeableInvoiceCorrectionType) => setDraft({
        ...blankDraft(), type,
        fieldKey: type === CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY ? 'repairDescription' : 'dateOfJob',
        requestedLineType: type === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE ? CHARGEABLE_INVOICE_LINE_TYPES.OTHER : null,
    })

    const submit = async () => {
        setError('')
        if (!revision) { setError('The current invoice revision is unavailable.'); return }
        const validation = buildChargeableInvoiceCorrectionFields(draft, revision, lines)
        if (validation.error) { setError(validation.error); return }
        try { await onAdd(draft); onClose() }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'The correction could not be added.') }
    }

    return <EditDrawerFormDialog eyebrow="Review by exception" title="Add invoice correction" error={error} isBusy={saving} submitLabel="Add correction" onCancel={onClose} onSubmit={() => void submit()}>
        <label className="chargeable-field">Correction type<select value={draft.type} onChange={(event) => changeType(Number(event.currentTarget.value) as ChargeableInvoiceCorrectionType)}><option value={CHARGEABLE_INVOICE_CORRECTION_TYPES.HEADER_FIELD}>Header field</option><option value={CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY}>Story text</option><option value={CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE}>Change existing line</option><option value={CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE}>Add line</option><option value={CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE}>Remove line</option></select></label>
        {isHeader && <label className="chargeable-field">Header field<select value={draft.fieldKey} onChange={(event) => setDraft((current) => ({ ...current, fieldKey: event.currentTarget.value }))}>{headerOptions.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {isStory && <label className="chargeable-field">Story section<select value={draft.fieldKey} onChange={(event) => setDraft((current) => ({ ...current, fieldKey: event.currentTarget.value }))}>{storyOptions.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {(isHeader || isStory) && <label className="chargeable-field">Requested value<textarea rows={5} maxLength={10000} value={draft.requestedText} onChange={(event) => setDraft((current) => ({ ...current, requestedText: event.currentTarget.value }))} /></label>}
        {(isChange || isRemove) && <label className="chargeable-field">Source invoice line<select value={draft.sourceLineId} onChange={(event) => setDraft((current) => ({ ...current, sourceLineId: event.currentTarget.value }))}><option value="">Choose line</option>{lines.map((line) => <option key={line.gr_chargeableinvoicelineid} value={line.gr_chargeableinvoicelineid}>{line.gr_description} ({line.gr_extendedprice ?? 'no total'})</option>)}</select></label>}
        {(isAdd || isChange) && <>
            <label className="chargeable-field">Requested line type<select value={draft.requestedLineType ?? ''} onChange={(event) => setDraft((current) => ({ ...current, requestedLineType: event.currentTarget.value ? Number(event.currentTarget.value) as ChargeableInvoiceLineType : null }))}><option value="">{isChange ? 'Unchanged' : 'Choose type'}</option><option value={CHARGEABLE_INVOICE_LINE_TYPES.LABOUR}>Labour</option><option value={CHARGEABLE_INVOICE_LINE_TYPES.PARTS}>Parts</option><option value={CHARGEABLE_INVOICE_LINE_TYPES.OTHER}>Other / Consumables</option></select></label>
            <label className="chargeable-field">Requested description<textarea rows={3} maxLength={4000} value={draft.requestedDescription} placeholder={isChange ? 'Leave blank if unchanged' : ''} onChange={(event) => setDraft((current) => ({ ...current, requestedDescription: event.currentTarget.value }))} /></label>
            <div className="chargeable-decision-grid"><label className="chargeable-field">Requested quantity<input type="number" min="0" step="any" value={draft.requestedQuantity} placeholder={isChange ? 'Unchanged' : ''} onChange={(event) => setDraft((current) => ({ ...current, requestedQuantity: event.currentTarget.value }))} /></label><label className="chargeable-field">Requested unit price<input type="number" min="0" step="0.01" value={draft.requestedUnitPrice} placeholder={isChange ? 'Unchanged' : ''} onChange={(event) => setDraft((current) => ({ ...current, requestedUnitPrice: event.currentTarget.value }))} /></label></div>
        </>}
        <p className="chargeable-evidence-note">The source revision and line remain immutable. This records only the requested correction for comparison with a later revision.</p>
    </EditDrawerFormDialog>
}
