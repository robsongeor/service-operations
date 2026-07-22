import { useMemo, useState } from 'react'
import type { Site } from '../jobs/types/site.types'
import { QUOTE_STATUS_LABELS, type Quote, type QuoteStatus } from '../quotes/types/quote.types'

type Props = {
    quotes: Quote[]
    sites: Site[]
    isLoading: boolean
    error: string
    onOpenQuote: (quote: Quote) => void
}

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const date = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' })

export default function CustomerQuotesTab({ quotes, sites, isLoading, error, onOpenQuote }: Props) {
    const [statusFilter, setStatusFilter] = useState('all')
    const [siteFilter, setSiteFilter] = useState('all')
    const [sort, setSort] = useState<'created' | 'quote' | 'total'>('created')

    const visibleQuotes = useMemo(() => quotes
        .filter((quote) => statusFilter === 'all' || quote.gr_quotestatus === Number(statusFilter))
        .filter((quote) => siteFilter === 'all'
            || (siteFilter === '__none__' ? !quote.gr_Job?.gr_Site : quote.gr_Job?.gr_Site?.gr_siteid === siteFilter))
        .sort((first, second) => {
            if (sort === 'total') return second.gr_total - first.gr_total
            if (sort === 'quote') return (first.gr_quotenumber || first.gr_name).localeCompare(second.gr_quotenumber || second.gr_name, undefined, { numeric: true })
            return second.createdon.localeCompare(first.createdon)
        }), [quotes, siteFilter, sort, statusFilter])

    if (isLoading) return <section className="customer-workspace-state">Loading Quotes...</section>
    if (error) return <section className="customer-workspace-state error" role="alert">Quotes could not be loaded. {error}</section>

    return <section className="customer-quotes-panel" role="tabpanel">
        <header><div><span>Customer estimates</span><h3>Quotes</h3></div><strong>{quotes.length} {quotes.length === 1 ? 'Quote' : 'Quotes'}</strong></header>
        <div className="customer-quotes-toolbar">
            <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Site<select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}><option value="all">All Sites</option><option value="__none__">Customer-wide / No Site</option>{sites.map((site) => <option key={site.gr_siteid} value={site.gr_siteid}>{site.gr_name}</option>)}</select></label>
            <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="created">Newest</option><option value="quote">Quote Number</option><option value="total">Highest Total</option></select></label>
        </div>
        {visibleQuotes.length === 0 ? <div className="customer-quotes-empty">{quotes.length === 0 ? 'No Quotes for this Customer.' : 'No Quotes match the selected filters.'}</div> : <div className="customer-quotes-table-wrap">
            <table className="customer-quotes-table">
                <thead><tr><th>Quote</th><th>Status</th><th>Job</th><th>Site / Equipment</th><th>Summary</th><th>Created</th><th>Total</th></tr></thead>
                <tbody>{visibleQuotes.map((quote) => <tr key={quote.gr_quoteid} tabIndex={0} onClick={() => onOpenQuote(quote)} onKeyDown={(event) => { if (event.key === 'Enter') onOpenQuote(quote) }}>
                    <td><strong>{quote.gr_quotenumber || 'Pending number'}</strong><small>Rev {quote.gr_revision}</small></td>
                    <td><span className={`quote-status status-${quote.gr_quotestatus}`}>{QUOTE_STATUS_LABELS[quote.gr_quotestatus as QuoteStatus] ?? 'Unknown'}</span></td>
                    <td>{quote.gr_Job?.gr_jobnumber || 'No linked Job'}</td>
                    <td><strong>{quote.gr_Job?.gr_Site?.gr_name || 'Customer-wide / No Site'}</strong><small>{quote.gr_Job?.gr_Equipment?.gr_fleet || 'No Equipment'}</small></td>
                    <td><strong>{quote.gr_name}</strong><small>{quote.gr_Job?.gr_description || quote.gr_notes || 'No summary'}</small></td>
                    <td>{date.format(new Date(quote.createdon))}</td>
                    <td className="money"><strong>{money.format(quote.gr_total)}</strong></td>
                </tr>)}</tbody>
            </table>
        </div>}
    </section>
}
