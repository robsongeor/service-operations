import { PRICING_CATEGORY_LABELS } from '../types/pricing.types'
import { QUOTE_STATUS_LABELS, type Quote, type QuoteLine } from '../types/quote.types'
import '../QuotesScreen.css'

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const date = new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric' })

function formatDate(value: string | null) {
    if (!value) return '—'
    return date.format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function valueOrDash(value: string | number | null | undefined) {
    return value === null || value === undefined || value === '' ? '—' : String(value)
}

export default function QuoteReadOnlyDialog({
    quote,
    lines,
    onClose,
}: {
    quote: Quote
    lines: QuoteLine[]
    onClose: () => void
}) {
    const customer = quote.gr_Customer?.gr_name
        || quote.gr_Job?.gr_Site?.gr_Customer?.gr_name
        || quote.gr_Equipment?.gr_Site?.gr_Customer?.gr_name
        || '—'
    const equipment = quote.gr_Equipment || quote.gr_Job?.gr_Equipment
    const equipmentLabel = equipment
        ? [equipment.gr_fleet, [equipment.gr_make, equipment.gr_model].filter(Boolean).join(' '), equipment.gr_serial]
            .filter(Boolean).join(' · ')
        : '—'

    return <div className="quote-dialog-backdrop" role="presentation">
        <section className="quote-dialog quote-read-only-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-read-only-title">
            <header>
                <div>
                    <span>{quote.gr_quotenumber || 'Quote'}</span>
                    <h2 id="quote-read-only-title">Quote details</h2>
                </div>
                <button type="button" aria-label="Close quote details" onClick={onClose}>×</button>
            </header>

            <div className="quote-read-only-content">
                <div className="quote-read-only-banner" role="status">Read only — quote information cannot be changed.</div>

                <dl className="quote-read-only-grid">
                    <div><dt>Author</dt><dd>{valueOrDash(quote.createdby?.fullname)}</dd></div>
                    <div className="quote-read-only-title"><dt>Quote title</dt><dd>{valueOrDash(quote.gr_name)}</dd></div>
                    <div><dt>Job</dt><dd>{valueOrDash(quote.gr_Job?.gr_jobnumber)}{quote.gr_Job?.gr_description ? <small>{quote.gr_Job.gr_description}</small> : null}</dd></div>
                    <div><dt>Customer</dt><dd>{customer}</dd></div>
                    <div><dt>Equipment</dt><dd>{equipmentLabel}</dd></div>
                    <div><dt>Status</dt><dd><span className={`quote-status status-${quote.gr_quotestatus}`}>{QUOTE_STATUS_LABELS[quote.gr_quotestatus] ?? 'Unknown'}</span></dd></div>
                    <div><dt>Revision</dt><dd>{quote.gr_revision}</dd></div>
                    <div><dt>Quote date</dt><dd>{formatDate(quote.gr_quotedate)}</dd></div>
                    <div><dt>Valid until</dt><dd>{formatDate(quote.gr_validuntil)}</dd></div>
                </dl>

                <div className="quote-lines-heading">
                    <div><h3>Quote lines</h3><p>Recorded pricing and quantities for this quote.</p></div>
                </div>
                <div className="quote-read-only-lines">
                    <table>
                        <thead><tr><th>#</th><th>Description</th><th>Category</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Extended</th><th>GST</th></tr></thead>
                        <tbody>{lines.map((line, index) => <tr key={line.gr_quotelineid}>
                            <td>{index + 1}</td>
                            <td>{valueOrDash(line.gr_description)}</td>
                            <td>{PRICING_CATEGORY_LABELS[line.gr_category] ?? 'Other'}</td>
                            <td>{line.gr_quantity}</td>
                            <td>{valueOrDash(line.gr_unitlabel)}</td>
                            <td>{money.format(line.gr_unitprice)}</td>
                            <td>{money.format(line.gr_extendedprice)}</td>
                            <td>{line.gr_taxable ? 'Yes' : 'No'}</td>
                        </tr>)}</tbody>
                    </table>
                    {!lines.length && <p>No quote lines recorded.</p>}
                </div>

                <div className="quote-bottom-grid">
                    <div className="quote-read-only-notes"><span>Notes</span><p>{quote.gr_notes || 'No notes recorded.'}</p></div>
                    <div className="quote-totals">
                        <div><span>Subtotal</span><strong>{money.format(quote.gr_subtotal)}</strong></div>
                        <div><span>GST {quote.gr_gstrate * 100}%</span><strong>{money.format(quote.gr_gst)}</strong></div>
                        <div className="quote-total"><span>Total</span><strong>{money.format(quote.gr_total)}</strong></div>
                    </div>
                </div>

                <footer><button type="button" className="quote-secondary-button" onClick={onClose}>Close</button></footer>
            </div>
        </section>
    </div>
}
