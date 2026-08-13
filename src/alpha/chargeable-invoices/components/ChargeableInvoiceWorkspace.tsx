import { Fragment, useEffect, useMemo, useState } from 'react'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection.tsx'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell.tsx'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation.tsx'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog.tsx'
import DrawerTabs from '../../shared/drawer/DrawerTabs.tsx'
import SearchableSelect from '../../shared/searchable-select/SearchableSelect.tsx'
import { getReadyToProcessBlockers } from '../domain/chargeableInvoiceState.ts'
import {
    CHARGEABLE_INVOICE_LINE_TYPES,
    CHARGEABLE_INVOICE_CORRECTION_TYPES,
    CHARGEABLE_INVOICE_CORRECTION_COMPARISONS,
    CHARGEABLE_INVOICE_DOCUMENT_TYPES,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    CHARGEABLE_INVOICE_UPLOAD_STATUSES,
    CHARGEABLE_INVOICE_APPROVAL_TEMPLATE_VERSION,
    CHARGEABLE_INVOICE_WAITING_ON,
    type ChargeableInvoiceDocument,
    type ChargeableInvoiceCorrection,
    type ChargeableInvoiceLine,
    type ChargeableInvoicePoRecipientDraft,
    type ChargeableInvoiceWaitingOn,
    type ChargeableInvoiceWorkspace as Workspace,
} from '../types/chargeableInvoice.types.ts'
import { validateChargeableInvoiceRequirements, type ChargeableInvoiceRequirementsDraft } from '../domain/chargeableInvoiceState.ts'
import type { ChargeableInvoiceCorrectionDraft } from '../domain/chargeableInvoiceCorrectionDraft.ts'
import { buildChargeableInvoiceCorrectionInstructions } from '../domain/chargeableInvoiceCorrectionInstructions.ts'
import { buildChargeableInvoiceAmendedTotals } from '../domain/chargeableInvoicePricing.ts'
import { brandGreenTreeInvoicePdf } from '../domain/brandGreenTreeInvoicePdf.ts'
import { isValidRecipientEmail } from '../../jobs/utils/technicianMailto.ts'
import { resolvePurchaseOrderRecipients } from '../../customers/purchaseOrderRecipientRules.ts'
import { QUOTE_STATUS_LABELS, QUOTE_STATUSES, type Quote, type QuoteLine } from '../../quotes/types/quote.types.ts'
import { PRICING_CATEGORY_LABELS } from '../../quotes/types/pricing.types.ts'

type Tab = 'amendments' | 'requests' | 'waiting' | 'history'
type CorrectionEditorState =
    | { kind: 'work', correctionId?: string }
    | { kind: 'line', lineId: string, correctionId?: string }
    | { kind: 'add-line', correctionId?: string }

type Props = {
    workspace: Workspace | null
    loading: boolean
    saving: boolean
    error: string
    onStart: () => Promise<void>
    onSaveWaiting: (waitingOn: ChargeableInvoiceWaitingOn | null, note: string) => Promise<void>
    onSaveRequirements: (draft: ChargeableInvoiceRequirementsDraft) => Promise<void>
    onPreparePhotoRequest: (technicianId: string) => Promise<string>
    onPreparePoRequest: (draft: ChargeableInvoicePoRecipientDraft) => Promise<string>
    onUploadPhotos: (files: File[], technicianId: string) => Promise<void>
    onDeletePhotos: (documentIds: string[]) => Promise<void>
    onMarkReady: () => Promise<void>
    onMarkDoNotProcess: (reason: string) => Promise<void>
    onDelete: () => Promise<void>
    onAddCorrection: (draft: ChargeableInvoiceCorrectionDraft) => Promise<void>
    onReplaceCorrection: (correctionId: string, draft: ChargeableInvoiceCorrectionDraft) => Promise<void>
    onSupersedeCorrection: (correctionId: string) => Promise<void>
    onLoadDocument: (document: ChargeableInvoiceDocument) => Promise<Blob>
    onDownload: (document: ChargeableInvoiceDocument) => Promise<void>
    onLoadQuoteLines: (quoteId: string) => Promise<QuoteLine[]>
    onGenerateApprovalPdf: () => Promise<ChargeableInvoiceDocument>
    onClose: () => void
}

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const dateTime = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })
const CORRECTION_EXIT_ANIMATION_MS = 160

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

function correctionStatus(correction: ChargeableInvoiceCorrection, revisionNumbers: Map<string, number>) {
    return correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING ? 'Outstanding'
        : correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.MATCHED_IN_REVISION
            ? `Matched in revision ${revisionNumbers.get(correction._gr_matchedrevision_value || '') ?? ''}`.trim()
            : correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE
                ? 'Not made in latest revision' : 'Superseded'
}

function visibleCorrectionStatus(correction: ChargeableInvoiceCorrection, revisionNumbers: Map<string, number>) {
    return correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING
        ? '' : correctionStatus(correction, revisionNumbers)
}

function isActiveCorrection(correction: ChargeableInvoiceCorrection) {
    return correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.OUTSTANDING
        || correction.gr_comparisonstatus === CHARGEABLE_INVOICE_CORRECTION_COMPARISONS.NOT_MADE
}

function lineTypeLabel(value?: number | null) {
    return value === CHARGEABLE_INVOICE_LINE_TYPES.LABOUR ? 'Labour'
        : value === CHARGEABLE_INVOICE_LINE_TYPES.PARTS ? 'Parts' : 'Other'
}

function PencilIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Zm11.8-16 4.2 4.2 1-1a1.4 1.4 0 0 0 0-2L18.8 3a1.4 1.4 0 0 0-2 0l-1 1Z" /></svg>
}

function TrashIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" /></svg>
}

function RestoreIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5H8.4l2.3-2.3-1.4-1.4L4.6 6l4.7 4.7 1.4-1.4L8.4 7H12a5 5 0 1 1-4.8 6.4l-1.9.6A7 7 0 1 0 12 5Z" /></svg>
}

function CloseIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" /></svg>
}

function SaveIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 3h13l3 3v15H4V3Zm2 2v14h12V7.2L15.8 5H15v5H8V5H6Zm4 0v3h3V5h-3Zm-1 8h6v4H9v-4Z" /></svg>
}

function EmailIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18v14H3V5Zm2 2v.4l7 4.7 7-4.7V7H5Zm14 10V9.8l-7 4.7-7-4.7V17h14Z" /></svg>
}

const relatedQuoteStatusRank: Record<number, number> = {
    [QUOTE_STATUSES.ACCEPTED]: 0,
    [QUOTE_STATUSES.SENT]: 1,
    [QUOTE_STATUSES.DRAFT]: 2,
    [QUOTE_STATUSES.DECLINED]: 3,
    [QUOTE_STATUSES.EXPIRED]: 4,
}

function quotePriceComparison(quoteTotal: number, invoiceTotal?: number | null) {
    if (invoiceTotal == null) return 'Invoice comparison unavailable'
    const difference = quoteTotal - invoiceTotal
    if (Math.abs(difference) < 0.005) return 'Matches current invoice total'
    return `${money.format(Math.abs(difference))} ${difference > 0 ? 'above' : 'below'} current invoice`
}

function RelatedQuotes({ quotes, error, jobNumber, invoiceTotal, onLoadLines }: {
    quotes: Quote[]
    error?: string
    jobNumber?: string | null
    invoiceTotal?: number | null
    onLoadLines: (quoteId: string) => Promise<QuoteLine[]>
}) {
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [linesByQuote, setLinesByQuote] = useState<Record<string, QuoteLine[]>>({})
    const [loadingId, setLoadingId] = useState<string | null>(null)
    const [lineError, setLineError] = useState('')
    const orderedQuotes = useMemo(() => [...quotes].sort((left, right) => {
        const statusDifference = (relatedQuoteStatusRank[left.gr_quotestatus] ?? 99) - (relatedQuoteStatusRank[right.gr_quotestatus] ?? 99)
        return statusDifference || right.createdon.localeCompare(left.createdon)
    }), [quotes])
    const toggle = async (quote: Quote) => {
        if (expandedId === quote.gr_quoteid) {
            setExpandedId(null)
            return
        }
        setExpandedId(quote.gr_quoteid)
        setLineError('')
        if (linesByQuote[quote.gr_quoteid]) return
        setLoadingId(quote.gr_quoteid)
        try {
            const lines = await onLoadLines(quote.gr_quoteid)
            setLinesByQuote((current) => ({ ...current, [quote.gr_quoteid]: lines }))
        } catch (cause) {
            setLineError(cause instanceof Error ? cause.message : 'The quote lines could not be loaded.')
        } finally {
            setLoadingId(null)
        }
    }
    if (error) return <div className="chargeable-banner error" role="status">{error}</div>
    if (!orderedQuotes.length) {
        return <div className="chargeable-related-quotes-empty"><strong>No quotes linked to Job {jobNumber || '—'}</strong><p>There is no quote context to compare with this invoice.</p></div>
    }
    return <div className="chargeable-related-quotes">
        <p className="chargeable-section-intro">Accepted and sent quotes are shown first. Quotes are supporting context only and do not control invoice readiness.</p>
        {orderedQuotes.map((quote) => {
            const expanded = expandedId === quote.gr_quoteid
            const subdued = quote.gr_quotestatus === QUOTE_STATUSES.DECLINED || quote.gr_quotestatus === QUOTE_STATUSES.EXPIRED
            const lines = linesByQuote[quote.gr_quoteid]
            return <article key={quote.gr_quoteid} className={`chargeable-related-quote${subdued ? ' subdued' : ''}`}>
                <div className="chargeable-related-quote-summary">
                    <button type="button" className="chargeable-related-quote-toggle" aria-expanded={expanded} onClick={() => void toggle(quote)}>
                        <span><strong>{quote.gr_quotenumber || 'Pending number'}</strong><small>{quote.gr_name || 'Untitled quote'}</small></span>
                        <span className={`chargeable-related-quote-status status-${quote.gr_quotestatus}`}>{QUOTE_STATUS_LABELS[quote.gr_quotestatus] ?? 'Unknown'}</span>
                        <span><strong>Rev {quote.gr_revision}</strong><small>{quote.gr_quotedate ? new Date(`${quote.gr_quotedate.slice(0, 10)}T00:00:00`).toLocaleDateString('en-NZ') : 'No date'}</small></span>
                        <span><strong>{money.format(quote.gr_total)}</strong><small>{quotePriceComparison(quote.gr_total, invoiceTotal)}</small></span>
                        <span className="chargeable-related-quote-chevron" aria-hidden="true">⌄</span>
                    </button>
                    <a className="chargeable-secondary chargeable-related-quote-open" href={`/quotes?quoteId=${encodeURIComponent(quote.gr_quoteid)}`} target="_blank" rel="noopener noreferrer">Open quote</a>
                </div>
                {expanded && <div className="chargeable-related-quote-detail">
                    <dl><div><dt>Author</dt><dd>{quote.createdby?.fullname || 'Not recorded'}</dd></div><div><dt>Valid until</dt><dd>{quote.gr_validuntil || 'Not set'}</dd></div></dl>
                    {quote.gr_notes && <div><strong>Notes</strong><p>{quote.gr_notes}</p></div>}
                    {loadingId === quote.gr_quoteid ? <p>Loading quote lines…</p> : lineError && !lines ? <p className="chargeable-inline-error" role="alert">{lineError}</p> : lines && lines.length > 0 ? <div className="chargeable-related-quote-lines"><table><thead><tr><th>Type</th><th>Description</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>{lines.map((line) => <tr key={line.gr_quotelineid}><td>{PRICING_CATEGORY_LABELS[line.gr_category]}</td><td>{line.gr_description}</td><td>{line.gr_quantity}</td><td>{money.format(line.gr_unitprice)}</td><td>{money.format(line.gr_extendedprice)}</td></tr>)}</tbody></table></div> : lines ? <p>No lines recorded on this quote.</p> : null}
                </div>}
            </article>
        })}
    </div>
}

function lineAmendmentDraft(line: ChargeableInvoiceLine, correction?: ChargeableInvoiceCorrection): ChargeableInvoiceCorrectionDraft {
    return {
        type: CHARGEABLE_INVOICE_CORRECTION_TYPES.CHANGE_LINE,
        fieldKey: '', requestedText: '',
        sourceLineId: line.gr_chargeableinvoicelineid,
        requestedLineType: correction?.gr_requestedlinetype ?? line.gr_linetype,
        requestedDescription: correction?.gr_requesteddescription ?? line.gr_description,
        requestedQuantity: String(correction?.gr_requestedquantity ?? line.gr_quantity ?? ''),
        requestedUnitPrice: String(correction?.gr_requestedunitprice ?? line.gr_unitprice ?? ''),
    }
}

function newLineDraft(correction?: ChargeableInvoiceCorrection): ChargeableInvoiceCorrectionDraft {
    return {
        type: CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE,
        fieldKey: '', requestedText: '', sourceLineId: '',
        requestedLineType: correction?.gr_requestedlinetype ?? CHARGEABLE_INVOICE_LINE_TYPES.OTHER,
        requestedDescription: correction?.gr_requesteddescription ?? '',
        requestedQuantity: String(correction?.gr_requestedquantity ?? ''),
        requestedUnitPrice: String(correction?.gr_requestedunitprice ?? ''),
    }
}

function removeLineDraft(line: ChargeableInvoiceLine): ChargeableInvoiceCorrectionDraft {
    return {
        type: CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE,
        fieldKey: '', requestedText: '', sourceLineId: line.gr_chargeableinvoicelineid,
        requestedLineType: null, requestedDescription: '', requestedQuantity: '', requestedUnitPrice: '',
    }
}

function requestedLineTotal(correction: ChargeableInvoiceCorrection, source?: ChargeableInvoiceLine) {
    const quantity = correction.gr_requestedquantity ?? source?.gr_quantity
    const rate = correction.gr_requestedunitprice ?? source?.gr_unitprice
    return quantity == null || rate == null ? '—' : money.format(quantity * rate)
}

function removedLineTotal(line: ChargeableInvoiceLine) {
    const total = line.gr_extendedprice ?? (line.gr_quantity != null && line.gr_unitprice != null
        ? line.gr_quantity * line.gr_unitprice : null)
    return total == null ? '—' : money.format(-Math.abs(total))
}

type SupportingDocumentDirectory = {
    getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
        createWritable: () => Promise<{ write: (data: Blob) => Promise<void>, close: () => Promise<void> }>
    }>
}

type DirectoryPickerWindow = Window & {
    showDirectoryPicker?: (options?: { id?: string, mode?: 'read' | 'readwrite', startIn?: 'downloads' }) => Promise<SupportingDocumentDirectory>
}

function safeSupportingDocumentName(document: ChargeableInvoiceDocument, index: number) {
    const proposed = (document.gr_filename?.trim() || document.gr_name?.trim() || `supporting-document-${index + 1}`)
        .replace(/[<>:"/\\|?*]/g, '_')
        .split('').map((character) => character.charCodeAt(0) < 32 ? '_' : character).join('')
        .replace(/[. ]+$/g, '')
    return proposed.slice(0, 180) || `supporting-document-${index + 1}`
}

async function availableSupportingDocumentName(directory: SupportingDocumentDirectory, proposed: string) {
    const extensionIndex = proposed.lastIndexOf('.')
    const base = extensionIndex > 0 ? proposed.slice(0, extensionIndex) : proposed
    const extension = extensionIndex > 0 ? proposed.slice(extensionIndex) : ''
    for (let suffix = 1; suffix <= 1000; suffix += 1) {
        const candidate = suffix === 1 ? proposed : `${base} (${suffix})${extension}`
        try {
            await directory.getFileHandle(candidate)
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'NotFoundError') return candidate
            throw cause
        }
    }
    throw new Error('The selected folder contains too many files with the same name.')
}

function downloadSupportingDocument(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function prepareSupportingDocument(
    document: ChargeableInvoiceDocument,
    onLoadDocument: (document: ChargeableInvoiceDocument) => Promise<Blob>,
) {
    const source = await onLoadDocument(document)
    return document.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.GREENTREE_INVOICE
        ? brandGreenTreeInvoicePdf(source)
        : source
}

function InlineWorkAmendmentEditor({ initialText = '', saving, onSave, onCancel }: {
    initialText?: string
    saving: boolean
    onSave: (draft: ChargeableInvoiceCorrectionDraft) => Promise<void>
    onCancel: () => void
}) {
    const [text, setText] = useState(initialText)
    const [error, setError] = useState('')
    const save = async () => {
        setError('')
        try {
            await onSave({
                type: CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY,
                fieldKey: 'workCompleted', requestedText: text,
                sourceLineId: '', requestedLineType: null, requestedDescription: '',
                requestedQuantity: '', requestedUnitPrice: '',
            })
            onCancel()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The amendment could not be added.')
        }
    }
    return <div className="chargeable-inline-editor">
        <label className="chargeable-field">Amendment to attach<textarea autoFocus rows={5} maxLength={10000} value={text} disabled={saving} onChange={(event) => setText(event.currentTarget.value)} /></label>
        <p className="chargeable-evidence-note">The original Work completed text remains unchanged. This text is attached separately for Accounts and later revision comparison.</p>
        {error && <p className="chargeable-inline-error" role="alert">{error}</p>}
        <div className="chargeable-inline-editor-actions"><button type="button" className="chargeable-secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="button" className="chargeable-primary" disabled={saving || !text.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save amendment'}</button></div>
    </div>
}

function InlineLineEditor({ line, correction, saving, onSave, onCancel }: {
    line?: ChargeableInvoiceLine
    correction?: ChargeableInvoiceCorrection
    saving: boolean
    onSave: (draft: ChargeableInvoiceCorrectionDraft) => Promise<void>
    onCancel: () => void
}) {
    const [draft, setDraft] = useState<ChargeableInvoiceCorrectionDraft>(() => line ? lineAmendmentDraft(line, correction) : newLineDraft(correction))
    const [error, setError] = useState('')
    const update = <Key extends keyof ChargeableInvoiceCorrectionDraft>(key: Key, value: ChargeableInvoiceCorrectionDraft[Key]) => setDraft((current) => ({ ...current, [key]: value }))
    const quantity = draft.requestedQuantity.trim() === '' ? null : Number(draft.requestedQuantity)
    const rate = draft.requestedUnitPrice.trim() === '' ? null : Number(draft.requestedUnitPrice)
    const proposedTotal = quantity != null && rate != null && Number.isFinite(quantity) && Number.isFinite(rate)
        ? money.format(quantity * rate) : '—'
    const save = async () => {
        setError('')
        try { await onSave(draft); onCancel() }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'The invoice-line amendment could not be added.') }
    }
    return <>
        <tr className="chargeable-inline-line-row">
            <td><span className="sr-only">{line ? 'Amend invoice line. Original values remain visible above.' : 'Add a new invoice line.'}</span><select aria-label="Type" value={draft.requestedLineType ?? ''} disabled={saving} onChange={(event) => update('requestedLineType', event.currentTarget.value ? Number(event.currentTarget.value) as typeof draft.requestedLineType : null)}><option value="">Choose type</option><option value={CHARGEABLE_INVOICE_LINE_TYPES.LABOUR}>Labour</option><option value={CHARGEABLE_INVOICE_LINE_TYPES.PARTS}>Parts</option><option value={CHARGEABLE_INVOICE_LINE_TYPES.OTHER}>Other</option></select></td>
            <td><input aria-label="Description" autoFocus={!line} type="text" maxLength={4000} value={draft.requestedDescription} disabled={saving} onChange={(event) => update('requestedDescription', event.currentTarget.value)} /></td>
            <td><input aria-label="Quantity" type="number" min="0" step="any" value={draft.requestedQuantity} disabled={saving} onChange={(event) => update('requestedQuantity', event.currentTarget.value)} /></td>
            <td><input aria-label="Unit price" type="number" min="0" step="0.01" value={draft.requestedUnitPrice} disabled={saving} onChange={(event) => update('requestedUnitPrice', event.currentTarget.value)} /></td>
            <td className="chargeable-inline-line-total"><span className="sr-only">Proposed total: </span><strong>{proposedTotal}</strong></td>
            <td><div className="chargeable-inline-line-actions"><button type="button" className="chargeable-inline-icon-button cancel" disabled={saving} aria-label="Cancel line edit" title="Cancel" onClick={onCancel}><CloseIcon /></button><button type="button" className="chargeable-inline-icon-button save" disabled={saving} aria-label={saving ? 'Saving line changes' : line ? 'Save amendment' : 'Save line'} title={line ? 'Save amendment' : 'Save line'} onClick={() => void save()}><SaveIcon /></button></div></td>
        </tr>
        {error && <tr className="chargeable-inline-line-error"><td colSpan={6}><p className="chargeable-inline-error" role="alert">{error}</p></td></tr>}
    </>
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
    const [autoSaving, setAutoSaving] = useState(false)
    const validation = validateChargeableInvoiceRequirements(draft)
    const disabled = saving || autoSaving || !review.gr_reviewstartedon || review.gr_disposition != null
    const triState = (value: string) => value === '' ? null : value === 'yes'
    const persist = async (next: ChargeableInvoiceRequirementsDraft, previous: ChargeableInvoiceRequirementsDraft) => {
        setDraft(next)
        setAutoSaving(true)
        try { await onSave(next) }
        catch { setDraft(previous) }
        finally { setAutoSaving(false) }
    }
    const changePoRequired = (value: string) => {
        const required = triState(value)
        const next = {
            ...draft,
            poRequired: required,
            poNumber: required === true ? draft.poNumber : '',
            poReceived: required === true && draft.poReceived,
        }
        void persist(next, draft)
    }
    const changePhotosRequired = (value: string) => {
        const required = triState(value)
        const next = {
            ...draft,
            photosRequired: required,
            photosStatus: required === true
                ? draft.photosStatus ?? CHARGEABLE_INVOICE_PHOTO_STATUSES.NOT_REQUESTED
                : null,
        }
        void persist(next, draft)
    }
    return <>
        <div className="chargeable-decision-grid">
            <label className="chargeable-field">Customer PO required<select value={draft.poRequired == null ? '' : draft.poRequired ? 'yes' : 'no'} disabled={disabled} onChange={(event) => changePoRequired(event.currentTarget.value)}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select></label>
            <label className="chargeable-field">Supporting photos required<select value={draft.photosRequired == null ? '' : draft.photosRequired ? 'yes' : 'no'} disabled={disabled} onChange={(event) => changePhotosRequired(event.currentTarget.value)}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        </div>
        {validation && <p className="chargeable-inline-error" role="alert">{validation}</p>}
        <small className="chargeable-autosave-note" role="status" aria-live="polite">{autoSaving || saving ? 'Saving…' : 'Changes save automatically.'}</small>
    </>
}

function PhotoWorkflow({ workspace, saving, onPrepare, onUpload, onDelete, onLoadDocument }: {
    workspace: Workspace
    saving: boolean
    onPrepare: (technicianId: string) => Promise<string>
    onUpload: (files: File[], technicianId: string) => Promise<void>
    onDelete: (documentIds: string[]) => Promise<void>
    onLoadDocument: (document: ChargeableInvoiceDocument) => Promise<Blob>
}) {
    const review = workspace.review
    const assignedTechnicianLookupId = review.gr_Job?.gr_Mechanic?.gr_mechanicid ?? review.gr_Job?._gr_mechanic_value ?? ''
    const findTechnician = (technicianId?: string | null) => workspace.technicians.find((technician) =>
        technician.gr_mechanicid.toLowerCase() === technicianId?.toLowerCase())
    const assignedTechnician = findTechnician(assignedTechnicianLookupId) ?? review.gr_Job?.gr_Mechanic ?? null
    const savedTechnician = findTechnician(review._gr_photorequesttechnician_value)
    const [technicianId, setTechnicianId] = useState(savedTechnician?.gr_mechanicid
        ?? findTechnician(assignedTechnicianLookupId)?.gr_mechanicid ?? '')
    const [files, setFiles] = useState<File[]>([])
    const [inputKey, setInputKey] = useState(0)
    const [photosToDelete, setPhotosToDelete] = useState<ChargeableInvoiceDocument[]>([])
    const [deleteError, setDeleteError] = useState('')
    const selected = findTechnician(technicianId)
    const isOverride = Boolean(selected && assignedTechnicianLookupId
        && selected.gr_mechanicid.toLowerCase() !== assignedTechnicianLookupId.toLowerCase())
    const technicianOptions = workspace.technicians.map((technician, originalIndex) => {
        const isAssigned = Boolean(assignedTechnicianLookupId
            && technician.gr_mechanicid.toLowerCase() === assignedTechnicianLookupId.toLowerCase())
        return {
            value: technician.gr_mechanicid,
            label: `${technician.gr_name}${isAssigned ? ' — Assigned' : ''}`,
            secondary: [isAssigned ? 'Assigned technician' : '', technician.gr_email || 'No email address'].filter(Boolean).join(' · '),
            searchText: `${technician.gr_email ?? ''} ${isAssigned ? 'assigned primary' : ''}`,
            emphasized: isAssigned,
            originalIndex,
        }
    }).sort((left, right) => Number(right.emphasized) - Number(left.emphasized) || left.originalIndex - right.originalIndex)
    const completePhotos = useMemo(() => workspace.documents.filter((document) =>
        document.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO
        && document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE), [workspace.documents])
    const amendmentsPending = workspace.corrections.some((correction) => isActiveCorrection(correction))
    const disabled = saving || amendmentsPending || review.gr_photosrequired !== true || review.gr_disposition != null
    const retainedPhotoActionsDisabled = saving || review.gr_disposition != null
    const prepare = async () => {
        try { window.location.href = await onPrepare(technicianId) } catch { /* workspace error contains the safe detail */ }
    }
    const upload = async () => {
        try {
            await onUpload(files, technicianId)
            setFiles([])
            setInputKey((current) => current + 1)
        } catch { /* workspace error contains the safe detail */ }
    }
    if (review.gr_photosrequired !== true) return <p>Record that supporting photos are required to enable this workflow.</p>
    return <div className="chargeable-compact-workflow">
        <p className="chargeable-compact-intro">Choose the technician to email for clear photos of the reported fault, damage or completed repair.</p>
        <div className="chargeable-photo-request-row">
            <SearchableSelect id="chargeable-photo-technician" label="Technician to email" value={technicianId} options={technicianOptions} onChange={setTechnicianId} placeholder="Choose technician" searchPlaceholder="Search technicians" emptyLabel="No matching technicians" disabled={disabled} required />
            <button type="button" className="chargeable-secondary chargeable-email-action" disabled={disabled || !selected?.gr_email} onClick={() => void prepare()}><EmailIcon />Request photo evidence</button>
        </div>
        {isOverride && <p className="chargeable-override-note">Job assigned to <strong>{assignedTechnician?.gr_name || 'another technician'}</strong>; request changed to <strong>{selected?.gr_name}</strong>.</p>}
        <small className="chargeable-action-help">Opens an editable email draft; nothing is sent automatically.</small>
        <div className="chargeable-compact-upload">
            <label className="chargeable-field">Add received photos<input key={inputKey} type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" disabled={disabled || !selected} onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} /></label>
            <button type="button" className="chargeable-secondary" disabled={disabled || !selected || files.length === 0} onClick={() => void upload()}>{saving ? 'Uploading…' : 'Upload photos'}</button>
        </div>
        {files.length > 0 && <SelectedPhotoPreviews files={files} />}
        {completePhotos.length > 0 && <UploadedPhotoPreviews documents={completePhotos} disabled={retainedPhotoActionsDisabled} onDelete={(documents) => { setDeleteError(''); setPhotosToDelete(documents) }} onLoadDocument={onLoadDocument} />}
        {files.length > 0 && <p className="chargeable-photo-limit-note">Each file must be 5 MiB or smaller; a review may retain up to 20 photos.</p>}
        {photosToDelete.length > 0 && <EditDrawerConfirmation eyebrow="Permanent photo deletion" title={photosToDelete.length === 1 ? 'Delete this photo?' : `Delete all ${photosToDelete.length} photos?`} message={<>{photosToDelete.length === 1 ? (photosToDelete[0].gr_filename?.trim() || photosToDelete[0].gr_name) : `All ${photosToDelete.length} retained photos`} will be permanently deleted from Dataverse.{photosToDelete.length === completePhotos.length ? ' The invoice will require photo evidence again.' : ''}</>} error={deleteError} isBusy={saving} confirmLabel={photosToDelete.length === 1 ? 'Delete photo' : 'Delete all photos'} onCancel={() => setPhotosToDelete([])} onConfirm={() => { void onDelete(photosToDelete.map((document) => document.gr_chargeableinvoicedocumentid)).then(() => setPhotosToDelete([])).catch((cause) => setDeleteError(cause instanceof Error ? cause.message : 'The photos could not be deleted.')) }} />}
    </div>
}

function canBrowserPreview(contentType: string) {
    return contentType === 'image/jpeg' || contentType === 'image/png'
}

function PhotoPreviewTile({ name, url, status, disabled, onDelete }: { name: string; url?: string; status?: string; disabled?: boolean; onDelete?: () => void }) {
    const content = url
        ? <img src={url} alt="" />
        : <span className="chargeable-photo-preview-placeholder" aria-hidden="true">{status || 'Image'}</span>
    return <figure className="chargeable-photo-preview-tile">
        <div className="chargeable-photo-preview-visual">
            {url ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${name} full size`}>{content}</a> : content}
            {onDelete && <button type="button" className="chargeable-photo-delete" disabled={disabled} aria-label={`Delete ${name} from Dataverse`} title="Delete photo" onClick={onDelete}><TrashIcon /></button>}
        </div>
        <figcaption title={name}>{name}</figcaption>
    </figure>
}

function SelectedPhotoPreviews({ files }: { files: File[] }) {
    const previews = useMemo(() => files.map((file) => ({
        file,
        url: canBrowserPreview(file.type) ? URL.createObjectURL(file) : undefined,
    })), [files])
    useEffect(() => () => previews.forEach(({ url }) => { if (url) URL.revokeObjectURL(url) }), [previews])
    return <div className="chargeable-photo-preview-group">
        <div className="chargeable-photo-preview-heading"><strong>Selected photos</strong><span>{files.length}</span></div>
        <div className="chargeable-photo-previews">{previews.map(({ file, url }, index) =>
            <PhotoPreviewTile key={`${file.name}-${file.size}-${index}`} name={file.name} url={url} status={file.name.split('.').pop()?.toUpperCase()} />)}</div>
    </div>
}

function UploadedPhotoPreviews({ documents, disabled, onDelete, onLoadDocument }: {
    documents: ChargeableInvoiceDocument[]
    disabled: boolean
    onDelete: (documents: ChargeableInvoiceDocument[]) => void
    onLoadDocument: (document: ChargeableInvoiceDocument) => Promise<Blob>
}) {
    const [urls, setUrls] = useState<Record<string, string>>({})
    const [failed, setFailed] = useState<Set<string>>(() => new Set())
    useEffect(() => {
        let cancelled = false
        const createdUrls: string[] = []
        void Promise.all(documents.map(async (document) => {
            if (!canBrowserPreview(document.gr_contenttype)) return
            try {
                const blob = await onLoadDocument(document)
                if (cancelled) return
                const url = URL.createObjectURL(blob)
                createdUrls.push(url)
                setUrls((current) => ({ ...current, [document.gr_chargeableinvoicedocumentid]: url }))
            } catch {
                if (!cancelled) setFailed((current) => new Set(current).add(document.gr_chargeableinvoicedocumentid))
            }
        }))
        return () => {
            cancelled = true
            createdUrls.forEach((url) => URL.revokeObjectURL(url))
        }
    }, [documents, onLoadDocument])
    return <div className="chargeable-photo-preview-group">
        <div className="chargeable-photo-preview-heading"><strong>Received photos</strong><span>{documents.length}</span><button type="button" className="chargeable-photo-remove-all" disabled={disabled} onClick={() => onDelete(documents)}><TrashIcon />Remove all</button></div>
        <div className="chargeable-photo-previews">{documents.map((document) => {
            const id = document.gr_chargeableinvoicedocumentid
            const filename = document.gr_filename?.trim() || document.gr_name
            const status = failed.has(id) ? 'Unavailable' : canBrowserPreview(document.gr_contenttype) ? 'Loading…' : document.gr_contenttype.split('/').pop()?.toUpperCase()
            return <PhotoPreviewTile key={id} name={filename} url={urls[id]} status={status} disabled={disabled} onDelete={() => onDelete([document])} />
        })}</div>
    </div>
}

function PoRequestWorkflow({ workspace, saving, onPrepare, onLoadDocument, onGenerateApprovalPdf }: {
    workspace: Workspace
    saving: boolean
    onPrepare: (draft: ChargeableInvoicePoRecipientDraft) => Promise<string>
    onLoadDocument: (document: ChargeableInvoiceDocument) => Promise<Blob>
    onGenerateApprovalPdf: () => Promise<ChargeableInvoiceDocument>
}) {
    const review = workspace.review
    const configuredRecipients = resolvePurchaseOrderRecipients(workspace.poRecipients,
        review._gr_customer_value, review._gr_site_value)
    const configuredReady = Boolean(configuredRecipients.primary?.gr_Contact
        && isValidRecipientEmail(configuredRecipients.primary.gr_Contact.gr_email))
    const [recipientChoice, setRecipientChoice] = useState(configuredReady ? '__configured__' : '')
    const [manualEmail, setManualEmail] = useState('')
    const [savingDocuments, setSavingDocuments] = useState(false)
    const [documentSaveFeedback, setDocumentSaveFeedback] = useState('')
    const validContacts = workspace.siteContacts.filter((siteContact) =>
        siteContact.gr_Contact && isValidRecipientEmail(siteContact.gr_Contact.gr_email))
    const options = [
        ...(configuredReady ? [{
            value: '__configured__',
            label: `${configuredRecipients.primary!.gr_Contact!.gr_name} — ${configuredRecipients.source === 'site' ? 'Site override' : 'Customer default'}`,
            secondary: `${configuredRecipients.primary!.gr_Contact!.gr_email}${configuredRecipients.cc.length ? ` · CC ${configuredRecipients.cc.map((row) => row.gr_Contact?.gr_name).filter(Boolean).join(', ')}` : ''}`,
            emphasized: true,
        }] : []),
        ...validContacts.map((siteContact) => ({
            value: siteContact.gr_sitecontactid,
            label: siteContact.gr_Contact?.gr_name || 'Site Contact',
            secondary: siteContact.gr_Contact?.gr_email,
            searchText: `${siteContact.gr_Contact?.gr_email ?? ''} ${siteContact.gr_Contact?.gr_phone ?? ''}`,
        })),
        { value: '__manual__', label: 'Enter another email address', secondary: 'Manual recipient' },
    ]
    const currentRevision = workspace.revisions.find((revision) =>
        revision.gr_chargeableinvoicerevisionid.toLowerCase() === review._gr_currentrevision_value?.toLowerCase())
    const latestCorrectionChange = Math.max(0, ...workspace.activities
        .filter((activity) => activity.gr_event === 122830003 || activity.gr_event === 122830004)
        .map((activity) => Date.parse(activity.gr_occurredon) || 0))
    const approvalPdf = workspace.documents.find((document) =>
        document.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.APPROVAL_PDF
        && document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE
        && document.gr_templateversion === CHARGEABLE_INVOICE_APPROVAL_TEMPLATE_VERSION
        && document._gr_revision_value?.toLowerCase() === currentRevision?.gr_chargeableinvoicerevisionid.toLowerCase()
        && (Date.parse(document.createdon || '') || 0) >= latestCorrectionChange)
    const photos = workspace.documents.filter((document) =>
        document.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.SUPPORTING_PHOTO
        && document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE)
    const attachments = [
        ...(approvalPdf ? [approvalPdf] : []),
        ...(review.gr_photosrequired === true ? photos : []),
    ]
    const prerequisites = [
        !review.gr_reviewstartedon ? 'Start the review.' : '',
        review.gr_porequired !== true ? 'Record that a customer PO is required.' : '',
        review.gr_photosrequired == null ? 'Record whether supporting photos are required.' : '',
        !approvalPdf ? 'Generate the Customer PO Approval PDF for the current revision.' : '',
        review.gr_photosrequired === true && (review.gr_photosstatus !== CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED || photos.length === 0)
            ? 'Receive and upload the required supporting photos.' : '',
        review.gr_poreceivedon ? 'A confirmed customer PO has already been received.' : '',
    ].filter(Boolean)
    const recipientReady = recipientChoice === '__manual__'
        ? isValidRecipientEmail(manualEmail)
        : recipientChoice === '__configured__'
        ? configuredReady
        : validContacts.some((siteContact) => siteContact.gr_sitecontactid === recipientChoice)
    const prepare = async () => {
        try {
            const draft = recipientChoice === '__manual__'
                ? { manualEmail }
                : recipientChoice === '__configured__'
                ? { useConfiguredRecipients: true }
                : { siteContactId: recipientChoice }
            window.location.href = await onPrepare(draft)
        } catch { /* workspace error contains the safe detail */ }
    }
    const saveAll = async () => {
        setSavingDocuments(true)
        setDocumentSaveFeedback('')
        try {
            const chooseDirectory = (window as DirectoryPickerWindow).showDirectoryPicker
            if (!chooseDirectory) {
                for (const [index, document] of attachments.entries()) {
                    downloadSupportingDocument(
                        await prepareSupportingDocument(document, onLoadDocument),
                        safeSupportingDocumentName(document, index),
                    )
                }
                setDocumentSaveFeedback(`${attachments.length} supporting document${attachments.length === 1 ? '' : 's'} sent to your browser downloads.`)
                return
            }
            const directory = await chooseDirectory.call(window, {
                id: 'invoice-support-documents', mode: 'readwrite', startIn: 'downloads',
            })
            for (const [index, document] of attachments.entries()) {
                const blob = await prepareSupportingDocument(document, onLoadDocument)
                const filename = await availableSupportingDocumentName(directory, safeSupportingDocumentName(document, index))
                const fileHandle = await directory.getFileHandle(filename, { create: true })
                const writable = await fileHandle.createWritable()
                try {
                    await writable.write(blob)
                } finally {
                    await writable.close()
                }
            }
            setDocumentSaveFeedback(`${attachments.length} supporting document${attachments.length === 1 ? '' : 's'} saved to the selected folder.`)
        } catch (cause) {
            if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
                setDocumentSaveFeedback(cause instanceof Error ? cause.message : 'The supporting documents could not be saved.')
            }
        } finally {
            setSavingDocuments(false)
        }
    }
    if (review.gr_porequired !== true) return <p>Record that a customer PO is required to enable this workflow.</p>
    return <div className="chargeable-compact-workflow">
        <p className="chargeable-compact-intro">Generate the provisional Customer PO Approval PDF from the current invoice and active amendments, choose the responsible contact, then save and attach the supporting documents.</p>
        {!configuredReady && validContacts.length === 0 && <p className="chargeable-evidence-note">No customer or site recipient with a valid email is configured yet. Add PO Contacts in the Customer screen, or enter an address manually for this draft.</p>}
        <SearchableSelect id="chargeable-po-recipient" label="Customer PO recipients" value={recipientChoice} options={options} onChange={setRecipientChoice} placeholder="Choose configured recipients, a Site Contact, or manual email" searchPlaceholder="Search recipients" emptyLabel="No matching recipients" disabled={saving || review.gr_disposition != null || Boolean(review.gr_poreceivedon)} required />
        {recipientChoice === '__manual__' && <label className="chargeable-field">Recipient email<input type="email" value={manualEmail} maxLength={320} autoComplete="email" disabled={saving} onChange={(event) => setManualEmail(event.currentTarget.value)} /></label>}
        {prerequisites.length > 0 && <ul className="chargeable-blockers">{prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>}
        <div className="chargeable-po-files">
            <div className="chargeable-po-files-heading"><div><h4>Files for the customer email</h4><p>The approval document is provisional, is not a tax invoice, and leaves the original GreenTree evidence unchanged.</p></div><div className="chargeable-po-file-actions"><button type="button" className="chargeable-secondary" disabled={saving || savingDocuments || !currentRevision} onClick={() => void onGenerateApprovalPdf()}>{approvalPdf ? 'Regenerate approval PDF' : 'Generate approval PDF'}</button><button type="button" className="chargeable-secondary" disabled={saving || savingDocuments || attachments.length === 0 || !approvalPdf} onClick={() => void saveAll()}>{savingDocuments ? 'Saving…' : `Save supporting documents (${attachments.length})`}</button></div></div>
            <ul className="chargeable-document-list">
                <li className={approvalPdf ? undefined : 'chargeable-document-missing'}><span><strong>Customer PO Approval PDF</strong><small>{approvalPdf ? approvalPdf.gr_filename || approvalPdf.gr_name : 'Generate this from the current revision and active amendments.'}</small></span>{approvalPdf && <small>For PO approval - not a tax invoice</small>}</li>
                {review.gr_photosrequired === true && photos.map((document, index) => <li key={document.gr_chargeableinvoicedocumentid}><span><strong>Supporting photo {index + 1}</strong><small>{document.gr_filename || document.gr_name}</small></span></li>)}
                {review.gr_photosrequired === true && photos.length === 0 && <li className="chargeable-document-missing"><span><strong>Supporting photos</strong><small>Upload the required photo evidence first.</small></span></li>}
            </ul>
            {documentSaveFeedback && <p className="chargeable-evidence-note" role="status" aria-live="polite">{documentSaveFeedback}</p>}
        </div>
        <div className="chargeable-compact-action"><button type="button" className="chargeable-secondary chargeable-email-action" disabled={saving || review.gr_disposition != null || prerequisites.length > 0 || !recipientReady || attachments.length === 0} onClick={() => void prepare()}><EmailIcon />{saving ? 'Preparing...' : 'Open customer PO email'}</button><small>Opens an editable draft to the selected recipient. Attach the downloaded invoice and photos before sending.</small>{review.gr_porequestpreparedon && <small>Last opened {formatDateTime(review.gr_porequestpreparedon)}.</small>}</div>
    </div>
}

export default function ChargeableInvoiceWorkspace({
    workspace, loading, saving, error, onStart, onSaveWaiting, onSaveRequirements,
    onPreparePhotoRequest, onPreparePoRequest, onUploadPhotos, onDeletePhotos,
    onMarkReady, onMarkDoNotProcess, onDelete, onAddCorrection, onReplaceCorrection, onSupersedeCorrection, onLoadDocument, onDownload, onLoadQuoteLines, onGenerateApprovalPdf, onClose,
}: Props) {
    const [tab, setTab] = useState<Tab>('amendments')
    const [showReadyConfirmation, setShowReadyConfirmation] = useState(false)
    const [showDoNotProcess, setShowDoNotProcess] = useState(false)
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
    const [deleteConfirmation, setDeleteConfirmation] = useState('')
    const [deleteError, setDeleteError] = useState('')
    const [dispositionReason, setDispositionReason] = useState('')
    const [dispositionError, setDispositionError] = useState('')
    const [previewUrl, setPreviewUrl] = useState('')
    const [previewBusy, setPreviewBusy] = useState(false)
    const [correctionEditor, setCorrectionEditor] = useState<CorrectionEditorState | null>(null)
    const [departingCorrectionId, setDepartingCorrectionId] = useState<string | null>(null)
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
    const currentCorrections = useMemo(() => workspace?.corrections.filter((correction) =>
        correction._gr_sourcerevision_value === currentRevision?.gr_chargeableinvoicerevisionid) ?? [],
    [currentRevision?.gr_chargeableinvoicerevisionid, workspace?.corrections])
    const amendedTotals = useMemo(() => currentRevision
        ? buildChargeableInvoiceAmendedTotals(currentRevision, currentLines, currentCorrections)
        : null, [currentCorrections, currentLines, currentRevision])
    const workAmendments = currentCorrections.filter((correction) =>
        correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.STORY
        && correction.gr_fieldkey === 'workCompleted' && isActiveCorrection(correction))
    const addedLines = currentCorrections.filter((correction) =>
        correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.ADD_LINE && isActiveCorrection(correction))
    const lineCorrections = (lineId: string) => currentCorrections.filter((correction) =>
        correction._gr_sourceline_value === lineId && isActiveCorrection(correction))
    const sourceDocument = useMemo(() => workspace?.documents.find((document) =>
        document.gr_chargeableinvoicedocumentid === currentRevision?._gr_sourcedocument_value
        && document.gr_contenttype === 'application/pdf'),
    [currentRevision?._gr_sourcedocument_value, workspace?.documents])
    const correctionInstructions = useMemo(() => {
        if (!workspace) return null
        try { return buildChargeableInvoiceCorrectionInstructions(workspace) } catch { return null }
    }, [workspace])
    const latestCorrectionChange = Math.max(0, ...(workspace?.activities ?? [])
        .filter((activity) => activity.gr_event === 122830003 || activity.gr_event === 122830004)
        .map((activity) => Date.parse(activity.gr_occurredon) || 0))
    const amendedInvoicePdf = workspace?.documents.find((document) =>
        document.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.APPROVAL_PDF
        && document.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE
        && document.gr_templateversion === CHARGEABLE_INVOICE_APPROVAL_TEMPLATE_VERSION
        && document._gr_revision_value?.toLowerCase() === currentRevision?.gr_chargeableinvoicerevisionid.toLowerCase()
        && (Date.parse(document.createdon || '') || 0) >= latestCorrectionChange)
    const blockers = review ? getReadyToProcessBlockers(review) : []
    const canCorrect = Boolean(review?.gr_reviewstartedon && review.gr_disposition == null)
    const correctionActionsDisabled = saving || correctionEditor != null || departingCorrectionId != null
    const saveCorrection = (draft: ChargeableInvoiceCorrectionDraft) => correctionEditor?.correctionId
        ? onReplaceCorrection(correctionEditor.correctionId, draft) : onAddCorrection(draft)
    const removeCorrection = async (correctionId: string) => {
        setDepartingCorrectionId(correctionId)
        const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : CORRECTION_EXIT_ANIMATION_MS
        await new Promise((resolve) => window.setTimeout(resolve, delay))
        try { await onSupersedeCorrection(correctionId) }
        finally { setDepartingCorrectionId(null) }
    }
    const unresolvedCorrectionCount = correctionInstructions?.count ?? 0
    const deletionRecordCount = workspace ? 1 + workspace.revisions.length + workspace.lines.length
        + workspace.corrections.length + workspace.documents.length + workspace.activities.length : 0

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
            await navigator.clipboard.writeText(correctionInstructions.emailText)
            setInstructionFeedback(`Email summary for ${correctionInstructions.count} active amendment${correctionInstructions.count === 1 ? '' : 's'} copied.`)
        } catch {
            setInstructionFeedback('The email summary could not be copied. Select the summary text and copy it manually.')
        }
    }

    const openCorrectionEmail = () => {
        if (!correctionInstructions || !review) return
        const jobNumber = review.gr_Job?.gr_jobnumber || review.gr_greentreereference
        const subject = `Invoice amendments required - ${review.gr_invoicenumber}${jobNumber ? ` - Job ${jobNumber}` : ''}`
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(correctionInstructions.emailText)}`
        setInstructionFeedback('An editable amendment email draft was opened with the recipient blank. Add the recipient before sending.')
    }
    const generateAmendedInvoice = async () => {
        setInstructionFeedback('')
        try {
            const document = await onGenerateApprovalPdf()
            await onDownload(document)
            setInstructionFeedback('The amended invoice PDF was generated and sent to your browser downloads.')
        } catch (error) {
            setInstructionFeedback(error instanceof Error ? error.message : 'The amended invoice PDF could not be saved.')
        }
    }

    return <EditDrawerShell
        eyebrow="Chargeable invoice"
        title={review?.gr_invoicenumber || 'Loading review…'}
        className="chargeable-review-drawer"
        busy={saving}
        onClose={onClose}
        footer={<>
            {review && <button type="button" className="danger" disabled={saving} onClick={() => { setDeleteConfirmation(''); setDeleteError(''); setShowDeleteConfirmation(true) }}>Delete invoice</button>}
            {review && !review.gr_reviewstartedon && <button type="button" className="primary" disabled={saving} onClick={() => void onStart()}>{saving ? 'Starting…' : 'Start review'}</button>}
            {review?.gr_reviewstartedon && review.gr_disposition == null && <button type="button" className="primary" disabled={saving || blockers.length > 0} onClick={() => { setDispositionError(''); setShowReadyConfirmation(true) }}>Ready to Process</button>}
            {review?.gr_reviewstartedon && review.gr_disposition == null && <button type="button" className="danger" disabled={saving || review.gr_waitingon != null} onClick={() => { setDispositionReason(''); setDispositionError(''); setShowDoNotProcess(true) }}>Do Not Process</button>}
            <button type="button" disabled={saving} onClick={onClose}>Close</button>
        </>}
    >
        <div className="chargeable-review-workspace-layout">
            <div className="chargeable-review-tabs">
                <DrawerTabs
                    tabs={[{ id: 'amendments', label: 'Amendments' }, { id: 'requests', label: 'Requests' }, { id: 'waiting', label: 'Waiting' }, { id: 'history', label: 'History' }]}
                    activeTab={tab}
                    onChange={setTab}
                    ariaLabel="Chargeable Invoice Review details"
                />
            </div>
            <section className={`chargeable-review-source-pane${tab === 'amendments' ? ' mobile-visible' : ''}`} aria-label="Source invoice PDF">
                <div className="chargeable-review-pane-heading">
                    <div><p>Source document</p><h3>{currentRevision ? `Revision ${currentRevision.gr_revisionnumber}` : 'Invoice PDF'}</h3></div>
                    {sourceDocument && previewUrl && <button type="button" className="chargeable-secondary" onClick={() => void onDownload(sourceDocument)}>Download</button>}
                </div>
                {!currentRevision || loading ? <p>Loading source invoice…</p> : !sourceDocument ? <p>The current revision has no available source PDF.</p> : previewUrl
                    ? <iframe className="chargeable-pdf-viewer" src={previewUrl} title={`Source invoice ${currentRevision.gr_invoicenumber}`} />
                    : <div className="chargeable-pdf-placeholder"><p>Load the protected source PDF, then keep it visible while reviewing details and recording corrections.</p><button type="button" className="chargeable-secondary" disabled={previewBusy} onClick={() => void loadPdfPreview()}>{previewBusy ? 'Loading PDF…' : 'View source PDF'}</button></div>}
            </section>
            <div className="chargeable-review-detail-pane">
                {error && <div className="chargeable-banner error" role="alert">{error}</div>}
                {loading && <p>Loading invoice review…</p>}

        <div role="tabpanel" id="drawer-tab-panel-amendments" aria-labelledby="drawer-tab-amendments" hidden={tab !== 'amendments'}>
            {currentRevision && <>
                <EditDrawerSection title={`Revision ${currentRevision.gr_revisionnumber}`}>
                    <dl className="chargeable-detail-grid">
                        <div><dt>Headline</dt><dd>{currentRevision.gr_headline || '—'}</dd></div>
                        <div><dt>Order number</dt><dd>{currentRevision.gr_rawordernumber || '—'}</dd></div>
                        <div><dt>Date of Job</dt><dd>{currentRevision.gr_dateofjob || '—'}</dd></div>
                        <div><dt>Total (incl. GST)</dt><dd>{currentRevision.gr_total == null ? '—' : money.format(currentRevision.gr_total)}</dd></div>
                    </dl>
                    {currentRevision.gr_repairdescription && <><h4>Description of repair work</h4><p>{currentRevision.gr_repairdescription}</p></>}
                    <div className="chargeable-amendment-block">
                        <div className="chargeable-section-heading"><h4>Work completed</h4>{canCorrect && workAmendments.length === 0 && <button type="button" className="chargeable-secondary" disabled={correctionActionsDisabled} onClick={() => setCorrectionEditor({ kind: 'work' })}>Add amendment</button>}</div>
                        <p>{currentRevision.gr_workcompleted || 'Not recorded'}</p>
                        {correctionEditor?.kind === 'work' && !correctionEditor.correctionId && <InlineWorkAmendmentEditor saving={saving} onSave={saveCorrection} onCancel={() => setCorrectionEditor(null)} />}
                        {workAmendments.length > 0 && <div className="chargeable-amendments"><strong>Attached amendments</strong>{workAmendments.map((correction) => <div key={correction.gr_chargeableinvoicecorrectionid} className={departingCorrectionId === correction.gr_chargeableinvoicecorrectionid ? 'chargeable-row-departing' : undefined}><div className="chargeable-correction-row-actions">{visibleCorrectionStatus(correction, revisionNumbers) && <span>{visibleCorrectionStatus(correction, revisionNumbers)}</span>}{canCorrect && <><button type="button" className="chargeable-line-edit-button" disabled={correctionActionsDisabled} aria-label="Edit Work completed amendment" title="Edit amendment" onClick={() => setCorrectionEditor({ kind: 'work', correctionId: correction.gr_chargeableinvoicecorrectionid })}><PencilIcon /></button><button type="button" className="chargeable-line-restore-button" disabled={correctionActionsDisabled} aria-label="Cancel Work completed amendment and restore original text" title="Cancel amendment — restore original" onClick={() => void removeCorrection(correction.gr_chargeableinvoicecorrectionid).catch(() => {})}><RestoreIcon /></button></>}</div><p>{correction.gr_requestedtext}</p>{correctionEditor?.kind === 'work' && correctionEditor.correctionId === correction.gr_chargeableinvoicecorrectionid && <InlineWorkAmendmentEditor initialText={correction.gr_requestedtext ?? ''} saving={saving} onSave={saveCorrection} onCancel={() => setCorrectionEditor(null)} />}</div>)}</div>}
                    </div>
                </EditDrawerSection>
                <EditDrawerSection title={`Related quotes (${workspace?.relatedQuotes.length ?? 0})`}>
                    <RelatedQuotes quotes={workspace?.relatedQuotes ?? []} error={workspace?.relatedQuotesError} jobNumber={review?.gr_Job?.gr_jobnumber || review?.gr_greentreereference} invoiceTotal={currentRevision.gr_total} onLoadLines={onLoadQuoteLines} />
                </EditDrawerSection>
                <EditDrawerSection title="Invoice lines">
                    <div className="chargeable-section-heading"><p>Original invoice values remain visible. Amendments appear directly beneath their source line.</p>{canCorrect && <button type="button" className="chargeable-secondary" disabled={correctionActionsDisabled} onClick={() => setCorrectionEditor({ kind: 'add-line' })}>Add new line</button>}</div>
                    <div className="chargeable-workspace-table-wrap"><table className="chargeable-workspace-table">
                        <thead><tr><th>Type</th><th>Description</th><th>Qty</th><th>Rate</th><th>Total</th><th><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>
                            {currentLines.map((line) => {
                                const corrections = lineCorrections(line.gr_chargeableinvoicelineid)
                                const removal = corrections.find((correction) => correction.gr_correctiontype === CHARGEABLE_INVOICE_CORRECTION_TYPES.REMOVE_LINE)
                                return <Fragment key={line.gr_chargeableinvoicelineid}>
                                    <tr className={removal ? `chargeable-removed-line${departingCorrectionId === removal.gr_chargeableinvoicecorrectionid ? ' chargeable-row-departing' : ''}` : corrections.length ? 'chargeable-source-line-amended' : undefined}>
                                        <td>{removal ? <><span>Remove</span><small>{lineTypeLabel(line.gr_linetype)}</small></> : lineTypeLabel(line.gr_linetype)}</td><td>{line.gr_description}</td><td>{line.gr_quantity ?? '—'}</td><td>{line.gr_unitprice == null ? '—' : money.format(line.gr_unitprice)}</td><td>{removal ? removedLineTotal(line) : line.gr_extendedprice == null ? '—' : money.format(line.gr_extendedprice)}</td>
                                        <td>{removal
                                            ? <div className="chargeable-correction-row-actions">{visibleCorrectionStatus(removal, revisionNumbers) && <span>{visibleCorrectionStatus(removal, revisionNumbers)}</span>}{canCorrect && <button type="button" className="chargeable-line-restore-button" disabled={correctionActionsDisabled} aria-label={`Cancel removal and restore original line: ${line.gr_description}`} title="Cancel removal — restore original" onClick={() => void removeCorrection(removal.gr_chargeableinvoicecorrectionid).catch(() => {})}><RestoreIcon /></button>}</div>
                                            : canCorrect && corrections.length === 0 && <div className="chargeable-source-line-actions"><button type="button" className="chargeable-line-edit-button" disabled={correctionActionsDisabled} aria-label={`Amend invoice line: ${line.gr_description}`} title="Amend line" onClick={() => setCorrectionEditor({ kind: 'line', lineId: line.gr_chargeableinvoicelineid })}><PencilIcon /></button><button type="button" className="chargeable-line-remove-button" disabled={correctionActionsDisabled} aria-label={`Remove invoice line: ${line.gr_description}`} title="Remove line" onClick={() => void onAddCorrection(removeLineDraft(line)).catch(() => {})}><TrashIcon /></button></div>}</td>
                                    </tr>
                                    {correctionEditor?.kind === 'line' && correctionEditor.lineId === line.gr_chargeableinvoicelineid && !correctionEditor.correctionId && <InlineLineEditor line={line} saving={saving} onSave={saveCorrection} onCancel={() => setCorrectionEditor(null)} />}
                                    {corrections.filter((correction) => correction !== removal).map((correction) => <Fragment key={correction.gr_chargeableinvoicecorrectionid}><tr className={`chargeable-amended-line${departingCorrectionId === correction.gr_chargeableinvoicecorrectionid ? ' chargeable-row-departing' : ''}`}>
                                        <td><span>Amendment</span></td><td>{correction.gr_requesteddescription || line.gr_description}</td><td>{correction.gr_requestedquantity ?? line.gr_quantity ?? '—'}</td><td>{correction.gr_requestedunitprice == null ? line.gr_unitprice == null ? '—' : money.format(line.gr_unitprice) : money.format(correction.gr_requestedunitprice)}</td><td>{requestedLineTotal(correction, line)}</td>
                                        <td><div className="chargeable-correction-row-actions">{visibleCorrectionStatus(correction, revisionNumbers) && <span>{visibleCorrectionStatus(correction, revisionNumbers)}</span>}{canCorrect && <><button type="button" className="chargeable-line-edit-button" disabled={correctionActionsDisabled} aria-label={`Edit amendment: ${correction.gr_requesteddescription || line.gr_description}`} title="Edit amendment" onClick={() => setCorrectionEditor({ kind: 'line', lineId: line.gr_chargeableinvoicelineid, correctionId: correction.gr_chargeableinvoicecorrectionid })}><PencilIcon /></button><button type="button" className="chargeable-line-restore-button" disabled={correctionActionsDisabled} aria-label={`Cancel amendment and restore original line: ${line.gr_description}`} title="Cancel amendment — restore original" onClick={() => void removeCorrection(correction.gr_chargeableinvoicecorrectionid).catch(() => {})}><RestoreIcon /></button></>}</div></td>
                                    </tr>{correctionEditor?.kind === 'line' && correctionEditor.correctionId === correction.gr_chargeableinvoicecorrectionid && <InlineLineEditor line={line} correction={correction} saving={saving} onSave={saveCorrection} onCancel={() => setCorrectionEditor(null)} />}</Fragment>)}
                                </Fragment>
                            })}
                            {addedLines.map((correction) => <Fragment key={correction.gr_chargeableinvoicecorrectionid}>
                                <tr className={`chargeable-added-line${departingCorrectionId === correction.gr_chargeableinvoicecorrectionid ? ' chargeable-row-departing' : ''}`}><td><span>New line</span><small>{lineTypeLabel(correction.gr_requestedlinetype)}</small></td><td>{correction.gr_requesteddescription}</td><td>{correction.gr_requestedquantity ?? '—'}</td><td>{correction.gr_requestedunitprice == null ? '—' : money.format(correction.gr_requestedunitprice)}</td><td>{requestedLineTotal(correction)}</td><td><div className="chargeable-correction-row-actions">{visibleCorrectionStatus(correction, revisionNumbers) && <span>{visibleCorrectionStatus(correction, revisionNumbers)}</span>}{canCorrect && <><button type="button" className="chargeable-line-edit-button" disabled={correctionActionsDisabled} aria-label={`Edit requested new line: ${correction.gr_requesteddescription}`} title="Edit requested line" onClick={() => setCorrectionEditor({ kind: 'add-line', correctionId: correction.gr_chargeableinvoicecorrectionid })}><PencilIcon /></button><button type="button" className="chargeable-line-remove-button" disabled={correctionActionsDisabled} aria-label={`Remove requested new line: ${correction.gr_requesteddescription}`} title="Remove new line" onClick={() => void removeCorrection(correction.gr_chargeableinvoicecorrectionid).catch(() => {})}><TrashIcon /></button></>}</div></td></tr>
                                {correctionEditor?.kind === 'add-line' && correctionEditor.correctionId === correction.gr_chargeableinvoicecorrectionid && <InlineLineEditor correction={correction} saving={saving} onSave={saveCorrection} onCancel={() => setCorrectionEditor(null)} />}
                            </Fragment>)}
                            {correctionEditor?.kind === 'add-line' && !correctionEditor.correctionId && <InlineLineEditor saving={saving} onSave={saveCorrection} onCancel={() => setCorrectionEditor(null)} />}
                        </tbody>
                    </table></div>
                    <div className="chargeable-invoice-totals" role="group" aria-label="Source and adjusted invoice totals">
                        <div className="chargeable-invoice-totals-heading" aria-hidden="true"><span></span><span>Source PDF</span><span>After amendments</span></div>
                        <dl>
                            <div><dt>Subtotal</dt><dd>{currentRevision.gr_subtotal == null ? '—' : money.format(currentRevision.gr_subtotal)}</dd><dd>{amendedTotals?.adjustedSubtotal == null ? '—' : money.format(amendedTotals.adjustedSubtotal)}</dd></div>
                            <div><dt>{currentRevision.gr_gstrate == null ? 'GST' : `GST (${currentRevision.gr_gstrate.toFixed(1)}%)`}</dt><dd>{currentRevision.gr_gstamount == null ? '—' : money.format(currentRevision.gr_gstamount)}</dd><dd>{amendedTotals?.adjustedGst == null ? '—' : money.format(amendedTotals.adjustedGst)}</dd></div>
                            <div className="chargeable-invoice-grand-total"><dt>Total (incl. GST)</dt><dd>{currentRevision.gr_total == null ? '—' : money.format(currentRevision.gr_total)}</dd><dd>{amendedTotals?.adjustedTotal == null ? '—' : money.format(amendedTotals.adjustedTotal)}</dd></div>
                            {amendedTotals?.hasPricingChanges && amendedTotals.totalChange != null && <div className="chargeable-invoice-total-change"><dt>Pricing change</dt><dd className={amendedTotals.totalChange > 0 ? 'increase' : amendedTotals.totalChange < 0 ? 'decrease' : ''}>{amendedTotals.totalChange > 0 ? '+' : ''}{money.format(amendedTotals.totalChange)}</dd></div>}
                        </dl>
                    </div>
                    {amendedTotals?.hasPricingChanges && !amendedTotals.complete && <p className="chargeable-inline-error">Adjusted totals need a quantity and rate for every requested pricing line.</p>}
                </EditDrawerSection>
                <EditDrawerSection title="Amendment handoff">
                    {correctionInstructions ? <>
                        <div className="chargeable-handoff-heading"><div><strong>{correctionInstructions.count} active amendment{correctionInstructions.count === 1 ? '' : 's'}</strong><p>Current instructions for Nargiza. Superseded edits and resolved history are excluded.</p></div><div className="chargeable-handoff-actions"><button type="button" className="chargeable-secondary chargeable-email-action" onClick={openCorrectionEmail}><EmailIcon />Email amendments</button><button type="button" className="chargeable-secondary" onClick={() => void copyCorrectionInstructions()}>Copy email summary</button></div></div>
                        <ol className="chargeable-handoff-list">{correctionInstructions.items.map((item) => <li key={item.id}><strong>{item.title}</strong><p>{item.detail}</p>{item.note && <small>{item.note}</small>}</li>)}</ol>
                        <p className="chargeable-evidence-note">Email amendments opens an editable draft with the recipient blank. Nothing is sent automatically.</p>
                        <div className="chargeable-amended-invoice-action">
                            <div><strong>Amended invoice</strong><p>Fill the approved invoice template with these active amendments and the recalculated totals.</p></div>
                            <div className="chargeable-handoff-actions">
                                {amendedInvoicePdf && <button type="button" className="chargeable-secondary" disabled={saving} onClick={() => void onDownload(amendedInvoicePdf)}>Download amended invoice</button>}
                                <button type="button" className="chargeable-primary" disabled={saving || !currentRevision || amendedTotals?.complete === false} onClick={() => void generateAmendedInvoice()}>{saving ? 'Generating PDF…' : amendedInvoicePdf ? 'Regenerate and save PDF' : 'Generate and save PDF'}</button>
                            </div>
                        </div>
                    </> : <div className="chargeable-handoff-empty"><strong>No active amendments</strong><p>There is nothing to hand off from the current working revision.</p></div>}
                    {instructionFeedback && <p role="status" aria-live="polite">{instructionFeedback}</p>}
                </EditDrawerSection>
            </>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-requests" aria-labelledby="drawer-tab-requests" hidden={tab !== 'requests'}>
            {review && <>
                <EditDrawerSection title="What is required?">
                    <p>Choose only what must be obtained before Accounts can process this invoice.</p>
                    <RequirementsEditor key={`${review.gr_chargeableinvoicereviewid}-requirements-${review['@odata.etag']}`} workspace={workspace} saving={saving} onSave={onSaveRequirements} />
                </EditDrawerSection>
                {unresolvedCorrectionCount > 0 && <div className="chargeable-request-stage-lock" role="status"><div><strong>Approval copy will include active amendments</strong><p>Regenerate the Customer PO Approval PDF after changing any amendment. GreenTree remains the final tax-invoice authority.</p></div><button type="button" className="chargeable-secondary" onClick={() => setTab('amendments')}>View amendments</button></div>}
                {review.gr_photosrequired === true && <EditDrawerSection title="Photo evidence">
                    <PhotoWorkflow key={`${review.gr_chargeableinvoicereviewid}-photos-${review['@odata.etag']}`} workspace={workspace} saving={saving} onPrepare={onPreparePhotoRequest} onUpload={onUploadPhotos} onDelete={onDeletePhotos} onLoadDocument={onLoadDocument} />
                </EditDrawerSection>}
                {review.gr_porequired === true && <EditDrawerSection title="Customer PO">
                    <PoRequestWorkflow key={`${review.gr_chargeableinvoicereviewid}-po-${review['@odata.etag']}`} workspace={workspace} saving={saving} onPrepare={onPreparePoRequest} onLoadDocument={onLoadDocument} onGenerateApprovalPdf={onGenerateApprovalPdf} />
                </EditDrawerSection>}
            </>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-waiting" aria-labelledby="drawer-tab-waiting" hidden={tab !== 'waiting'}>
            {review && <>
                <EditDrawerSection title="Waiting on">
                    <p className="chargeable-tab-intro">Use this when progress depends on someone else—for example Sales confirming a trade-in, a technician supplying photos or the correct work date, or a customer confirming whether work should be invoiced.</p>
                    <WaitingEditor key={`${review.gr_chargeableinvoicereviewid}-${review['@odata.etag']}`} workspace={workspace} saving={saving} onSave={onSaveWaiting} />
                </EditDrawerSection>
                <EditDrawerSection title="Ready-to-process checks">
                    {blockers.length ? <ul className="chargeable-blockers">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="chargeable-ready-message">All recorded prerequisites are satisfied. This invoice can be handed to processing.</p>}
                    {unresolvedCorrectionCount > 0 && <p className="chargeable-evidence-note">{unresolvedCorrectionCount} correction instruction{unresolvedCorrectionCount === 1 ? '' : 's'} will remain attached for Nargiza / Accounts to process.</p>}
                </EditDrawerSection>
            </>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-history" aria-labelledby="drawer-tab-history" hidden={tab !== 'history'}>
            <EditDrawerSection title="Activity">
                {workspace?.activities.length ? <ol className="chargeable-activity-list">{workspace.activities.map((activity) => <li key={activity.gr_chargeableinvoiceactivityid}><strong>{eventLabel(activity.gr_event)}</strong><span>{formatDateTime(activity.gr_occurredon)} · {activity['_createdby_value@OData.Community.Display.V1.FormattedValue'] || 'Manager'}</span>{activity.gr_detail && <p>{activity.gr_detail}</p>}</li>)}</ol> : <p>No activity is available.</p>}
            </EditDrawerSection>
        </div>
            </div>
        </div>
        {showReadyConfirmation && <EditDrawerConfirmation eyebrow="Terminal review decision" title="Mark Ready to Process?" message={`This moves the invoice to the Ready queue for Nargiza / Accounts. ${review?.gr_porequired ? 'The PO request has been prepared and Accounts now owns customer follow-up. ' : ''}${unresolvedCorrectionCount ? `${unresolvedCorrectionCount} correction instruction${unresolvedCorrectionCount === 1 ? '' : 's'} will remain attached for processing. ` : ''}It does not change the Job or send a communication.`} error={dispositionError} isBusy={saving} confirmLabel="Mark Ready" onCancel={() => setShowReadyConfirmation(false)} onConfirm={() => { void onMarkReady().then(() => setShowReadyConfirmation(false)).catch((cause) => setDispositionError(cause instanceof Error ? cause.message : 'The review could not be updated.')) }} />}
        {showDoNotProcess && <EditDrawerFormDialog eyebrow="Terminal review decision" title="Do Not Process" error={dispositionError} isBusy={saving} submitLabel="Confirm Do Not Process" onCancel={() => setShowDoNotProcess(false)} onSubmit={() => { if (!dispositionReason.trim()) { setDispositionError('Enter the reason this invoice must not be processed.'); return } void onMarkDoNotProcess(dispositionReason).then(() => setShowDoNotProcess(false)).catch((cause) => setDispositionError(cause instanceof Error ? cause.message : 'The review could not be updated.')) }}><label className="chargeable-field">Reason<textarea rows={5} value={dispositionReason} maxLength={4000} onChange={(event) => setDispositionReason(event.currentTarget.value)} /></label></EditDrawerFormDialog>}
        {showDeleteConfirmation && review && <EditDrawerFormDialog eyebrow="Permanent deletion" title={`Delete invoice ${review.gr_invoicenumber}?`} error={deleteError} isBusy={saving} destructive submitDisabled={deleteConfirmation.trim() !== review.gr_invoicenumber} submitLabel={saving ? 'Deleting…' : 'Permanently delete'} onCancel={() => setShowDeleteConfirmation(false)} onSubmit={() => {
            if (deleteConfirmation.trim() !== review.gr_invoicenumber) { setDeleteError(`Type ${review.gr_invoicenumber} exactly to confirm.`); return }
            void onDelete().catch((cause) => setDeleteError(cause instanceof Error ? cause.message : 'The invoice package could not be deleted.'))
        }}>
            <p>This permanently deletes {deletionRecordCount} Dataverse record{deletionRecordCount === 1 ? '' : 's'}, including every stored PDF and supporting document. The linked Job, Customer, Site and Equipment are not changed. This cannot be undone.</p>
            <label>Type <strong>{review.gr_invoicenumber}</strong> to confirm<input type="text" value={deleteConfirmation} autoComplete="off" disabled={saving} onChange={(event) => { setDeleteConfirmation(event.currentTarget.value); setDeleteError('') }} /></label>
        </EditDrawerFormDialog>}
    </EditDrawerShell>
}
