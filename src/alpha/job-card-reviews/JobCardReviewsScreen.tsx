import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useJobCardReviews } from './useJobCardReviews'
import './JobCardReviewsScreen.css'
import JobCardReviewDetail from './JobCardReviewDetail'
import JobCardReviewQueue from './JobCardReviewQueue'
import { JOB_CARD_READ_ONLY } from './jobCardReviewMode'
import { formatReviewDate, formatReviewTime, OFFICE_STATUS_LABELS, readReviewStage } from './jobCardReviewQueueModel'

export default function JobCardReviewsScreen() {
    const { reviewId } = useParams()
    const [params] = useSearchParams()
    const queueView = readReviewStage(params)
    const selectedReviewId = reviewId || params.get('review') || undefined
    const queueState = useJobCardReviews(undefined, queueView, params.get('jobNumber') || '')
    return <>
        {JOB_CARD_READ_ONLY && <aside className="review-read-only-notice" role="note"><strong>Live Job Cards · read-only local preview</strong> View reviews and download evidence. Mark reviewed and email retries are disabled here. Other application areas keep their normal permissions.</aside>}
        <JobCardReviewQueue items={queueState.items} truncated={queueState.truncated} canLoadMore={queueState.canLoadMore} busy={queueState.busy} error={queueState.error} refresh={queueState.refresh} loadMore={queueState.loadMore} queueView={queueView} />
        {selectedReviewId && <ReviewDialogContent key={selectedReviewId} reviewId={selectedReviewId} refreshQueue={queueState.refresh} />}
    </>
}

function ReviewDialogContent({ reviewId, refreshQueue }: { reviewId: string; refreshQueue: () => void }) {
    const state = useJobCardReviews(reviewId)
    const navigate = useNavigate()
    const location = useLocation()
    const dialogRef = useRef<HTMLElement>(null)
    const titleId = useId()
    const { review, error, busy, refresh } = state
    const requestedReturn = (location.state as { reviewQueueReturnTo?: unknown } | null)?.reviewQueueReturnTo
    const fallbackParams = new URLSearchParams(location.search)
    fallbackParams.delete('review')
    const fallbackReturn = `/job-card-reviews${fallbackParams.size ? `?${fallbackParams.toString()}` : ''}`
    const returnTo = typeof requestedReturn === 'string' && /^\/job-card-reviews(?:\?|$)/.test(requestedReturn) ? requestedReturn : fallbackReturn
    const close = () => navigate(returnTo, { replace: true })
    const dialogTitle = review ? `Job ${review.jobNumber || 'Unnumbered'}` : 'Loading Job Card submission…'
    const dialogSubtitle = review
        ? [review.fleetNumber || review.equipmentDisplayName || 'Equipment not recorded', review.workRequired || 'No Job description recorded'].join(' - ')
        : ''
    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        requestAnimationFrame(() => dialogRef.current?.focus())
        return () => {
            document.body.style.overflow = originalOverflow
            requestAnimationFrame(() => { if (previous?.isConnected) previous.focus() })
        }
    }, [])
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            close()
            return
        }
        if (event.key !== 'Tab') return
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
            .filter((element) => element.offsetParent !== null)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (!first) { event.preventDefault(); dialogRef.current?.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }

    return <div className="job-card-review-dialog-backdrop" role="presentation">
        <section ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown} className="job-card-review-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <header>
                <div>
                    <h2 id={titleId}>{dialogTitle}</h2>
                    {dialogSubtitle && <p>{dialogSubtitle}</p>}
                </div>
                <div className="job-card-review-dialog-header-actions">
                    {review && <div className="job-card-review-dialog-meta">
                        <span className={`review-status ${review.officeStatus || 'pending'}`}>{OFFICE_STATUS_LABELS[review.officeStatus || 'pending']}</span>
                        <span className="job-card-review-dialog-submitted">Submitted {formatReviewDate(review.submittedOn)}, {formatReviewTime(review.submittedOn)}</span>
                    </div>}
                    <button type="button" aria-label="Close Job Card review" onClick={close}>×</button>
                </div>
            </header>
            <div className="job-card-review-dialog-content">
                {busy && !review ? <p className="review-dialog-message" role="status">Loading Job Card submission…</p>
                    : !review ? <div className="review-dialog-message"><p role="alert">{error || 'Review unavailable.'}</p><button type="button" onClick={refresh}>Retry</button></div>
                        : <JobCardReviewDetail review={review} state={state} embedded onWorkflowChanged={refreshQueue} />}
            </div>
            <footer><button type="button" onClick={close}>Close</button></footer>
        </section>
    </div>
}
