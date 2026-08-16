import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPublicJobSubmission, JobSubmissionError, submitPublicJobCard } from './jobSubmissionApi'
import type { JobCardTimeEntryInput, PublicJobSubmissionDetails, PublicSubmissionErrorCode } from './jobSubmission.types'
import './TechnicianJobSubmissionPage.css'
import { MAX_JOB_PHOTOS, prepareJobPhoto, removePendingJobPhoto, type PendingJobPhoto } from './jobPhoto'

const errorMessages: Record<PublicSubmissionErrorCode, string> = {
    invalid: 'This job card link is invalid.',
    expired: 'This job card link has expired. Please contact the office for a new link.',
    used: 'This job card has already been submitted.',
    unavailable: 'This job is unavailable. Please contact the office.',
    temporary: 'The job card service is temporarily unavailable. Please try again.',
}

const today = () => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type TimeEntryDraft = { date: string; hours: string; kilometres: string }
type PartDraft = { description: string; quantity: string }

const newTimeEntry = (): TimeEntryDraft => ({ date: today(), hours: '', kilometres: '' })
const newPart = (): PartDraft => ({ description: '', quantity: '' })

export default function TechnicianJobSubmissionPage() {
    const { token = '' } = useParams()
    const [job, setJob] = useState<PublicJobSubmissionDetails | null>(null)
    const [loadError, setLoadError] = useState<PublicSubmissionErrorCode | null>(null)
    const [story, setStory] = useState('')
    const [hourMeter, setHourMeter] = useState('')
    const [timeEntries, setTimeEntries] = useState<TimeEntryDraft[]>([])
    const [parts, setParts] = useState<PartDraft[]>([])
    const [furtherWorkRequired, setFurtherWorkRequired] = useState(false)
    const [furtherWorkDetails, setFurtherWorkDetails] = useState('')
    const [safetyIssueIdentified, setSafetyIssueIdentified] = useState(false)
    const [safetyIssueDetails, setSafetyIssueDetails] = useState('')
    const [photos, setPhotos] = useState<PendingJobPhoto[]>([])
    const [validation, setValidation] = useState('')
    const [busy, setBusy] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    useEffect(() => {
        let current = true
        void fetchPublicJobSubmission(token)
            .then((details) => { if (current) setJob(details) })
            .catch((error: unknown) => {
                if (current) setLoadError(error instanceof JobSubmissionError ? error.code : 'temporary')
            })
        return () => { current = false }
    }, [token])

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        const trimmedStory = story.trim()
        if (!trimmedStory) return setValidation('Enter the work completed or job story.')
        if (job?.requiresHourMeter && !hourMeter.trim()) return setValidation('Enter the current hour meter.')
        if (hourMeter && (!/^\d+$/.test(hourMeter) || Number(hourMeter) < (job?.currentHourMeter ?? 0))) {
            return setValidation(`Hour meter must be a whole number${job?.currentHourMeter != null ? ` of at least ${job.currentHourMeter}` : ''}.`)
        }
        const parsedTimeEntries: JobCardTimeEntryInput[] = timeEntries.map((entry) => ({
            date: entry.date,
            hours: Number(entry.hours),
            kilometres: Number(entry.kilometres),
        }))
        if (timeEntries.some((entry) => !entry.hours.trim() || !entry.kilometres.trim())
            || parsedTimeEntries.some((entry) => !entry.date || !Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 24
                || !Number.isSafeInteger(entry.kilometres) || entry.kilometres < 0)) {
            return setValidation('Check each time entry. Hours must be between 0 and 24 and kilometres must be a whole number.')
        }
        if (parts.some((part) => !part.description.trim() || !/^\d+$/.test(part.quantity)
            || Number(part.quantity) < 1 || !Number.isSafeInteger(Number(part.quantity)))) {
            return setValidation('Enter a part description and a whole quantity of at least 1 for each part.')
        }
        if (furtherWorkRequired && !furtherWorkDetails.trim()) return setValidation('Enter the further work details.')
        if (safetyIssueIdentified && !safetyIssueDetails.trim()) return setValidation('Enter the safety issue details.')
        setBusy(true)
        setValidation('')
        try {
            await submitPublicJobCard(token, {
                story: trimmedStory,
                hourMeter: hourMeter ? Number(hourMeter) : undefined,
                timeEntries: parsedTimeEntries,
                parts: parts.map((part) => ({ description: part.description.trim(), quantity: Number(part.quantity) })),
                furtherWorkRequired,
                furtherWorkDetails: furtherWorkRequired ? furtherWorkDetails.trim() : undefined,
                safetyIssueIdentified,
                safetyIssueDetails: safetyIssueIdentified ? safetyIssueDetails.trim() : undefined,
                photos: photos.map(({ fileName, mimeType, size, data }) => ({ fileName, mimeType, size, data })),
            })
            setSubmitted(true)
        } catch (error) {
            setValidation(error instanceof JobSubmissionError ? errorMessages[error.code] : errorMessages.temporary)
        } finally {
            setBusy(false)
        }
    }

    if (submitted) return <main className="technician-portal"><section className="technician-portal-card technician-portal-message">
        <span className="technician-portal-mark" aria-hidden="true">✓</span>
        <h1>Job card submitted</h1>
        <p>Your job information has been sent to the office for review.</p>
        <p>You may now close this page.</p>
    </section></main>

    if (loadError) return <main className="technician-portal"><section className="technician-portal-card technician-portal-message">
        <h1>Job card unavailable</h1><p>{errorMessages[loadError]}</p>
    </section></main>

    if (!job) return <main className="technician-portal"><section className="technician-portal-card technician-portal-message" aria-live="polite">
        <h1>Loading job card…</h1>
    </section></main>

    return <main className="technician-portal">
        <section className="technician-portal-card">
            <header><p>Service Operations</p><h1>Job {job.jobNumber}</h1></header>
            <dl>
                {job.equipmentDisplayName && <div><dt>Equipment</dt><dd>{job.equipmentDisplayName}</dd></div>}
                {job.fleetNumber && <div><dt>Fleet number</dt><dd>{job.fleetNumber}</dd></div>}
                {job.customerName && <div><dt>Customer</dt><dd>{job.customerName}</dd></div>}
                {job.siteName && <div><dt>Site</dt><dd>{job.siteName}</dd></div>}
                {job.workRequired && <div className="wide"><dt>Work required</dt><dd>{job.workRequired}</dd></div>}
            </dl>
            <form onSubmit={submit}>
                <label>Current Hour Meter{job.requiresHourMeter && ' *'}
                    <input type="number" min={job.currentHourMeter ?? 0} step="1" inputMode="numeric" value={hourMeter} onChange={(event) => setHourMeter(event.target.value)} required={job.requiresHourMeter} />
                </label>
                <label>Job Story / Work Completed *
                    <textarea rows={7} value={story} onChange={(event) => setStory(event.target.value)} required />
                </label>
                <fieldset className="technician-repeatable">
                    <legend>Time &amp; Travel</legend>
                    {timeEntries.map((entry, index) => <div className="technician-repeatable-row time-entry" key={index}>
                        <label>Date<input type="date" value={entry.date} onChange={(event) => setTimeEntries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item))} required /></label>
                        <label>Total Hours<input type="number" min="0" max="24" step="0.25" inputMode="decimal" value={entry.hours} placeholder="Enter hours" onChange={(event) => setTimeEntries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, hours: event.target.value } : item))} required /></label>
                        <label>Kilometres<input type="number" min="0" step="1" inputMode="numeric" value={entry.kilometres} placeholder="Enter km" onChange={(event) => setTimeEntries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, kilometres: event.target.value } : item))} required /></label>
                        <button type="button" className="technician-remove-row" onClick={() => setTimeEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                    </div>)}
                    <button type="button" className="technician-add-row" onClick={() => setTimeEntries((current) => [...current, newTimeEntry()])}>+ Add time entry</button>
                </fieldset>
                <fieldset className="technician-repeatable">
                    <legend>Parts</legend>
                    {parts.map((part, index) => <div className="technician-repeatable-row part-entry" key={index}>
                        <label>Part<input type="text" maxLength={500} value={part.description} onChange={(event) => setParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} required /></label>
                        <label>Quantity<input type="number" min="1" step="1" inputMode="numeric" value={part.quantity} placeholder="Qty" onChange={(event) => setParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} required /></label>
                        <button type="button" className="technician-remove-row" onClick={() => setParts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                    </div>)}
                    <button type="button" className="technician-add-row" onClick={() => setParts((current) => [...current, newPart()])}>+ Add part</button>
                </fieldset>
                <div className="technician-conditional">
                    <label className="technician-checkbox"><input type="checkbox" checked={furtherWorkRequired} onChange={(event) => setFurtherWorkRequired(event.target.checked)} />Further work required</label>
                    {furtherWorkRequired && <label>Further work details *<textarea rows={4} value={furtherWorkDetails} onChange={(event) => setFurtherWorkDetails(event.target.value)} required /></label>}
                </div>
                <fieldset className="technician-repeatable technician-photos">
                    <legend>Photos</legend>
                    <p>Add up to 20 photos from your camera or photo library.</p>
                    {photos.length > 0 && <div className="technician-photo-grid">
                        {photos.map((photo) => <figure key={photo.id}>
                            <img src={photo.previewUrl} alt={photo.fileName} />
                            <figcaption>{photo.fileName}</figcaption>
                            <button type="button" className="technician-remove-row" onClick={() => setPhotos((current) => removePendingJobPhoto(current, photo.id))}>Remove</button>
                        </figure>)}
                    </div>}
                    <div className="technician-photo-actions">
                        <label className="technician-photo-picker">
                            Take photo
                            <input
                                type="file"
                                accept="image/*,.heic,.heif"
                                capture="environment"
                                disabled={photos.length >= MAX_JOB_PHOTOS}
                                onChange={(event) => {
                                    const files = Array.from(event.target.files ?? [])
                                    event.target.value = ''
                                    if (photos.length + files.length > MAX_JOB_PHOTOS) {
                                        setValidation('A maximum of 20 photos may be attached.')
                                        return
                                    }
                                    void Promise.all(files.map(prepareJobPhoto)).then((prepared) => {
                                        setPhotos((current) => [...current, ...prepared])
                                        setValidation('')
                                    }).catch((error: unknown) => setValidation(error instanceof Error ? error.message : 'A photo could not be added.'))
                                }}
                            />
                        </label>
                        <label className="technician-photo-picker">
                            Choose photos
                            <input
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                disabled={photos.length >= MAX_JOB_PHOTOS}
                                onChange={(event) => {
                                const files = Array.from(event.target.files ?? [])
                                event.target.value = ''
                                if (photos.length + files.length > MAX_JOB_PHOTOS) {
                                    setValidation('A maximum of 20 photos may be attached.')
                                    return
                                }
                                void Promise.all(files.map(prepareJobPhoto)).then((prepared) => {
                                    setPhotos((current) => [...current, ...prepared])
                                    setValidation('')
                                }).catch((error: unknown) => setValidation(error instanceof Error ? error.message : 'A photo could not be added.'))
                                }}
                            />
                        </label>
                    </div>
                </fieldset>
                <div className="technician-conditional">
                    <label className="technician-checkbox"><input type="checkbox" checked={safetyIssueIdentified} onChange={(event) => setSafetyIssueIdentified(event.target.checked)} />Safety issue identified</label>
                    {safetyIssueIdentified && <label>Safety issue details *<textarea rows={4} value={safetyIssueDetails} onChange={(event) => setSafetyIssueDetails(event.target.value)} required /></label>}
                </div>
                {validation && <p className="technician-portal-error" role="alert">{validation}</p>}
                <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Job Card'}</button>
            </form>
        </section>
    </main>
}
