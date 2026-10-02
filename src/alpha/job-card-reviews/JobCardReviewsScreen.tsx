import { Link, useParams } from 'react-router-dom'
import PageHeader from '../shared/page-header/PageHeader'
import { useJobCardReviews } from './useJobCardReviews'
import './JobCardReviewsScreen.css'

const dateTime = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

export default function JobCardReviewsScreen() {
    const { reviewId } = useParams()
    const { items, review, photoUrls, error, busy, refresh, markReviewed, loadPhoto, retryNotification } = useJobCardReviews(reviewId)

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
    return <main className="job-card-reviews review-detail">
        <Link className="review-back" to="/job-card-reviews">← Pending reviews</Link>
        <header><div><span>{review.status === 'reviewed' ? 'Reviewed' : 'Pending office review'}</span><h1>Job {review.jobNumber}</h1><p>{review.customerName} · {review.siteName}</p></div><button type="button" disabled={busy || review.status === 'reviewed'} onClick={() => void markReviewed()}>{review.status === 'reviewed' ? 'Reviewed' : 'Mark reviewed'}</button></header>
        {error && <p className="review-error" role="alert">{error} <button type="button" onClick={refresh}>Refresh</button></p>}
        <p>This review retains evidence in Azure. It does not complete the Job or import into Dataverse.</p>
        {review.notificationStatus !== 'sent' && <p>Review email: {review.notificationStatus || 'pending'}. <button type="button" disabled={busy} onClick={() => void retryNotification()}>Retry notification</button></p>}
        <section className="review-grid">
            <article><h2>Snapshot</h2><dl><div><dt>Technician</dt><dd>{review.technicianName || 'Not recorded'}</dd></div><div><dt>Equipment</dt><dd>{review.equipmentDisplayName || 'No equipment'}{review.fleetNumber ? ` · ${review.fleetNumber}` : ''}</dd></div><div><dt>Work required</dt><dd>{review.workRequired || 'Not recorded'}</dd></div><div><dt>Submitted</dt><dd>{dateTime.format(new Date(review.submittedOn))}</dd></div></dl></article>
            <article><h2>Technician evidence</h2><dl><div><dt>Hour meter</dt><dd>{review.hourMeter?.toLocaleString('en-NZ') ?? 'Not supplied'}</dd></div><div><dt>Job story</dt><dd className="review-story">{review.story}</dd></div><div><dt>Further work</dt><dd>{review.furtherWorkRequired ? review.furtherWorkDetails : 'No'}</dd></div><div><dt>Safety issue</dt><dd>{review.safetyIssueIdentified ? review.safetyIssueDetails : 'No'}</dd></div></dl></article>
            <article><h2>Time &amp; travel</h2>{review.timeEntries.length ? <ul>{review.timeEntries.map((entry, index) => <li key={`${entry.date}-${index}`}>{entry.date}: {entry.hours} h · {entry.kilometres} km</li>)}</ul> : <p>None recorded.</p>}</article>
            <article><h2>Parts</h2>{review.parts.length ? <ul>{review.parts.map((part, index) => <li key={index}>{part.quantity} × {part.description}</li>)}</ul> : <p>None recorded.</p>}</article>
        </section>
        <section className="review-photos"><h2>Photos</h2>{review.photos.length ? <div>{review.photos.map((photo) => <figure key={photo.id}>{photoUrls[photo.id] ? <a href={photoUrls[photo.id]} download={photo.fileName}>{['image/jpeg', 'image/png'].includes(photo.mimeType) ? <img src={photoUrls[photo.id]} alt={photo.fileName} /> : 'Download photo'}</a> : <button type="button" onClick={() => void loadPhoto(photo.id)}>Load photo</button>}<figcaption>{photo.fileName}</figcaption></figure>)}</div> : <p>None recorded.</p>}</section>
    </main>
}
