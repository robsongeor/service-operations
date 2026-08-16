import { useMemo, useState, type FormEvent } from 'react'
import {
    PRICING_CATEGORIES,
    PRICING_CATEGORY_LABELS,
    type PricingCategory,
    type PricingItem,
} from '../types/pricing.types'
import {
    QUOTE_STATUSES,
    QUOTE_STATUS_OPTIONS,
    type Quote,
    type QuoteInput,
    type QuoteJob,
    type QuoteLine,
    type QuoteLineInput,
    type QuoteStatus,
} from '../types/quote.types'
import { buildQuoteTableClipboard, copyQuoteTable, isCopyableQuoteLine } from '../utils/quoteTableClipboard'
import SearchableSelect, { type SearchableSelectOption } from '../../shared/searchable-select/SearchableSelect'
import { parseAlternateFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import { MAX_LIFTTRUCKS_INVOICE_LINES, renderLiftrucksInvoicePdf } from '../../shared/pdf/renderLiftrucksInvoicePdf'
import { buildQuotePoRequestInvoiceSnapshot, buildQuoteProvisionalFilename } from '../utils/quotePoRequestInvoice'
import { buildQuotePoRequestEmail } from '../utils/quotePoRequestEmail'
import { buildProtectedQuoteTitle, buildQuoteTitle, extractQuoteTitleAddition, getQuoteJobDefaults } from '../utils/quoteTitle'
import { usePurchaseOrderRecipients } from '../../customers/usePurchaseOrderRecipients'
import { customerEmailCcRecipients } from '../../mechanics/staffDirectory'
import invoiceTemplateUrl from '../../../../api/assets/chargeable-invoice-approval-template.png?url'
import invoiceLogoUrl from '../../../../api/assets/liftrucks-invoice-logo.jpg?url'

type EditableLine = QuoteLineInput & { key: string }

type QuotePdfFileHandle = {
    createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>
        close: () => Promise<void>
    }>
}

type QuotePdfSaveWindow = Window & {
    showSaveFilePicker?: (options: {
        id: string
        suggestedName: string
        startIn: 'downloads'
        excludeAcceptAllOption: boolean
        types: Array<{ description: string, accept: Record<string, string[]> }>
    }) => Promise<QuotePdfFileHandle>
}

type QuoteEditorDialogProps = {
    quote: Quote | null
    existingLines: QuoteLine[]
    jobs: QuoteJob[]
    customers: Customer[]
    equipment: Equipment[]
    pricingItems: PricingItem[]
    staff: Mechanic[]
    initialJobId?: string
    isSaving: boolean
    error: string
    onClose: () => void
    onSave: (input: QuoteInput) => Promise<QuoteLine[]>
    onDelete: () => Promise<void>
    authorName: string
    authorIdentityAvailable: boolean
}

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

function localDate(date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function defaultValidUntil() {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return localDate(date)
}

function roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function newLine(sortOrder: number): EditableLine {
    return {
        key: crypto.randomUUID(),
        pricingItemId: null,
        category: PRICING_CATEGORIES.OTHER,
        description: '',
        quantity: 1,
        unitLabel: 'each',
        unitPrice: 0,
        taxable: true,
        sortOrder,
    }
}

function existingLine(line: QuoteLine): EditableLine {
    return {
        key: line.gr_quotelineid,
        id: line.gr_quotelineid,
        pricingItemId: line._gr_pricingitem_value,
        category: line.gr_category,
        description: line.gr_description,
        quantity: line.gr_quantity,
        unitLabel: line.gr_unitlabel ?? '',
        unitPrice: line.gr_unitprice,
        taxable: line.gr_taxable,
        sortOrder: line.gr_sortorder,
    }
}

function jobLabel(job: QuoteJob) {
    const customer = job.gr_Site?.gr_Customer?.gr_name
    const fleet = job.gr_Equipment?.gr_fleet
    const alternateFleetNumbers = parseAlternateFleetNumbers(job.gr_Equipment?.gr_alternatefleetnumbers)
    const detail = [customer, fleet, ...alternateFleetNumbers].filter(Boolean).join(' · ')
    return `${job.gr_jobnumber || 'Job without number'}${detail ? ` — ${detail}` : ''}`
}

function jobNumberDescriptionLabel(job: QuoteJob) {
    return [job.gr_jobnumber || 'Job without number', job.gr_description].filter(Boolean).join(' - ')
}

export default function QuoteEditorDialog({
    quote,
    existingLines,
    jobs,
    customers,
    equipment,
    pricingItems,
    staff,
    initialJobId,
    isSaving,
    error,
    onClose,
    onSave,
    onDelete,
    authorName,
    authorIdentityAvailable,
}: QuoteEditorDialogProps) {
    const initialJobIdValue = quote?._gr_job_value ?? initialJobId ?? ''
    const initialJob = jobs.find((job) => job.gr_jobid === initialJobIdValue)
        ?? (quote?.gr_Job?.gr_jobid === initialJobIdValue ? quote.gr_Job : undefined)
    const initialJobDefaults = getQuoteJobDefaults(initialJob)
    const initialEquipmentIdValue = quote?._gr_equipment_value ?? initialJobDefaults.equipmentId
    const initialCustomerIdValue = quote?._gr_customer_value ?? initialJobDefaults.customerId
    const initialEquipment = equipment.find((item) => item.gr_equipmentid === initialEquipmentIdValue)
        ?? (quote?.gr_Equipment?.gr_equipmentid === initialEquipmentIdValue ? quote.gr_Equipment : undefined)
        ?? initialJob?.gr_Equipment
    const initialProtectedTitle = buildProtectedQuoteTitle(initialJob, initialEquipment)
    const [titleAddition, setTitleAddition] = useState(() => extractQuoteTitleAddition(quote?.gr_name ?? '', initialProtectedTitle))
    const [jobId, setJobId] = useState(initialJobIdValue)
    const [customerId, setCustomerId] = useState(initialCustomerIdValue)
    const [equipmentId, setEquipmentId] = useState(initialEquipmentIdValue)
    const [status, setStatus] = useState<QuoteStatus>(quote?.gr_quotestatus ?? QUOTE_STATUSES.DRAFT)
    const [revision, setRevision] = useState(quote?.gr_revision ?? 1)
    const [quoteDate, setQuoteDate] = useState(quote?.gr_quotedate?.slice(0, 10) ?? localDate())
    const [validUntil, setValidUntil] = useState(quote?.gr_validuntil?.slice(0, 10) ?? defaultValidUntil())
    const [notes, setNotes] = useState(quote?.gr_notes ?? '')
    const [gstRate, setGstRate] = useState((quote?.gr_gstrate ?? 0.15) * 100)
    const [lines, setLines] = useState<EditableLine[]>(() => existingLines.length
        ? existingLines.map(existingLine)
        : [newLine(0)])
    const [copyFeedback, setCopyFeedback] = useState<'success' | 'error' | ''>('')
    const [formError, setFormError] = useState('')
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
    const [invoiceFeedback, setInvoiceFeedback] = useState('')
    const { recipients: poRecipients, isLoading: poRecipientsLoading, error: poRecipientsError } = usePurchaseOrderRecipients(quote ? customerId : undefined)

    const selectedJob = jobs.find((job) => job.gr_jobid === jobId)
        ?? (quote?.gr_Job?.gr_jobid === jobId ? quote.gr_Job : undefined)
    const selectedEquipment = equipment.find((item) => item.gr_equipmentid === equipmentId)
        ?? (quote?.gr_Equipment?.gr_equipmentid === equipmentId ? quote.gr_Equipment : undefined)
        ?? selectedJob?.gr_Equipment
    const protectedTitle = buildProtectedQuoteTitle(selectedJob, selectedEquipment)
    const name = buildQuoteTitle(protectedTitle, titleAddition)

    const jobOptions = useMemo<SearchableSelectOption[]>(() => jobs.map((job) => ({
        value: job.gr_jobid,
        label: jobNumberDescriptionLabel(job),
        secondary: [job.gr_Site?.gr_Customer?.gr_name, job.gr_Equipment?.gr_fleet, job.gr_description].filter(Boolean).join(' · '),
        searchText: jobLabel(job),
    })), [jobs])
    const customerOptions = useMemo<SearchableSelectOption[]>(() => customers.map((customer) => ({
        value: customer.gr_customerid,
        label: customer.gr_name,
    })), [customers])
    const equipmentOptions = useMemo<SearchableSelectOption[]>(() => equipment.map((item) => ({
        value: item.gr_equipmentid,
        label: item.gr_fleet || item.gr_serial || 'Equipment without fleet number',
        secondary: [item.gr_make, item.gr_model, item.gr_serial, item.gr_Site?.gr_Customer?.gr_name].filter(Boolean).join(' · '),
        searchText: parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).join(' '),
    })), [equipment])

    const totals = useMemo(() => {
        const extended = lines.map((line) => roundMoney(line.quantity * line.unitPrice))
        const subtotal = roundMoney(extended.reduce((total, value) => total + value, 0))
        const taxableSubtotal = roundMoney(lines.reduce(
            (total, line, index) => total + (line.taxable ? extended[index] : 0),
            0,
        ))
        const gst = roundMoney(taxableSubtotal * (gstRate / 100))
        return { extended, subtotal, gst, total: roundMoney(subtotal + gst) }
    }, [gstRate, lines])

    const updateLine = (key: string, changes: Partial<EditableLine>) => {
        setLines((current) => current.map((line) => line.key === key ? { ...line, ...changes } : line))
    }

    const copyableLines = lines.flatMap((line, index) => isCopyableQuoteLine(line) ? [{
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        extendedPrice: totals.extended[index],
    }] : [])

    const copyTable = async () => {
        if (copyableLines.length === 0) return
        try {
            await copyQuoteTable(buildQuoteTableClipboard(copyableLines, {
                subtotal: totals.subtotal,
                gst: totals.gst,
                total: totals.total,
                gstRatePercent: gstRate,
            }))
            setCopyFeedback('success')
        } catch {
            setCopyFeedback('error')
        }
        window.setTimeout(() => setCopyFeedback(''), 2400)
    }

    const selectPricingItem = (key: string, pricingItemId: string) => {
        const item = pricingItems.find((candidate) => candidate.gr_pricingitemid === pricingItemId)
        if (!item) {
            updateLine(key, { pricingItemId: null })
            return
        }
        updateLine(key, {
            pricingItemId: item.gr_pricingitemid,
            category: item.gr_category,
            description: item.gr_description || item.gr_name,
            unitLabel: item.gr_unitlabel,
            unitPrice: item.gr_unitprice,
            taxable: item.gr_taxable,
        })
    }

    const selectJob = (nextJobId: string) => {
        setJobId(nextJobId)
        const job = jobs.find((candidate) => candidate.gr_jobid === nextJobId)
        if (!job) return
        const defaults = getQuoteJobDefaults(job)
        setCustomerId(defaults.customerId)
        setEquipmentId(defaults.equipmentId)
    }

    const generatePoRequestInvoice = async () => {
        if (!quote) return
        setInvoiceFeedback('')
        setIsGeneratingInvoice(true)
        try {
            const snapshot = buildQuotePoRequestInvoiceSnapshot({
                quote,
                title: name.trim(),
                quoteDate,
                notes,
                jobId,
                customerId,
                equipmentId,
                jobs,
                customers,
                equipment,
                lines,
                extendedPrices: totals.extended,
                subtotal: totals.subtotal,
                gstRatePercent: gstRate,
                gst: totals.gst,
                total: totals.total,
            })
            const filename = buildQuoteProvisionalFilename(snapshot)
            const chooseSaveFile = (window as QuotePdfSaveWindow).showSaveFilePicker
            let saveHandle: QuotePdfFileHandle | undefined
            if (chooseSaveFile) {
                try {
                    saveHandle = await chooseSaveFile.call(window, {
                        id: 'quote-provisional-pdf',
                        suggestedName: filename,
                        startIn: 'downloads',
                        excludeAcceptAllOption: true,
                        types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }],
                    })
                } catch (pickerError) {
                    if (pickerError instanceof DOMException && pickerError.name === 'AbortError') {
                        setInvoiceFeedback('Save cancelled. The provisional quotation was not downloaded.')
                        return
                    }
                    throw pickerError
                }
            }
            const [templateResponse, logoResponse] = await Promise.all([
                fetch(invoiceTemplateUrl),
                fetch(invoiceLogoUrl),
            ])
            if (!templateResponse.ok || !logoResponse.ok) throw new Error('The invoice template assets could not be loaded.')
            const pdf = await renderLiftrucksInvoicePdf(snapshot, {
                template: await templateResponse.arrayBuffer(),
                logo: await logoResponse.arrayBuffer(),
            })
            if (saveHandle) {
                const writable = await saveHandle.createWritable()
                try {
                    await writable.write(pdf)
                } finally {
                    await writable.close()
                }
                setInvoiceFeedback('Provisional quotation saved to the selected location. Notes were copied into Work Required.')
            } else {
                const url = URL.createObjectURL(pdf)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = filename
                document.body.appendChild(anchor)
                anchor.click()
                anchor.remove()
                window.setTimeout(() => URL.revokeObjectURL(url), 1000)
                setInvoiceFeedback('Provisional quotation sent to your browser downloads. Notes were copied into Work Required.')
            }
        } catch (generationError) {
            setInvoiceFeedback(generationError instanceof Error ? generationError.message : 'Unable to generate the provisional quotation.')
        } finally {
            setIsGeneratingInvoice(false)
        }
    }

    const openPoRequestEmail = () => {
        if (!quote) return
        setInvoiceFeedback('')
        const jobCustomerId = selectedJob?.gr_Site?.gr_Customer?.gr_customerid ?? ''
        const siteId = jobCustomerId.toLowerCase() === customerId.toLowerCase()
            ? selectedJob?.gr_Site?.gr_siteid
            : undefined
        const customer = customers.find((item) => item.gr_customerid === customerId)
            ?? quote.gr_Customer
            ?? selectedJob?.gr_Site?.gr_Customer
        const equipmentLabel = [selectedEquipment?.gr_fleet, selectedEquipment?.gr_make, selectedEquipment?.gr_model]
            .filter(Boolean)
            .join(' - ')
        const draft = buildQuotePoRequestEmail({
            recipients: poRecipients,
            customerId,
            siteId,
            jobNumber: selectedJob?.gr_jobnumber,
            quoteNumber: quote.gr_quotenumber,
            customerName: customer?.gr_name,
            equipmentLabel,
            total: totals.total,
            internalCc: customerEmailCcRecipients(staff),
            workSummary: notes || selectedJob?.gr_description,
        })
        window.location.href = draft.mailto
        setInvoiceFeedback(draft.recipientConfigured
            ? `An editable PO request email was opened using the ${draft.recipientSource === 'site' ? 'Site' : 'Customer'} PO contacts. Attach the saved provisional quotation before sending.`
            : 'An editable PO request email was opened with the recipient blank. Attach the saved provisional quotation before sending.')
    }

    const selectEquipment = (nextEquipmentId: string) => {
        setEquipmentId(nextEquipmentId)
        const selectedEquipment = equipment.find((item) => item.gr_equipmentid === nextEquipmentId)
        if (selectedEquipment) setCustomerId(selectedEquipment.gr_Site?.gr_Customer?.gr_customerid ?? '')
    }

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        setFormError('')
        if (!quote && !authorIdentityAvailable) {
            setFormError('The signed-in user identity is unavailable, so the Quote Author cannot be recorded safely.')
            return
        }
        if (!name.trim()) {
            setFormError('Enter a quote title before saving the quote.')
            return
        }
        if (!jobId && !customerId && !equipmentId) {
            setFormError('Select an equipment item, job or customer before creating the quote.')
            return
        }
        if (lines.length === 0 || lines.some((line) => !line.description.trim())) {
            setFormError('Add at least one complete quote line before saving the quote.')
            return
        }
        try {
            const savedLines = await onSave({
                name: name.trim(),
                jobId,
                customerId,
                equipmentId,
                status,
                revision,
                quoteDate,
                validUntil,
                notes,
                gstRate: gstRate / 100,
                subtotal: totals.subtotal,
                gst: totals.gst,
                total: totals.total,
                lines: lines.map((line, index) => ({
                    id: line.id,
                    pricingItemId: line.pricingItemId,
                    category: line.category,
                    description: line.description,
                    quantity: line.quantity,
                    unitLabel: line.unitLabel,
                    unitPrice: line.unitPrice,
                    taxable: line.taxable,
                    sortOrder: index,
                })),
            })
            setLines(savedLines.map(existingLine))
        } catch {
            // The Quotes hook exposes the Dataverse error inside the open editor.
        }
    }

    return (
        <div className="quote-dialog-backdrop" role="presentation">
            <section className="quote-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-dialog-title">
                <header>
                    <div>
                        <span>{quote?.gr_quotenumber || 'New quote'}</span>
                        <h2 id="quote-dialog-title">{quote ? 'Edit quote' : 'Create quote'}</h2>
                    </div>
                    <button type="button" aria-label="Close quote editor" onClick={onClose}>×</button>
                </header>

                <form onSubmit={(event) => void submit(event)}>
                    <div className="quote-form-grid">
                        <label className="quote-field">
                            <span>Author</span>
                            <input readOnly value={quote?.createdby?.fullname || authorName} />
                        </label>
                        <label className="quote-field quote-field-wide">
                            <span>Quote title *</span>
                            <div className="quote-title-composer">
                                {protectedTitle && <><strong>{protectedTitle}</strong><span aria-hidden="true"> - </span></>}
                                <input
                                    aria-label="Additional quote title text"
                                    required={!protectedTitle}
                                    value={titleAddition}
                                    placeholder={protectedTitle ? 'Add optional detail' : 'Enter quote title'}
                                    onChange={(event) => setTitleAddition(event.target.value)}
                                />
                            </div>
                            {protectedTitle && <small className="quote-title-hint">Job, Equipment and Job description stay in the title. Add any extra wording at the end.</small>}
                        </label>
                        <div className="quote-field-wide">
                            <SearchableSelect
                                id="quote-job"
                                label="Job"
                                value={jobId}
                                options={jobOptions}
                                onChange={selectJob}
                                placeholder="Select a job"
                                searchPlaceholder="Search job number, customer, fleet or description"
                                emptyLabel="No matching jobs"
                                error={formError && !jobId && !customerId && !equipmentId ? formError : ''}
                            />
                        </div>
                        <div className="quote-field-wide">
                            <SearchableSelect
                                id="quote-customer"
                                label="Customer"
                                value={customerId}
                                options={customerOptions}
                                onChange={setCustomerId}
                                placeholder="Select a customer"
                                searchPlaceholder="Search customers"
                                emptyLabel="No matching customers"
                                error={formError && !jobId && !customerId && !equipmentId ? formError : ''}
                            />
                        </div>
                        <div className="quote-field-wide">
                            <SearchableSelect
                                id="quote-equipment"
                                label="Equipment"
                                value={equipmentId}
                                options={equipmentOptions}
                                onChange={selectEquipment}
                                placeholder="Select equipment"
                                searchPlaceholder="Search fleet, serial, make or customer"
                                emptyLabel="No matching equipment"
                                error={formError && !jobId && !customerId && !equipmentId ? formError : ''}
                            />
                        </div>
                        <label className="quote-field">
                            <span>Status *</span>
                            <select value={status} onChange={(event) => setStatus(Number(event.target.value) as QuoteStatus)}>
                                {QUOTE_STATUS_OPTIONS.map(({ value, label }) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="quote-field">
                            <span>Revision *</span>
                            <input required min="1" step="1" type="number" value={revision} onChange={(event) => setRevision(Number(event.target.value))} />
                        </label>
                        <label className="quote-field">
                            <span>Quote date *</span>
                            <input required type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} />
                        </label>
                        <label className="quote-field">
                            <span>Valid until</span>
                            <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                        </label>
                    </div>

                    <div className="quote-lines-heading">
                        <div>
                            <h3>Quote lines</h3>
                            <p>Catalogue prices are copied here and can be changed for this quote.</p>
                        </div>
                        <button type="button" onClick={() => setLines((current) => [...current, newLine(current.length)])}>+ Add line</button>
                    </div>

                    <div className="quote-lines-scroll">
                    <div className="quote-lines">
                        <div className="quote-line-header" aria-hidden="true">
                            <span>#</span>
                            <span>Catalogue item</span>
                            <span>Description</span>
                            <span>Category</span>
                            <span>Qty</span>
                            <span>Unit</span>
                            <span>Unit price</span>
                            <span>Extended</span>
                            <span>GST</span>
                            <span />
                        </div>
                        {lines.map((line, index) => (
                            <div className="quote-line" key={line.key}>
                                <div className="quote-line-number">{index + 1}</div>
                                    <label className="quote-line-catalogue">
                                        <span className="sr-only">Catalogue item</span>
                                        <select value={line.pricingItemId ?? ''} onChange={(event) => selectPricingItem(line.key, event.target.value)}>
                                            <option value="">Custom line</option>
                                            {pricingItems.map((item) => (
                                                <option key={item.gr_pricingitemid} value={item.gr_pricingitemid}>
                                                    {item.gr_name} — {money.format(item.gr_unitprice)}/{item.gr_unitlabel}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="quote-line-description">
                                        <span className="sr-only">Description</span>
                                        <input required value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} />
                                    </label>
                                    <label className="quote-line-category">
                                        <span className="sr-only">Category</span>
                                        <select value={line.category} onChange={(event) => updateLine(line.key, { category: Number(event.target.value) as PricingCategory })}>
                                            {Object.entries(PRICING_CATEGORY_LABELS).map(([value, label]) => (
                                                <option key={value} value={value}>{label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="quote-line-quantity">
                                        <span className="sr-only">Quantity</span>
                                        <input required min="0.01" step="0.01" type="number" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) })} />
                                    </label>
                                    <label className="quote-line-unit">
                                        <span className="sr-only">Unit</span>
                                        <input value={line.unitLabel} onChange={(event) => updateLine(line.key, { unitLabel: event.target.value })} />
                                    </label>
                                    <label className="quote-line-price">
                                        <span className="sr-only">Unit price</span>
                                        <input required min="0" step="0.01" type="number" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: Number(event.target.value) })} />
                                    </label>
                                    <div className="quote-line-extended">
                                        <strong>{money.format(totals.extended[index])}</strong>
                                    </div>
                                    <label className="quote-line-taxable">
                                        <span className="sr-only">Charge GST</span>
                                        <input type="checkbox" checked={line.taxable} onChange={(event) => updateLine(line.key, { taxable: event.target.checked })} />
                                    </label>
                                <button
                                    className="quote-line-remove"
                                    type="button"
                                    aria-label={`Remove line ${index + 1}`}
                                    disabled={lines.length === 1}
                                    onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
                                >×</button>
                            </div>
                        ))}
                    </div>
                    </div>

                    <div className="quote-bottom-grid">
                        <label className="quote-field">
                            <span>Notes</span>
                            <textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Customer-facing or internal quote notes" />
                        </label>
                        <div className="quote-totals">
                            <div><span>Subtotal</span><strong>{money.format(totals.subtotal)}</strong></div>
                            <div>
                                <label>GST <input min="0" step="0.01" type="number" value={gstRate} onChange={(event) => setGstRate(Number(event.target.value))} />%</label>
                                <strong>{money.format(totals.gst)}</strong>
                            </div>
                            <div className="quote-total"><span>Total</span><strong>{money.format(totals.total)}</strong></div>
                        </div>
                    </div>

                    {(formError || error) && <p className="quote-form-error" role="alert">{formError || error}</p>}
                    {quote && <div className="quote-po-request-action">
                        <div>
                            <strong>Provisional quotation</strong>
                            <span>Uses the Liftrucks invoice layout, the Job number for Invoice No and Our Ref, and copies Notes into Work Required. This is not a tax invoice.</span>
                        </div>
                        <div className="quote-po-request-buttons">
                            <button
                                type="button"
                                className="quote-secondary-button"
                                disabled={isSaving || isGeneratingInvoice || lines.length === 0 || lines.length > MAX_LIFTTRUCKS_INVOICE_LINES}
                                title={lines.length > MAX_LIFTTRUCKS_INVOICE_LINES
                                    ? `The invoice template supports up to ${MAX_LIFTTRUCKS_INVOICE_LINES} lines.`
                                    : 'Generate and save a provisional quotation PDF'}
                                onClick={() => void generatePoRequestInvoice()}
                            >{isGeneratingInvoice ? 'Generating...' : 'Generate and save PDF'}</button>
                            <button
                                type="button"
                                className="quote-secondary-button"
                                disabled={isSaving || poRecipientsLoading || Boolean(poRecipientsError)}
                                title={poRecipientsError || 'Open an editable purchase-order request email'}
                                onClick={openPoRequestEmail}
                            >{poRecipientsLoading ? 'Loading contacts...' : 'Open PO request email'}</button>
                        </div>
                    </div>}
                    {quote && poRecipientsError && <p className="quote-form-error" role="alert">{poRecipientsError}</p>}
                    {invoiceFeedback && <p className="quote-po-request-feedback" role="status">{invoiceFeedback}</p>}

                    <footer>
                        <div className="quote-copy-action">
                            <button type="button" className="quote-secondary-button" title="Copy Quote line items and totals as a formatted table" disabled={copyableLines.length === 0} onClick={() => void copyTable()}>Copy Table</button>
                            {copyFeedback && <span className={copyFeedback === 'error' ? 'quote-copy-feedback error' : 'quote-copy-feedback'} role="status">{copyFeedback === 'success' ? 'Quote table copied.' : 'Unable to copy Quote table. Please try again.'}</span>}
                        </div>
                        {quote && <button type="button" className="quote-delete-button" disabled={isSaving} onClick={() => setConfirmDelete(true)}>Delete quote</button>}
                        <button type="button" className="quote-secondary-button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="quote-primary-button" disabled={isSaving || lines.length === 0}>
                            {isSaving ? 'Saving…' : quote ? 'Save quote' : 'Create quote'}
                        </button>
                    </footer>
                </form>
            </section>
            {confirmDelete && quote && <EditDrawerConfirmation
                eyebrow="Delete quote"
                title={`Delete ${quote.gr_quotenumber || quote.gr_name || 'this quote'}?`}
                message="This permanently deletes the quote and all of its quote lines. This cannot be undone."
                error={error}
                isBusy={isSaving}
                confirmLabel={isSaving ? 'Deleting…' : 'Delete quote'}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => void onDelete()}
            />}
        </div>
    )
}
