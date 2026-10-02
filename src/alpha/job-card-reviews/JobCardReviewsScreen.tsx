import { useParams } from 'react-router-dom'
import { useJobCardReviews } from './useJobCardReviews'
import './JobCardReviewsScreen.css'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import JobCardReviewDetail from './JobCardReviewDetail'
import JobCardReviewQueue from './JobCardReviewQueue'

export default function JobCardReviewsScreen() {
    const { reviewId } = useParams()
    const account = useActiveMsalAccount()
    return <ReviewContent key={`${account?.homeAccountId || ''}:${reviewId || ''}`} reviewId={reviewId} />
}

function ReviewContent({ reviewId }: { reviewId?: string }) {
    const state = useJobCardReviews(reviewId)
    const { items, truncated, review, error, busy, refresh } = state

    if (!reviewId) return <JobCardReviewQueue items={items} truncated={truncated} busy={busy} error={error} refresh={refresh} />
    if (busy && !review && items.length === 0) return <main className="job-card-reviews"><h1>Job Card reviews</h1><p>Loading…</p></main>
    if (!review) return <main className="job-card-reviews"><h1>Job Card review</h1><p role="alert">{error || 'Review unavailable.'}</p><button type="button" onClick={refresh}>Retry</button></main>
    return <JobCardReviewDetail review={review} state={state} />
}
