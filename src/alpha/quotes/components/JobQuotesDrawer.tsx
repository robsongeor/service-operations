import { useState } from 'react'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import { useJobQuotes } from '../hooks/useJobQuotes'
import { QUOTE_STATUS_LABELS } from '../types/quote.types'
import './JobQuotesDrawer.css'

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const date = (value?: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Not recorded'

export default function JobQuotesDrawer({ jobId, jobNumber, onClose }: { jobId: string; jobNumber: string; onClose: () => void }) {
    const { result, lineResults, loadLines, retry } = useJobQuotes(jobId)
    const [expanded, setExpanded] = useState('')
    return <EditDrawerShell eyebrow={`Job ${jobNumber} · read-only`} title="Associated quotes" className="job-quotes-drawer" onClose={onClose} footer={<><span>Current quotes linked to this Job. No changes are made here.</span><button type="button" onClick={onClose}>Close</button></>}>
        {!result && <p role="status">Loading associated quotes…</p>}
        {result?.error && <p role="alert">{result.error} <button type="button" onClick={retry}>Retry</button></p>}
        {result?.items?.length === 0 && <p>No quotes are linked to this Job.</p>}
        {result?.items?.map((quote) => {
            const open = expanded === quote.gr_quoteid
            const lines = lineResults[quote.gr_quoteid]
            return <article className="job-quote-card" key={quote.gr_quoteid}>
                <button className="job-quote-heading" type="button" aria-expanded={open} onClick={() => { setExpanded(open ? '' : quote.gr_quoteid); if (!open) void loadLines(quote.gr_quoteid) }}>
                    <span><strong>{quote.gr_quotenumber || 'Unnumbered quote'}</strong><small>{quote.gr_name}</small></span>
                    <span>{QUOTE_STATUS_LABELS[quote.gr_quotestatus] || 'Unknown'} · Rev {quote.gr_revision}<strong>{money.format(quote.gr_total)}</strong></span>
                </button>
                {open && <div className="job-quote-detail">
                    <dl><div><dt>Quote date</dt><dd>{date(quote.gr_quotedate)}</dd></div><div><dt>Valid until</dt><dd>{date(quote.gr_validuntil)}</dd></div><div><dt>Author</dt><dd>{quote.createdby?.fullname || 'Not recorded'}</dd></div></dl>
                    <h3>Notes / work required</h3><p className="job-quote-notes">{quote.gr_notes || 'No notes recorded.'}</p>
                    {lines?.error ? <p role="alert">{lines.error} <button type="button" onClick={() => void loadLines(quote.gr_quoteid)}>Retry lines</button></p> : !lines?.data ? <p role="status">Loading quote lines…</p> : !lines.data.length ? <p>No lines recorded.</p> : <div className="job-quote-table"><table><caption>Quote lines</caption><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>{lines.data.map((line) => <tr key={line.gr_quotelineid}><td>{line.gr_description}</td><td>{line.gr_quantity} {line.gr_unitlabel}</td><td>{money.format(line.gr_unitprice)}</td><td>{money.format(line.gr_extendedprice)}</td></tr>)}</tbody></table></div>}
                    <dl className="job-quote-totals"><div><dt>Subtotal</dt><dd>{money.format(quote.gr_subtotal)}</dd></div><div><dt>GST</dt><dd>{money.format(quote.gr_gst)}</dd></div><div><dt>Total</dt><dd><strong>{money.format(quote.gr_total)}</strong></dd></div></dl>
                </div>}
            </article>
        })}
    </EditDrawerShell>
}
