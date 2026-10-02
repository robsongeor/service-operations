import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { Link, useParams } from 'react-router-dom'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { fetchJobCardPhoto, fetchJobCardReview, fetchPendingJobCardReviews, markJobCardReviewed } from './jobCardReviewApi'
import type { JobCardReview, JobCardReviewSummary } from './jobCardReview.types'
import './JobCardReviewsScreen.css'

const dateTime = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

export default function JobCardReviewsScreen() {
    const { reviewId } = useParams()
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [items, setItems] = useState<JobCardReviewSummary[]>([])
    const [review, setReview] = useState<JobCardReview | null>(null)
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(true)

    const accessToken = useCallback(async () => {
        if (!account) throw new Error('Sign in again to review Job Cards.')
        return (await instance.acquireTokenSilent({ scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`], account })).accessToken
    }, [account, instance])

    useEffect(() => {
        let current = true
        const urls: string[] = []
        void accessToken().then(async (token) => {
            if (!reviewId) return { items: await fetchPendingJobCardReviews(token) }
            const loaded = await fetchJobCardReview(token, reviewId)
            const photos = await Promise.all(loaded.photos.map(async (photo) => {
                const url = await fetchJobCardPhoto(token, reviewId, photo.id)
                urls.push(url)
                return [photo.id, url] as const
            }))
            return { review: loaded, photos: Object.fromEntries(photos) }
        }).then((result) => {
            if (!current) return
            if ('items' in result && result.items) setItems(result.items)
            else { setReview(result.review); setPhotoUrls(result.photos) }
        }).catch((loadError: unknown) => { if (current) setError(loadError instanceof Error ? loadError.message : 'The review could not be loaded.') })
            .finally(() => { if (current) setBusy(false) })
        return () => { current = false; urls.forEach(URL.revokeObjectURL) }
    }, [accessToken, reviewId])

    const markReviewed = async () => {
        if (!reviewId) return
        setBusy(true)
        setError('')
        try { setReview(await markJobCardReviewed(await accessToken(), reviewId)) }
        catch (markError) { setError(markError instanceof Error ? markError.message : 'The review could not be completed.') }
        finally { setBusy(false) }
    }

    if (busy && !review && items.length === 0) return <main className="job-card-reviews"><h1>Job Card reviews</h1><p>Loading…</p></main>
    if (error) return <main className="job-card-reviews"><h1>Job Card reviews</h1><p className="review-error" role="alert">{error}</p></main>
    if (!reviewId) return <main className="job-card-reviews">
        <header><div><span>Office workflow</span><h1>Pending Job Card reviews</h1></div><strong>{items.length}</strong></header>
        {items.length === 0 ? <p className="review-empty">No technician submissions are waiting for review.</p> : <div className="review-list">
            {items.map((item) => <Link key={item.reviewId} to={`/job-card-reviews/${item.reviewId}`}>
                <div><strong>Job {item.jobNumber}</strong><span>{item.customerName || item.siteName || 'Customer not recorded'}</span></div>
                <div><span>{item.technicianName || 'Technician not recorded'}</span><time>{dateTime.format(new Date(item.submittedOn))}</time></div>
                <div className="review-flags">{item.safetyIssueIdentified && <b>Safety issue</b>}{item.furtherWorkRequired && <b>Further work</b>}<span>{item.photoCount} photo{item.photoCount === 1 ? '' : 's'}</span></div>
            </Link>)}
        </div>}
    </main>
    if (!review) return null
    return <main className="job-card-reviews review-detail">
        <Link className="review-back" to="/job-card-reviews">← Pending reviews</Link>
        <header><div><span>{review.status === 'reviewed' ? 'Reviewed' : 'Pending office review'}</span><h1>Job {review.jobNumber}</h1><p>{review.customerName} · {review.siteName}</p></div><button type="button" disabled={busy || review.status === 'reviewed'} onClick={() => void markReviewed()}>{review.status === 'reviewed' ? 'Reviewed' : 'Mark reviewed'}</button></header>
        <section className="review-grid">
            <article><h2>Snapshot</h2><dl><div><dt>Technician</dt><dd>{review.technicianName || 'Not recorded'}</dd></div><div><dt>Equipment</dt><dd>{review.equipmentDisplayName || 'No equipment'}{review.fleetNumber ? ` · ${review.fleetNumber}` : ''}</dd></div><div><dt>Work required</dt><dd>{review.workRequired || 'Not recorded'}</dd></div><div><dt>Submitted</dt><dd>{dateTime.format(new Date(review.submittedOn))}</dd></div></dl></article>
            <article><h2>Technician evidence</h2><dl><div><dt>Hour meter</dt><dd>{review.hourMeter?.toLocaleString('en-NZ') ?? 'Not supplied'}</dd></div><div><dt>Job story</dt><dd className="review-story">{review.story}</dd></div><div><dt>Further work</dt><dd>{review.furtherWorkRequired ? review.furtherWorkDetails : 'No'}</dd></div><div><dt>Safety issue</dt><dd>{review.safetyIssueIdentified ? review.safetyIssueDetails : 'No'}</dd></div></dl></article>
            <article><h2>Time &amp; travel</h2>{review.timeEntries.length ? <ul>{review.timeEntries.map((entry, index) => <li key={`${entry.date}-${index}`}>{entry.date}: {entry.hours} h · {entry.kilometres} km</li>)}</ul> : <p>None recorded.</p>}</article>
            <article><h2>Parts</h2>{review.parts.length ? <ul>{review.parts.map((part, index) => <li key={`${part}-${index}`}>{part}</li>)}</ul> : <p>None recorded.</p>}</article>
        </section>
        <section className="review-photos"><h2>Photos</h2>{review.photos.length ? <div>{review.photos.map((photo) => <figure key={photo.id}><a href={photoUrls[photo.id]} target="_blank" rel="noreferrer"><img src={photoUrls[photo.id]} alt={photo.fileName} /></a><figcaption>{photo.fileName}</figcaption></figure>)}</div> : <p>None recorded.</p>}</section>
    </main>
}
