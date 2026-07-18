import { QUOTE_STATUS_LABELS, type Quote } from '../../quotes/types/quote.types'

type Props = {
    quotes: Quote[]
    onCreateQuote: () => void
    onOpenQuote: (quoteId: string) => void
}

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const quoteDate = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

export default function JobQuotesSection({ quotes, onCreateQuote, onOpenQuote }: Props) {
    return (
        <section className="job-quotes-section job-edit-divider">
            <div className="job-quotes-heading">
                <div>
                    <h3>Quotes</h3>
                    <p>Estimates and revisions linked to this job.</p>
                </div>
                <button type="button" onClick={onCreateQuote}>+ Create quote</button>
            </div>

            {quotes.length === 0 ? (
                <div className="job-quotes-empty">
                    <strong>No quotes for this job</strong>
                    <span>Create one only when the work needs customer approval.</span>
                </div>
            ) : (
                <div className="job-quotes-list">
                    {quotes.map((quote) => (
                        <button
                            type="button"
                            className="job-quote-row"
                            key={quote.gr_quoteid}
                            onClick={() => onOpenQuote(quote.gr_quoteid)}
                        >
                            <span className="job-quote-main">
                                <strong>{quote.gr_quotenumber || 'Pending number'}</strong>
                                <small>
                                    {quote.gr_quotedate
                                        ? quoteDate.format(new Date(`${quote.gr_quotedate.slice(0, 10)}T00:00:00`))
                                        : 'No date'}
                                </small>
                            </span>
                            <span className={`job-quote-status status-${quote.gr_quotestatus}`}>
                                {QUOTE_STATUS_LABELS[quote.gr_quotestatus] ?? 'Unknown'}
                            </span>
                            <span className="job-quote-revision">Rev {quote.gr_revision}</span>
                            <strong className="job-quote-total">{money.format(quote.gr_total)}</strong>
                            <span className="job-quote-arrow" aria-hidden="true">›</span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    )
}
