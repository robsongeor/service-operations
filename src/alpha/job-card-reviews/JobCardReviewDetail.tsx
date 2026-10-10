import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import EditDrawerShell from '../shared/drawer/EditDrawerShell'
import EditDrawerFormDialog from '../shared/drawer/EditDrawerFormDialog'
import JobQuotesDrawer from '../quotes/components/JobQuotesDrawer'
import { jobCardPhotoFilename } from './jobCardPhotoDownload'
import type { JobCardOfficeAction, JobCardReview } from './jobCardReview.types'
import type { useJobCardReviews } from './useJobCardReviews'
import { OFFICE_STATUS_LABELS } from './jobCardReviewQueueModel'

const dateTime = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' })
type Props = { review: JobCardReview; state: ReturnType<typeof useJobCardReviews>; embedded?: boolean; onWorkflowChanged?: () => void }
// Keep the API's older hold action compatible, but offer one follow-up action in this UI.
type OfficeUiAction = Exclude<JobCardOfficeAction, 'setOnHold'>

export default function JobCardReviewDetail({ review, state, embedded = false, onWorkflowChanged }: Props) {
    const location = useLocation()
    const requestedReturn = location.state?.reviewQueueReturnTo
    const returnTo = typeof requestedReturn === 'string' && /^\/job-card-reviews(?:\?|$)/.test(requestedReturn) ? requestedReturn : '/job-card-reviews'
    const [quotesOpen, setQuotesOpen] = useState(false)
    const [saveOpen, setSaveOpen] = useState(false)
    const [includeJobCard, setIncludeJobCard] = useState(false)
    const [filename, setFilename] = useState(() => jobCardPhotoFilename(review))
    const [officeAction, setOfficeAction] = useState<OfficeUiAction>()
    const [meterDate, setMeterDate] = useState(review.hourMeterRecordedDate || '')
    const [meterConfirmed, setMeterConfirmed] = useState(false)
    const [meterException, setMeterException] = useState('')
    const [approvedHours, setApprovedHours] = useState(String(review.hourMeter ?? ''))
    const [officeNote, setOfficeNote] = useState('')
    const [greentreeReference, setGreentreeReference] = useState('')
    const [actionError, setActionError] = useState('')
    const [actionFeedback, setActionFeedback] = useState('')
    const officeActionButton = useRef<HTMLButtonElement>(null)
    const officeHeading = useRef<HTMLHeadingElement>(null)
    const quoteButton = useRef<HTMLButtonElement>(null)
    const saveButton = useRef<HTMLButtonElement | null>(null)
    const officeStatus = review.officeStatus || 'pending'
    const officeActivities = review.officeActivities || []
    const totalHours = Number(review.timeEntries.reduce((total, entry) => total + entry.hours, 0).toFixed(2))
    const totalKilometres = review.timeEntries.reduce((total, entry) => total + entry.kilometres, 0)
    const { busy, error, conflict, refresh, transition, pdfBusy, downloadPdf, retryNotification, contact, photoUrls, photoLoading, loadPhoto, photoSaving, photoProgress, photoFeedback, downloadPhotos } = state
    const closeQuotes = () => { setQuotesOpen(false); quoteButton.current?.focus() }
    const closeSave = () => { setSaveOpen(false); requestAnimationFrame(() => saveButton.current?.focus()) }
    const openSave = (button: HTMLButtonElement, documentation: boolean) => { saveButton.current = button; setIncludeJobCard(documentation); setSaveOpen(true) }
    const openOfficeAction = (action: OfficeUiAction, button: HTMLButtonElement) => { officeActionButton.current = button; setOfficeAction(action); setOfficeNote(''); setGreentreeReference(review.greentreeReference || ''); setActionError('') }
    const closeOfficeAction = () => { setOfficeAction(undefined); setActionError(''); requestAnimationFrame(() => { const button = officeActionButton.current; if (button?.isConnected && !button.disabled) button.focus(); else officeHeading.current?.focus() }) }
    const submitOfficeAction = async () => {
        if (!officeAction) return
        setActionError('')
        try { await transition(officeAction, { note: officeNote, greentreeReference: officeAction === 'completeGreenTreeProcessing' ? greentreeReference : undefined,
            meterApproval: officeAction === 'completeGreenTreeProcessing' && review.meterApprovalAvailable && review.hourMeter != null ? { confirmed: meterConfirmed, hours: approvedHours.trim() ? Number(approvedHours) : NaN, recordedDate: meterDate, exceptionReason: meterException } : undefined }); onWorkflowChanged?.(); setActionFeedback('Office workflow saved.'); closeOfficeAction() }
        catch (reason) { setActionError(reason instanceof Error ? reason.message : 'The office review could not be updated.') }
    }
    const noteRequired = officeAction === 'setNeedsClarification' || officeAction === 'recordCorrection'
    const needsMeterApproval = officeAction === 'completeGreenTreeProcessing' && review.meterApprovalAvailable && review.hourMeter != null
    const meterApprovalIncomplete = needsMeterApproval && (!meterConfirmed || !meterDate || !approvedHours.trim()
        || !Number.isSafeInteger(Number(approvedHours)) || Number(approvedHours) < 0 || Number(approvedHours) > 2147483647
        || (Number(approvedHours) !== review.hourMeter && !meterException.trim()))
    const actionTitle = officeAction === 'startReview' ? 'Start GreenTree entry' : officeAction === 'resumeReview' ? 'Resume entry' : officeAction === 'recordCorrection' ? 'Record office correction' : noteRequired ? 'Needs follow-up' : 'Mark complete'
    const Root: 'main' | 'div' = embedded ? 'div' : 'main'
    const reviewActions = <div className="review-actions">
        <button type="button" className="review-save-documentation" disabled={busy || photoSaving || pdfBusy} onClick={(event) => openSave(event.currentTarget, true)}>Save all documentation</button>
        <button ref={quoteButton} type="button" onClick={() => setQuotesOpen(true)}>Associated quotes</button>
        <button type="button" disabled={busy || pdfBusy || photoSaving} onClick={() => void downloadPdf()}>{pdfBusy ? 'Preparing PDF…' : 'Download job card PDF'}</button>
    </div>
    return <Root className={`job-card-reviews review-detail${embedded ? ' review-detail-embedded' : ''}`}>
        {!embedded && <Link className="review-back" to={returnTo}>← Back to reviews</Link>}
        {actionFeedback && <p className="review-download-feedback" role="status">{actionFeedback}</p>}
        {!embedded && <div className="review-overview-bar">
            <header className="review-hero">
                <div className="review-hero-copy">
                    <div className="review-title-row"><h1>Job {review.jobNumber}</h1><span className={`review-status ${officeStatus}`}>{OFFICE_STATUS_LABELS[officeStatus]}</span></div>
                    <span className="review-hero-label">Work required</span>
                    <p>{review.workRequired || 'No Job description recorded'}</p>
                </div>
                {reviewActions}
            </header>
            <section className="review-scan-strip" aria-label="Review at a glance">
                <article><span>Technician</span><strong>{review.technicianName || 'Not recorded'}</strong></article>
                <article><span>Submitted</span><strong>{dateTime.format(new Date(review.submittedOn))}</strong></article>
                <article><span>Order number</span><strong>{review.orderNumber || 'Not recorded'}</strong></article>
            </section>
        </div>}
        {error && <p className="review-error" role="alert">{error} {conflict ? 'Your entered note has been kept. Refresh the review and check the other administrator’s change before retrying.' : null} <button type="button" onClick={refresh}>Refresh</button></p>}
        <div className="review-workspace">
            <div className="review-primary-column">
                <div className="review-context-workflow-grid">
                    <section className="review-summary review-card" aria-label="Job details">
                        {embedded && <dl className="review-job-details-meta">
                            <div><dt>Technician</dt><dd>{review.technicianName || 'Not recorded'}</dd></div>
                            <div><dt>Order number</dt><dd>{review.orderNumber || 'Not recorded'}</dd></div>
                        </dl>}
                        <article className="review-customer-summary">
                            <p className="review-eyebrow">Saved customer &amp; site</p><h2>{review.customerName || 'Customer not recorded'}</h2>
                            <div className="review-customer-location">
                                <strong>{review.siteName || 'Site not recorded'}</strong>
                                <address>{review.siteAddress || 'Address not recorded'}</address>
                            </div>
                            <div className="review-site-contact">
                                <span>Site contact</span>
                                <div className="review-contact-details">{!contact ? 'Loading contact…' : contact.error ? <>{contact.error} <button className="review-inline-button" type="button" onClick={refresh}>Retry</button></> : !contact.data ? 'No contact assigned' : <><strong>{contact.data.name || 'Unnamed contact'}</strong>{contact.data.phone && <span>{contact.data.phone}</span>}{contact.data.email && <span>{contact.data.email}</span>}</>}</div>
                            </div>
                        </article>
                        <article className="review-equipment-summary">
                            <p className="review-eyebrow">Saved equipment</p>
                            <h2>{review.fleetNumber || review.equipmentDisplayName || 'No equipment recorded'}</h2>
                            <div className="review-equipment-identity">
                                <strong>{[review.equipmentMake, review.equipmentModel].filter(Boolean).join(' · ') || 'Make and model not recorded'}</strong>
                                <span>Serial {review.equipmentSerial || 'not recorded'}</span>
                            </div>
                            <div className="review-hour-meter"><span>Submitted hour meter</span><strong>{review.hourMeter?.toLocaleString('en-NZ') ?? 'Not supplied'}</strong>{review.hourMeter != null && <small>hours</small>}</div>
                        </article>
                    </section>

                </div>
                <section className="review-card review-story-section" aria-labelledby="review-story-heading">
                    <div className="review-section-heading"><div><p className="review-eyebrow">Technician submission</p><h2 id="review-story-heading">Work performed</h2></div></div>
                    <div className="review-narrative"><p>{review.story || 'No story supplied.'}</p></div>
                    <div className="review-observations">
                        <article className={review.furtherWorkRequired ? 'has-further-work' : ''}><h3>Further work</h3><p>{review.furtherWorkRequired ? review.furtherWorkDetails || 'Required - details not supplied.' : 'No further work reported.'}</p></article>
                        <article className={review.safetyIssueIdentified ? 'has-safety-issue' : ''}><h3>Safety issues</h3><p>{review.safetyIssueIdentified ? review.safetyIssueDetails || 'Identified - details not supplied.' : 'No safety issues reported.'}</p></article>
                    </div>
                </section>
                <section className="review-resources" aria-label="Time, travel and parts">
                    <div className="review-resource-grid">
                        <article className="review-resource-section" aria-labelledby="review-time-heading">
                            <div className="review-section-heading"><h2 id="review-time-heading">Time &amp; travel</h2></div>
                            {review.timeEntries.length ? <table className="review-resource-table" aria-labelledby="review-time-heading">
                                <thead><tr><th scope="col">Date</th><th scope="col" className="review-number">Labour</th><th scope="col" className="review-number">Travel</th></tr></thead>
                                <tbody>{review.timeEntries.map((entry, index) => <tr key={index}><td><time dateTime={entry.date}>{entry.date.split('-').reverse().join('/')}</time></td><td className="review-number">{entry.hours} h</td><td className="review-number">{entry.kilometres} km</td></tr>)}</tbody>
                                <tfoot><tr><th scope="row">Total</th><td className="review-number">{totalHours} h</td><td className="review-number">{totalKilometres} km</td></tr></tfoot>
                            </table> : <p className="review-resource-empty">No time or travel recorded.</p>}
                        </article>
                        <article className="review-resource-section" aria-labelledby="review-parts-heading">
                            <div className="review-section-heading"><h2 id="review-parts-heading">Parts used</h2>{review.parts.length > 0 && <span className="review-count">{review.parts.length} {review.parts.length === 1 ? 'entry' : 'entries'}</span>}</div>
                            {review.parts.length ? <table className="review-resource-table review-parts-table" aria-labelledby="review-parts-heading">
                                <thead><tr><th scope="col">Description</th><th scope="col" className="review-number">Qty</th></tr></thead>
                                <tbody>{review.parts.map((part, index) => <tr key={index}><td>{part.description}</td><td className="review-number">{part.quantity}</td></tr>)}</tbody>
                            </table> : <p className="review-resource-empty">No parts recorded.</p>}
                        </article>
                    </div>
                </section>
            </div>
            <div className="review-evidence-rail">
                <section className={`review-card review-photos${review.photos.length ? '' : ' review-evidence-empty'}`} aria-labelledby="review-photos-heading">
                    <div className="review-section-heading"><div><h2 id="review-photos-heading">Photos <span className="review-count">{review.photos.length}</span></h2></div><button type="button" disabled={!review.photos.length || photoSaving} onClick={(event) => openSave(event.currentTarget, false)}>Download all photos</button></div>
                    {review.photos.length > 0 && <p className="review-note">Download all originals, or select an individual photo.</p>}
                    {photoFeedback && <p className="review-download-feedback" role="status">{photoFeedback}</p>}
                    {review.photos.length ? <div className="review-photo-grid">{review.photos.map((photo, index) => <figure key={photo.id}>{photoUrls[photo.id] ? <a href={photoUrls[photo.id]} download={photo.fileName} aria-label={`Download ${photo.fileName}`}>{['image/jpeg', 'image/png'].includes(photo.mimeType) ? <img src={photoUrls[photo.id]} alt={photo.fileName} /> : <span className="review-photo-placeholder">Download original</span>}</a> : <button type="button" className="review-photo-placeholder" disabled={photoLoading[photo.id]} onClick={() => void loadPhoto(photo.id)}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{photoLoading[photo.id] ? 'Loading…' : 'Load photo'}</button>}<figcaption>{photo.fileName}<small>{(photo.size / 1024 / 1024).toFixed(1)} MB · {photo.mimeType.replace('image/', '').toUpperCase()}</small></figcaption></figure>)}</div> : <p className="review-no-evidence">No photos submitted.</p>}
                </section>
                {embedded && <nav className="review-document-tools" aria-label="Submission documents">{reviewActions}</nav>}
                {review.officeRecoveryAvailable === true && <section className="review-card"><details onToggle={(event) => { if (event.currentTarget.open && !state.technicianReturns && !state.returnsBusy) void state.loadReturns() }}><summary>Technician returns</summary>{state.returnsBusy && <p role="status">Checking assigned technicians…</p>}{state.returnsError && <p role="alert">{state.returnsError}</p>}{state.technicianReturns && <ul>{state.technicianReturns.map((item) => <li key={item.assignmentId || 'primary'}>{item.name} — {{ received: 'Received', awaiting: 'Awaiting card', expired: 'Expired link — resend needed', withdrawn: 'Withdrawn', notSent: 'No matching card sent' }[item.state]}</li>)}</ul>}<button type="button" disabled={state.returnsBusy} onClick={() => void state.loadReturns()}>Refresh returns</button></details></section>}
                <section className="review-card review-office-workflow" aria-labelledby="review-office-heading">
                    <div className="review-section-heading"><div><p className="review-eyebrow">Office workflow</p><h2 ref={officeHeading} tabIndex={-1} id="review-office-heading">{OFFICE_STATUS_LABELS[officeStatus]}</h2></div>{review.officeActionBy && <div className="review-office-handler"><span>Last handled by</span><strong>{review.officeActionBy.displayName}</strong>{review.officeActionOn && <small>{dateTime.format(new Date(review.officeActionOn))}</small>}</div>}</div>
                    {review.officeNote && <p className="review-office-note"><strong>Office note</strong><span>{review.officeNote}</span></p>}
                    {review.greentreeReference && <p className="review-office-note"><strong>GreenTree reference</strong><span>{review.greentreeReference}</span></p>}
                    {review.meterApproval && <div className="review-office-note" role="status"><strong>Office-approved meter: {review.meterApproval.hours.toLocaleString('en-NZ')} h</strong><span>Read {review.meterApproval.recordedDate} · approved by {review.meterApproval.approvedBy.displayName}</span><span>{review.meterSyncStatus === 'applied' ? 'Saved to Job — available to usage forecasting.' : review.meterSyncStatus === 'superseded' ? 'A newer reading is already on this Job; this approval remains in the card history.' : review.meterSyncError || 'Job update pending.'}</span>{['pending', 'failed'].includes(review.meterSyncStatus || '') && <button type="button" disabled={busy || state.readOnly} onClick={() => { void transition('retryMeterSync').catch(() => undefined) }}>Retry Job meter update</button>}</div>}
                    {!review.isTerminal && <p className="review-workflow-guidance">Enter the job card in GreenTree, then mark office processing complete.</p>}
                    {!review.isTerminal && <div className="review-office-actions">
                        <button type="button" className="review-complete-action review-primary" disabled={busy || state.readOnly} onClick={(event) => openOfficeAction('completeGreenTreeProcessing', event.currentTarget)}>Mark complete</button>
                        <button type="button" className="review-followup-action" disabled={busy || state.readOnly} onClick={(event) => openOfficeAction('setNeedsClarification', event.currentTarget)}>Needs follow-up</button>
                        {officeStatus === 'pending' && <button type="button" className="review-start-action" disabled={busy || state.readOnly} onClick={(event) => openOfficeAction('startReview', event.currentTarget)}>Start GreenTree entry</button>}
                        {review.officeRecoveryAvailable === true && ['needsClarification', 'onHold'].includes(officeStatus) && <button type="button" className="review-start-action" disabled={busy || state.readOnly} onClick={(event) => openOfficeAction('resumeReview', event.currentTarget)}>Resume entry</button>}
                    </div>}
                    {review.officeRecoveryAvailable === true && <button type="button" disabled={busy || state.readOnly} onClick={(event) => openOfficeAction('recordCorrection', event.currentTarget)}>Record office correction</button>}
                    {review.officeCorrections?.map((correction, index) => <p className="review-office-note" key={`correction-${index}`}><strong>Office correction · {correction.actor.displayName}</strong><span>{correction.note}</span></p>)}
                    <details className="review-office-activity"><summary>Activity history <span>({officeActivities.length})</span></summary>{officeActivities.length ? <ol>{officeActivities.map((activity, index) => <li key={`${activity.occurredOn}-${index}`}><span className="review-office-activity-marker" aria-hidden="true" /><div><strong>{activity.action === 'recordCorrection' ? 'Office correction' : activity.action === 'resumeReview' ? 'Resumed entry' : OFFICE_STATUS_LABELS[activity.toStatus]}</strong><span>{activity.actor.displayName} · {dateTime.format(new Date(activity.occurredOn))}</span>{activity.note && <p>{activity.note}</p>}{activity.greentreeReference && <small>GreenTree reference: {activity.greentreeReference}</small>}</div></li>)}</ol> : <p>No office actions recorded yet.</p>}</details>
                    <details className="review-office-help"><summary>About this workflow</summary><p className="review-note">Opening this review does not change its state. Office actions never edit the technician’s submitted evidence or the operational Job status.</p></details>
                </section>
            </div>
        </div>
        {(!embedded || review.reviewedOn || review.notificationStatus !== 'sent') && <footer className="review-audit">{!embedded && <p>Office processing does not change the operational Job status.</p>}{review.reviewedOn && <p>Reviewed {dateTime.format(new Date(review.reviewedOn))}</p>}{review.notificationStatus !== 'sent' && <p>Review email: {review.notificationStatus || 'pending'}. <button type="button" disabled={busy || state.readOnly} onClick={() => void retryNotification()}>Retry notification</button></p>}</footer>}
        {quotesOpen && <JobQuotesDrawer jobId={review.sourceJobId} jobNumber={review.jobNumber} onClose={closeQuotes} />}
        {saveOpen && <EditDrawerShell eyebrow={`Job ${review.jobNumber} · ${review.photos.length} photos`} title={includeJobCard ? 'Save all documentation' : 'Save all photos'} busy={photoSaving} onClose={closeSave} footer={<><button type="button" disabled={photoSaving} onClick={closeSave}>Cancel</button><button type="button" className="primary" disabled={photoSaving || !filename.trim()} onClick={() => { void downloadPhotos(filename, includeJobCard).then((saved) => { if (saved) closeSave() }) }}>{photoSaving ? 'Preparing ZIP…' : 'Save ZIP'}</button></>}>
            <div className="review-save-fields"><label>File name<input value={filename} maxLength={160} onChange={(event) => setFilename(event.target.value)} disabled={photoSaving} /></label><p>{includeJobCard ? 'Includes the completed Job card PDF and all original submitted photos in one ZIP. Associated quotes are not included.' : 'All original submitted photos are included.'}</p><p>The filename uses the New Zealand submission date. Saving documents does not mark the card complete.</p><p>Supported browsers will ask where to save. Other browsers use their configured Downloads location.</p>{photoSaving && <p role="status">{includeJobCard ? 'Preparing Job card and ' : 'Preparing '}{photoProgress} of {review.photos.length} photos…</p>}{photoFeedback && <p role="status">{photoFeedback}</p>}</div>
        </EditDrawerShell>}
        {officeAction && <EditDrawerFormDialog dialogClassName={needsMeterApproval ? 'review-meter-dialog' : ''} eyebrow="Office review" title={actionTitle} error={actionError} isBusy={busy} submitDisabled={Boolean(conflict || meterApprovalIncomplete || (review.isTerminal && officeAction !== 'recordCorrection') || (officeAction === 'startReview' && officeStatus !== 'pending') || (noteRequired && !officeNote.trim()))} submitLabel={busy ? 'Saving…' : officeAction === 'setNeedsClarification' ? 'Save follow-up' : actionTitle} onCancel={closeOfficeAction} onSubmit={() => void submitOfficeAction()}>
            <p>{needsMeterApproval ? 'Confirm office processing and approve the meter reading below. The technician’s original submission stays unchanged.' : 'This updates the office workflow only. The technician’s original submission stays unchanged.'}</p>
            <div className="review-conflict-context" aria-live="polite"><strong>Current saved state: {OFFICE_STATUS_LABELS[officeStatus]}</strong>{review.officeActionBy && <p>{review.officeActionBy.displayName}{review.officeActionOn ? ` · ${dateTime.format(new Date(review.officeActionOn))}` : ''}</p>}{review.officeNote && <p>Saved note: {review.officeNote}</p>}{review.isTerminal && <p>{officeAction === 'recordCorrection' ? 'The correction will be appended without changing the final outcome.' : 'This card now has a final outcome. Your draft has not been saved.'}</p>}</div>
            {conflict && <div role="alert"><p>Another administrator changed this card. Your draft below has been kept. Refresh and check their saved change before confirming.</p><button type="button" disabled={busy} onClick={() => { setActionError(''); refresh() }}>{busy ? 'Refreshing…' : 'Refresh review'}</button></div>}
            {officeAction === 'setNeedsClarification' && <p>Move this card to Needs follow-up. Explain what is missing or blocking GreenTree entry and who needs to help. This saves an office note; it does not send a message.</p>}
            {officeAction === 'recordCorrection' && <p>Record the correction and who confirmed it. This adds an audited office note; it does not edit the technician’s original evidence, change the downloaded original job card, or update GreenTree.</p>}
            {officeAction === 'resumeReview' && <p>Return this card to GreenTree entry. Previous follow-up notes remain in Activity history.</p>}
            {officeAction === 'startReview' ? <p><strong>Start GreenTree entry</strong> records you and the current time. It coordinates the shared queue but does not lock the card.</p> : <label>{officeAction === 'recordCorrection' ? 'Correction note *' : noteRequired ? 'Follow-up note *' : 'Office note (optional)'}<textarea autoFocus required={noteRequired} rows={4} maxLength={2000} placeholder={officeAction === 'recordCorrection' ? 'What was corrected, who confirmed it, and when?' : noteRequired ? 'For example: confirm labour hours with the technician, or ask Parts to allocate the missing items.' : undefined} value={officeNote} onChange={(event) => setOfficeNote(event.target.value)} /></label>}
            {officeAction === 'completeGreenTreeProcessing' && <label>GreenTree reference (optional)<input maxLength={200} value={greentreeReference} onChange={(event) => setGreentreeReference(event.target.value)} /></label>}
            {officeAction === 'completeGreenTreeProcessing' && review.meterApprovalAvailable && review.hourMeter != null && <fieldset className="review-meter-approval"><legend>Approve hour-meter reading</legend><p><strong>{review.hourMeter.toLocaleString('en-NZ')} hours</strong> originally submitted by {review.technicianName || 'the technician'}. Approval updates the Job’s usage evidence, not its completion or service schedule.</p><label>Approved reading (hours)<input type="number" min="0" max="2147483647" step="1" required value={approvedHours} onChange={(event) => { setApprovedHours(event.target.value); setMeterConfirmed(false) }} /></label><label>Date the meter was read<input type="date" required value={meterDate} onChange={(event) => { setMeterDate(event.target.value); setMeterConfirmed(false) }} /></label><label>Correction / exception note (required for a changed reading, lower reading or large jump)<textarea maxLength={2000} value={meterException} onChange={(event) => setMeterException(event.target.value)} /></label><label><input type="checkbox" checked={meterConfirmed} onChange={(event) => setMeterConfirmed(event.target.checked)} /> I have checked this reading and the date it was taken.</label></fieldset>}
            {officeAction === 'completeGreenTreeProcessing' && <p><strong>Confirm GreenTree entry is complete.</strong> This moves the card to Completed and records who completed it and when. It cannot be reopened here. This does not close the operational Job or send data to GreenTree.</p>}
        </EditDrawerFormDialog>}
    </Root>
}
