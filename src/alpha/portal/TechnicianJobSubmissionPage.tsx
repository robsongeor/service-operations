import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPublicJobSubmission, JobSubmissionError, submitPublicJobCard } from './jobSubmissionApi'
import type { PublicJobSubmissionDetails, PublicSubmissionErrorCode } from './jobSubmission.types'
import './TechnicianJobSubmissionPage.css'

const errorMessages: Record<PublicSubmissionErrorCode, string> = {
    invalid: 'This job card link is invalid.',
    expired: 'This job card link has expired. Please contact the office for a new link.',
    used: 'This job card has already been submitted.',
    unavailable: 'This job is unavailable. Please contact the office.',
    temporary: 'The job card service is temporarily unavailable. Please try again.',
}

export default function TechnicianJobSubmissionPage() {
    const { token = '' } = useParams()
    const [job, setJob] = useState<PublicJobSubmissionDetails | null>(null)
    const [loadError, setLoadError] = useState<PublicSubmissionErrorCode | null>(null)
    const [story, setStory] = useState('')
    const [hourMeter, setHourMeter] = useState('')
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
        setBusy(true)
        setValidation('')
        try {
            await submitPublicJobCard(token, trimmedStory, hourMeter ? Number(hourMeter) : undefined)
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
                {validation && <p className="technician-portal-error" role="alert">{validation}</p>}
                <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Job Card'}</button>
            </form>
        </section>
    </main>
}
