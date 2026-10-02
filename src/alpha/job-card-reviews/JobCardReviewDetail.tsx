import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import EditDrawerShell from '../shared/drawer/EditDrawerShell'
import JobQuotesDrawer from '../quotes/components/JobQuotesDrawer'
import { jobCardPhotoFilename } from './jobCardPhotoDownload'
import type { JobCardReview } from './jobCardReview.types'
import type { useJobCardReviews } from './useJobCardReviews'

const dateTime = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })
type Props = { review: JobCardReview; state: ReturnType<typeof useJobCardReviews> }

export default function JobCardReviewDetail({ review, state }: Props) {
    const [quotesOpen, setQuotesOpen] = useState(false)
    const [saveOpen, setSaveOpen] = useState(false)
    const [filename, setFilename] = useState(() => jobCardPhotoFilename(review))
    const quoteButton = useRef<HTMLButtonElement>(null)
    const photoButton = useRef<HTMLButtonElement>(null)
    const { busy, error, refresh, markReviewed, pdfBusy, downloadPdf, retryNotification, contact, photoUrls, photoLoading, loadPhoto, photoSaving, photoProgress, photoFeedback, downloadPhotos } = state
    const closeQuotes = () => { setQuotesOpen(false); quoteButton.current?.focus() }
    const closeSave = () => { setSaveOpen(false); photoButton.current?.focus() }
    return <main className="job-card-reviews review-detail">
        <Link className="review-back" to="/job-card-reviews">← Pending reviews</Link>
        <header className="review-hero">
            <div><span className={`review-status ${review.status}`}>{review.status === 'reviewed' ? 'Reviewed' : 'Pending office review'}</span><h1>Job {review.jobNumber}</h1><p>{review.workRequired || 'No Job description recorded'}</p><small>{review.technicianName || 'Technician not recorded'} · Submitted {dateTime.format(new Date(review.submittedOn))}</small></div>
            <div className="review-actions">
                <button type="button" className="review-primary" disabled={busy || review.status === 'reviewed'} onClick={() => void markReviewed()}>{review.status === 'reviewed' ? 'Reviewed' : 'Mark reviewed'}</button>
                <button ref={quoteButton} type="button" onClick={() => setQuotesOpen(true)}>Associated quotes</button>
                <button type="button" disabled={busy || pdfBusy} onClick={() => void downloadPdf()}>{pdfBusy ? 'Preparing PDF…' : 'Download submission PDF'}</button>
            </div>
        </header>
        {error && <p className="review-error" role="alert">{error} <button type="button" onClick={refresh}>Refresh</button></p>}
        <section className="review-context" aria-label="Equipment and customer details">
            <article className="review-card"><p className="review-eyebrow">Equipment</p><h2>{review.equipmentDisplayName || 'No equipment recorded'}</h2><dl className="review-facts"><div><dt>Fleet number</dt><dd>{review.fleetNumber || 'Not recorded'}</dd></div><div><dt>Serial number</dt><dd>{review.equipmentSerial || 'Not recorded'}</dd></div><div><dt>Make</dt><dd>{review.equipmentMake || 'Not recorded'}</dd></div><div><dt>Model</dt><dd>{review.equipmentModel || 'Not recorded'}</dd></div></dl></article>
            <article className="review-card"><p className="review-eyebrow">Customer &amp; site</p><h2>{review.customerName || 'Customer not recorded'}</h2><dl className="review-facts"><div><dt>Site</dt><dd>{review.siteName || 'Not recorded'}</dd></div><div><dt>Order number</dt><dd>{review.orderNumber || 'Not recorded'}</dd></div><div className="review-wide"><dt>Address</dt><dd>{review.siteAddress || 'Not recorded'}</dd></div><div className="review-wide"><dt>Current Job contact</dt><dd>{!contact ? 'Loading contact…' : contact.error ? <>{contact.error} <button className="review-inline-button" type="button" onClick={refresh}>Retry</button></> : !contact.data ? 'No contact assigned' : <><strong>{contact.data.name || 'Unnamed contact'}</strong>{contact.data.phone && <span>{contact.data.phone}</span>}{contact.data.email && <span>{contact.data.email}</span>}</>}</dd></div></dl><p className="review-note">Equipment and site are the saved snapshot. Contact is read from the current Job.</p></article>
        </section>
        <section className="review-card review-story-section" aria-labelledby="review-story-heading">
            <div className="review-section-heading"><div><p className="review-eyebrow">Technician submission</p><h2 id="review-story-heading">Story</h2></div><div className="review-hour-meter"><span>Submitted hour meter</span><strong>{review.hourMeter?.toLocaleString('en-NZ') ?? 'Not supplied'}</strong>{review.hourMeter != null && <small>hours</small>}</div></div>
            <div className="review-narrative"><h3>Job story</h3><p>{review.story || 'No story supplied.'}</p></div>
            <div className="review-observations"><article className={review.furtherWorkRequired ? 'has-further-work' : ''}><h3>Further work</h3><p>{review.furtherWorkRequired ? review.furtherWorkDetails || 'Required - details not supplied.' : 'No further work reported.'}</p></article><article className={review.safetyIssueIdentified ? 'has-safety-issue' : ''}><h3>Safety issues</h3><p>{review.safetyIssueIdentified ? review.safetyIssueDetails || 'Identified - details not supplied.' : 'No safety issues reported.'}</p></article></div>
        </section>
        <section className="review-context review-evidence-tables" aria-label="Time, travel and parts">
            <article className="review-card"><div className="review-section-heading"><h2>Time &amp; travel</h2><strong>{Number(review.timeEntries.reduce((total, entry) => total + entry.hours, 0).toFixed(2))} h · {review.timeEntries.reduce((total, entry) => total + entry.kilometres, 0)} km</strong></div>{review.timeEntries.length ? <div className="review-table-wrap"><table><thead><tr><th>Date</th><th>Hours</th><th>Travel</th></tr></thead><tbody>{review.timeEntries.map((entry, index) => <tr key={index}><td>{entry.date.split('-').reverse().join('/')}</td><td>{entry.hours}</td><td>{entry.kilometres} km</td></tr>)}</tbody></table></div> : <p>None recorded.</p>}</article>
            <article className="review-card"><h2>Parts used</h2>{review.parts.length ? <div className="review-table-wrap"><table><thead><tr><th>Part</th><th>Quantity</th></tr></thead><tbody>{review.parts.map((part, index) => <tr key={index}><td>{part.description}</td><td>{part.quantity}</td></tr>)}</tbody></table></div> : <p>None recorded.</p>}</article>
        </section>
        <section className="review-card review-photos" aria-labelledby="review-photos-heading">
            <div className="review-section-heading"><div><p className="review-eyebrow">Private evidence</p><h2 id="review-photos-heading">Photos <span className="review-count">{review.photos.length}</span></h2></div><button ref={photoButton} type="button" disabled={!review.photos.length || photoSaving} onClick={() => setSaveOpen(true)}>Download all photos</button></div>
            <p className="review-note">Save all originals in one ZIP, or load and download individual photos.</p>
            {photoFeedback && <p className="review-download-feedback" role="status">{photoFeedback}</p>}
            {review.photos.length ? <div className="review-photo-grid">{review.photos.map((photo, index) => <figure key={photo.id}>{photoUrls[photo.id] ? <a href={photoUrls[photo.id]} download={photo.fileName} aria-label={`Download ${photo.fileName}`}>{['image/jpeg', 'image/png'].includes(photo.mimeType) ? <img src={photoUrls[photo.id]} alt={photo.fileName} /> : <span className="review-photo-placeholder">Download original</span>}</a> : <button type="button" className="review-photo-placeholder" disabled={photoLoading[photo.id]} onClick={() => void loadPhoto(photo.id)}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{photoLoading[photo.id] ? 'Loading…' : 'Load photo'}</button>}<figcaption>{photo.fileName}<small>{(photo.size / 1024 / 1024).toFixed(1)} MB · {photo.mimeType.replace('image/', '').toUpperCase()}</small></figcaption></figure>)}</div> : <p>No photos submitted.</p>}
        </section>
        <footer className="review-audit"><p>Evidence is retained in Azure. Reviewing does not complete the Job or import evidence into Dataverse.</p>{review.reviewedOn && <p>Reviewed {dateTime.format(new Date(review.reviewedOn))}</p>}{review.notificationStatus !== 'sent' && <p>Review email: {review.notificationStatus || 'pending'}. <button type="button" disabled={busy} onClick={() => void retryNotification()}>Retry notification</button></p>}</footer>
        {quotesOpen && <JobQuotesDrawer jobId={review.sourceJobId} jobNumber={review.jobNumber} onClose={closeQuotes} />}
        {saveOpen && <EditDrawerShell eyebrow={`Job ${review.jobNumber} · ${review.photos.length} photos`} title="Save all photos" busy={photoSaving} onClose={closeSave} footer={<><button type="button" disabled={photoSaving} onClick={closeSave}>Cancel</button><button type="button" className="primary" disabled={photoSaving || !filename.trim()} onClick={() => { void downloadPhotos(filename).then((saved) => { if (saved) closeSave() }) }}>{photoSaving ? `Preparing ${photoProgress} / ${review.photos.length}…` : 'Save ZIP'}</button></>}>
            <div className="review-save-fields"><label>File name<input value={filename} maxLength={160} onChange={(event) => setFilename(event.target.value)} disabled={photoSaving} /></label><p>The date is the submission date in New Zealand. All original photos are included.</p><p>Supported browsers will ask where to save. Other browsers use their configured Downloads location.</p>{photoSaving && <p role="status">Preparing {photoProgress} of {review.photos.length} photos…</p>}{photoFeedback && <p role="status">{photoFeedback}</p>}</div>
        </EditDrawerShell>}
    </main>
}
