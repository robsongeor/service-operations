import { useMemo, useState, type FormEvent } from 'react'
import {
    PRICING_CATEGORIES,
    PRICING_CATEGORY_LABELS,
    type PricingCategory,
    type PricingItem,
} from '../types/pricing.types'
import {
    QUOTE_STATUSES,
    QUOTE_STATUS_LABELS,
    type Quote,
    type QuoteInput,
    type QuoteJob,
    type QuoteLine,
    type QuoteLineInput,
    type QuoteStatus,
} from '../types/quote.types'
import { buildQuoteTableClipboard, copyQuoteTable, isCopyableQuoteLine } from '../utils/quoteTableClipboard'

type EditableLine = QuoteLineInput & { key: string }

type QuoteEditorDialogProps = {
    quote: Quote | null
    existingLines: QuoteLine[]
    jobs: QuoteJob[]
    pricingItems: PricingItem[]
    initialJobId?: string
    isSaving: boolean
    error: string
    onClose: () => void
    onSave: (input: QuoteInput) => Promise<void>
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
    const detail = [customer, fleet].filter(Boolean).join(' · ')
    return `${job.gr_jobnumber || 'Job without number'}${detail ? ` — ${detail}` : ''}`
}

export default function QuoteEditorDialog({
    quote,
    existingLines,
    jobs,
    pricingItems,
    initialJobId,
    isSaving,
    error,
    onClose,
    onSave,
}: QuoteEditorDialogProps) {
    const initialJob = jobs.find((job) => job.gr_jobid === initialJobId)
    const [name, setName] = useState(
        quote?.gr_name ?? (initialJob ? `Quote for ${jobLabel(initialJob)}` : ''),
    )
    const [jobId, setJobId] = useState(quote?._gr_job_value ?? initialJobId ?? '')
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
        if (name.trim()) return
        const job = jobs.find((candidate) => candidate.gr_jobid === nextJobId)
        if (job) setName(`Quote for ${jobLabel(job)}`)
    }

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (lines.length === 0) return
        await onSave({
            name,
            jobId,
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
                        <label className="quote-field quote-field-wide">
                            <span>Quote title *</span>
                            <input required value={name} onChange={(event) => setName(event.target.value)} />
                        </label>
                        <label className="quote-field quote-field-wide">
                            <span>Job *</span>
                            <select required value={jobId} onChange={(event) => selectJob(event.target.value)}>
                                <option value="">Select a job</option>
                                {jobs.map((job) => <option key={job.gr_jobid} value={job.gr_jobid}>{jobLabel(job)}</option>)}
                            </select>
                        </label>
                        <label className="quote-field">
                            <span>Status *</span>
                            <select value={status} onChange={(event) => setStatus(Number(event.target.value) as QuoteStatus)}>
                                {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
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

                    {error && <p className="quote-form-error" role="alert">{error}</p>}

                    <footer>
                        <div className="quote-copy-action">
                            <button type="button" className="quote-secondary-button" title="Copy Quote line items and totals as a formatted table" disabled={copyableLines.length === 0} onClick={() => void copyTable()}>Copy Table</button>
                            {copyFeedback && <span className={copyFeedback === 'error' ? 'quote-copy-feedback error' : 'quote-copy-feedback'} role="status">{copyFeedback === 'success' ? 'Quote table copied.' : 'Unable to copy Quote table. Please try again.'}</span>}
                        </div>
                        <button type="button" className="quote-secondary-button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="quote-primary-button" disabled={isSaving || lines.length === 0}>
                            {isSaving ? 'Saving…' : quote ? 'Save quote' : 'Create quote'}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    )
}
