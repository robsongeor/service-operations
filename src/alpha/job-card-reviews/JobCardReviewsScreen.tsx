import { Link, useParams } from 'react-router-dom'
import PageHeader from '../shared/page-header/PageHeader'
import { useJobCardReviews } from './useJobCardReviews'
import './JobCardReviewsScreen.css'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import JobCardReviewDetail from './JobCardReviewDetail'

const dateTime = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

export default function JobCardReviewsScreen() {
    const { reviewId } = useParams()
    const account = useActiveMsalAccount()
    return <ReviewContent key={`${account?.homeAccountId || ''}:${reviewId || ''}`} reviewId={reviewId} />
}

function ReviewContent({ reviewId }: { reviewId?: string }) {
    const state = useJobCardReviews(reviewId)
    const { items, review, error, busy, refresh } = state

    if (busy && !review && items.length === 0) return <main className="job-card-reviews"><h1>Job Card reviews</h1><p>Loading…</p></main>
    if (!reviewId) return <main className="job-card-reviews">
        <PageHeader title="Pending Job Card reviews" subtitle="Azure evidence · reviewing does not update the operational Job" actions={<button type="button" disabled={busy} onClick={refresh}>Refresh</button>} />
        {error && <p className="review-error" role="alert">{error}</p>}
        {items.length === 0 ? <p className="review-empty">No technician submissions are waiting for review.</p> : <div className="review-list">
            {items.map((item) => <Link key={item.reviewId} to={`/job-card-reviews/${item.reviewId}`}>
                <div><strong>Job {item.jobNumber}</strong><span>{item.customerName || item.siteName || 'Customer not recorded'}</span></div>
                <div><span>{item.technicianName || 'Technician not recorded'}</span><time>{dateTime.format(new Date(item.submittedOn))}</time></div>
                <div className="review-flags">{item.safetyIssueIdentified && <b>Safety issue</b>}{item.furtherWorkRequired && <b>Further work</b>}<span>{item.photoCount} photo{item.photoCount === 1 ? '' : 's'}</span></div>
            </Link>)}
        </div>}
    </main>
    if (!review) return <main className="job-card-reviews"><h1>Job Card review</h1><p role="alert">{error || 'Review unavailable.'}</p><button type="button" onClick={refresh}>Retry</button></main>
    return <JobCardReviewDetail review={review} state={state} />
}
