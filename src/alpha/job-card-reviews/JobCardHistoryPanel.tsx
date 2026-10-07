import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { JobCardHistory } from './jobCardReview.types'
import './JobCardHistoryPanel.css'

const labels = { active: 'Link created', expired: 'Link expired', superseded: 'Link replaced', withdrawn: 'Link withdrawn', pendingReview: 'Submitted · pending review', reviewed: 'Reviewed' }
const dates = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

type Props = {
    data?: JobCardHistory
    error?: string
    busy: boolean
    refresh: () => void
    withdraw: (reviewId: string, etag: string, reason: string) => Promise<void>
    withdrawingId: string
}

export default function JobCardHistoryPanel({ data, error, busy, refresh, withdraw, withdrawingId }: Props) {
    const [withdrawId, setWithdrawId] = useState('')
    const [reason, setReason] = useState('')
    const [withdrawError, setWithdrawError] = useState('')
    const confirmWithdraw = async (reviewId: string, etag: string) => {
        if (!reason.trim()) return setWithdrawError('Enter why this technician is no longer attending.')
        setWithdrawError('')
        try { await withdraw(reviewId, etag, reason.trim()); setWithdrawId(''); setReason('') }
        catch (caught) { setWithdrawError(caught instanceof Error ? caught.message : 'The Job Card link could not be withdrawn.') }
    }
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
                {item.status === 'withdrawn' && <small>Withdrawn {item.withdrawnOn ? dates.format(new Date(item.withdrawnOn)) : ''}{item.withdrawnByDisplayName ? ` by ${item.withdrawnByDisplayName}` : ''}{item.withdrawnReason ? ` · ${item.withdrawnReason}` : ''}</small>}
            </div>
            <div className="job-card-history-actions">
                {(item.status === 'pendingReview' || item.status === 'reviewed') && <Link to={`/job-card-reviews/${item.reviewId}`}>View submission</Link>}
                {item.status === 'active' && <button type="button" onClick={() => { setWithdrawId(item.reviewId); setReason(''); setWithdrawError('') }}>Withdraw technician</button>}
            </div>
            {withdrawId === item.reviewId && <form className="job-card-withdraw" onSubmit={(event) => { event.preventDefault(); void confirmWithdraw(item.reviewId, item.etag) }}>
                <label><span>Reason for withdrawal</span><textarea value={reason} maxLength={500} autoFocus onChange={(event) => setReason(event.target.value)} placeholder="For example, technician unavailable" /></label>
                {withdrawError && <p role="alert">{withdrawError}</p>}
                <div><button type="button" disabled={withdrawingId === item.reviewId} onClick={() => setWithdrawId('')}>Cancel</button><button type="submit" disabled={withdrawingId === item.reviewId}>{withdrawingId === item.reviewId ? 'Withdrawing…' : 'Withdraw link'}</button></div>
            </form>}
        </li>)}</ul>}
    </section>
}
