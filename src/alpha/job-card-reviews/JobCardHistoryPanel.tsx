import { Link } from 'react-router-dom'
import type { JobCardHistory } from './jobCardReview.types'
import './JobCardHistoryPanel.css'

const labels = { active: 'Link created', expired: 'Link expired', superseded: 'Link replaced', pendingReview: 'Submitted · pending review', reviewed: 'Reviewed' }
const dates = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

type Props = { data?: JobCardHistory; error?: string; busy: boolean; refresh: () => void }

export default function JobCardHistoryPanel({ data, error, busy, refresh }: Props) {
    return <section className="job-card-azure-history" aria-label="Azure Job Card history">
        <header><h4>Azure links &amp; submissions</h4><button type="button" onClick={refresh} disabled={busy}>Refresh</button></header>
        <p>Review new evidence here. A created link does not confirm email delivery. Reviewing does not complete the operational Job.</p>
        {busy && <p role="status">Loading Job Card history…</p>}
        {error && <p className="job-card-error" role="alert">{error} History is unavailable; this does not mean no cards exist.</p>}
        {data?.truncated && <p role="status">Showing a limited history. Some requests may not be shown.</p>}
        {data && data.items.length === 0 && <p>No Azure Job Cards have been created for this Job.</p>}
        {data && data.items.length > 0 && <ul>{data.items.map((item) => <li key={item.reviewId}>
            <div><strong>{item.technicianName}</strong><span>{labels[item.status]}</span><small>Created {dates.format(new Date(item.createdOn))}</small>
                {item.submittedOn && <small>Submitted {dates.format(new Date(item.submittedOn))} · {item.photoCount} photo{item.photoCount === 1 ? '' : 's'}</small>}
                {item.status === 'active' && <small>Expires {dates.format(new Date(item.expiresOn))}</small>}
            </div>
            {(item.status === 'pendingReview' || item.status === 'reviewed') && <Link to={`/job-card-reviews/${item.reviewId}`}>View submission</Link>}
        </li>)}</ul>}
    </section>
}
