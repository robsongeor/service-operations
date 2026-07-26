import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
    fetchPublicSiteCheckAssignment,
    submitPublicSiteCheckJob,
    type PublicSiteCheckAssignment,
} from '../site-checks/services/siteCheckAssignmentApi'
import {
    MAX_JOB_PHOTOS,
    prepareJobPhoto,
    removePendingJobPhoto,
    type PendingJobPhoto,
} from './jobPhoto'
import './TechnicianJobSubmissionPage.css'

const equipmentLabel = (job: PublicSiteCheckAssignment['jobs'][number]) =>
    job.equipment?.fleet
    || [job.equipment?.make, job.equipment?.model].filter(Boolean).join(' ')
    || job.equipment?.serial
    || 'Equipment'

export default function SiteCheckAssignmentPage() {
    const { token = '' } = useParams()
    const [assignment, setAssignment] = useState<PublicSiteCheckAssignment | null>(null)
    const [error, setError] = useState('')
    const [selectedJobId, setSelectedJobId] = useState('')
    const [answers, setAnswers] = useState<Record<string, {
        choiceAnswer?: number
        numericAnswer?: string
        comment?: string
    }>>({})
    const [story, setStory] = useState('')
    const [search, setSearch] = useState('')
    const [timeDate, setTimeDate] = useState(new Date().toISOString().slice(0, 10))
    const [timeHours, setTimeHours] = useState('')
    const [kilometres, setKilometres] = useState('0')
    const [partsText, setPartsText] = useState('')
    const [photos, setPhotos] = useState<PendingJobPhoto[]>([])
    const [busy, setBusy] = useState(false)
    const [validation, setValidation] = useState('')
    const hasUnsavedInput = Boolean(
        story.trim()
        || partsText.trim()
        || timeHours.trim()
        || photos.length > 0
        || Object.keys(answers).length > 0,
    )

    useEffect(() => {
        let current = true
        void fetchPublicSiteCheckAssignment(token)
            .then((result) => {
                if (current) {
                    setAssignment(result)
                    setSelectedJobId(result.jobs[0]?.jobId ?? '')
                }
            })
            .catch((cause: unknown) => {
                if (current) setError(cause instanceof Error
                    ? cause.message
                    : 'This Site Check assignment is unavailable.')
            })
        return () => { current = false }
    }, [token])

    useEffect(() => {
        if (!hasUnsavedInput) return
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [hasUnsavedInput])

    if (error) return <main className="technician-portal">
        <section className="technician-portal-card technician-portal-message">
            <h1>Site Check unavailable</h1>
            <p>{error}</p>
        </section>
    </main>

    if (!assignment) return <main className="technician-portal">
        <section className="technician-portal-card technician-portal-message" aria-live="polite">
            <h1>Loading Site Checkâ€¦</h1>
        </section>
    </main>

    const selectedJob = assignment.jobs.find((job) => job.jobId === selectedJobId)
        ?? assignment.jobs[0]
    const checklistGroups = selectedJob?.checklist.reduce<Map<string, typeof selectedJob.checklist>>(
        (groups, item) => {
            const group = groups.get(item.groupName) ?? []
            group.push(item)
            groups.set(item.groupName, group)
            return groups
        },
        new Map(),
    ) ?? new Map()
    const visibleJobs = assignment.jobs.filter((job) => {
        const query = search.trim().toLowerCase()
        return !query || [
            equipmentLabel(job),
            job.jobNumber,
            job.equipment?.serial,
        ].some((value) => value?.toLowerCase().includes(query))
    })
    const selectJob = (jobId: string, force = false) => {
        if (!force && jobId !== selectedJobId && hasUnsavedInput
            && !window.confirm('Discard the unsaved answers for this machine?')) return
        setSelectedJobId(jobId)
        setAnswers({})
        setStory('')
        setTimeHours('')
        setKilometres('0')
        setPartsText('')
        setPhotos((current) => {
            current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
            return []
        })
        setValidation('')
    }
    const submit = async () => {
        if (!selectedJob) return
        setBusy(true)
        setValidation('')
        try {
            await submitPublicSiteCheckJob(token, {
                jobId: selectedJob.jobId,
                story,
                timeEntries: timeHours.trim() ? [{
                    date: timeDate,
                    hours: Number(timeHours),
                    kilometres: Number(kilometres),
                }] : [],
                parts: partsText.split('\n').map((part) => part.trim()).filter(Boolean),
                photos: photos.map(({ fileName, mimeType, size, data }) => ({
                    fileName,
                    mimeType,
                    size,
                    data,
                })),
                responses: selectedJob.checklist.map((item) => ({
                    snapshotItemId: item.snapshotItemId,
                    ...(item.responseType === 122830002
                        ? (answers[item.snapshotItemId]?.numericAnswer
                            ? { numericAnswer: Number(answers[item.snapshotItemId]?.numericAnswer) }
                            : {})
                        : { choiceAnswer: answers[item.snapshotItemId]?.choiceAnswer }),
                    comment: answers[item.snapshotItemId]?.comment,
                })),
            })
            const nextJobs = assignment.jobs.map((job) => job.jobId === selectedJob.jobId
                ? { ...job, jobCardStatus: 122830002 }
                : job)
            setAssignment({ ...assignment, jobs: nextJobs })
            const next = nextJobs.find((job) => job.jobCardStatus !== 122830002)
            selectJob(next?.jobId ?? selectedJob.jobId, true)
        } catch (cause) {
            setValidation(cause instanceof Error
                ? cause.message
                : 'This machine Job Card could not be submitted.')
        } finally {
            setBusy(false)
        }
    }

    return <main className="technician-portal">
        <section className="technician-portal-card">
            <header>
                <p>Service Operations</p>
                <h1>{assignment.siteCheckName || 'Site Check'}</h1>
            </header>
            <dl>
                {assignment.customerName && <div><dt>Customer</dt><dd>{assignment.customerName}</dd></div>}
                {assignment.siteName && <div><dt>Site</dt><dd>{assignment.siteName}</dd></div>}
                {assignment.technicianName && <div><dt>Technician</dt><dd>{assignment.technicianName}</dd></div>}
                {assignment.dueDate && <div><dt>Due date</dt><dd>{assignment.dueDate}</dd></div>}
                <div><dt>Equipment Jobs</dt><dd>{assignment.jobs.length} of {assignment.expectedJobCount}</dd></div>
            </dl>
            <section aria-labelledby="site-check-machines">
                <h2 id="site-check-machines">Machines</h2>
                <label>Search machines
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Fleet, serial, or Job number"
                    />
                </label>
                <div className="technician-repeatable" role="list">
                    {visibleJobs.map((job) => <article key={job.jobId} className="technician-repeatable-row">
                        <div>
                            <strong>{equipmentLabel(job)}</strong>
                            <p>Job {job.jobNumber || 'number unavailable'}</p>
                            <p>{job.checklist.length} checklist items</p>
                        </div>
                        <button
                            type="button"
                            aria-pressed={selectedJob?.jobId === job.jobId}
                            onClick={() => selectJob(job.jobId)}
                        >
                            {job.jobCardStatus === 122830002
                                ? 'Submitted'
                                : selectedJob?.jobId === job.jobId ? 'Viewing' : 'Open checklist'}
                        </button>
                    </article>)}
                </div>
            </section>
            {selectedJob && <section aria-labelledby="site-check-machine-checklist">
                <h2 id="site-check-machine-checklist">{equipmentLabel(selectedJob)}</h2>
                <p>Job {selectedJob.jobNumber || 'number unavailable'}</p>
                {selectedJob.description && <p>{selectedJob.description}</p>}
                {selectedJob.jobCardStatus === 122830002
                    ? <p>This machine Job Card has been submitted.</p>
                    : selectedJob.checklist.length === 0
                    ? <p role="alert">This machine does not have a checklist snapshot.</p>
                    : [...checklistGroups].map(([groupName, items]) => <section
                        key={groupName}
                        className="technician-portal-section"
                        aria-labelledby={`checklist-${groupName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
                    >
                        <h3 id={`checklist-${groupName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
                            {groupName}
                        </h3>
                        <ol>
                            {items.map((item) => <li key={item.snapshotItemId}>
                                <fieldset disabled={busy}>
                                    <legend>{item.prompt}</legend>
                                    {item.responseType === 122830002
                                        ? <label>Service meter reading
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                required
                                                value={answers[item.snapshotItemId]?.numericAnswer ?? ''}
                                                onChange={(event) => setAnswers((current) => ({
                                                    ...current,
                                                    [item.snapshotItemId]: {
                                                        ...current[item.snapshotItemId],
                                                        numericAnswer: event.target.value,
                                                    },
                                                }))}
                                            />
                                        </label>
                                        : <div>
                                            {[['Pass', 122830000], ['Fail', 122830001], ['Not applicable', 122830002]].map(([label, value]) =>
                                                <label key={value}>
                                                    <input
                                                        type="radio"
                                                        name={`answer-${item.snapshotItemId}`}
                                                        required
                                                        checked={answers[item.snapshotItemId]?.choiceAnswer === value}
                                                        onChange={() => setAnswers((current) => ({
                                                            ...current,
                                                            [item.snapshotItemId]: {
                                                                ...current[item.snapshotItemId],
                                                                choiceAnswer: value as number,
                                                            },
                                                        }))}
                                                    />
                                                    {label}
                                                </label>)}
                                        </div>}
                                    <label>Comment{item.commentRequiredOnNegative ? ' (required on Fail)' : ''}
                                        <textarea
                                            rows={2}
                                            value={answers[item.snapshotItemId]?.comment ?? ''}
                                            onChange={(event) => setAnswers((current) => ({
                                                ...current,
                                                [item.snapshotItemId]: {
                                                    ...current[item.snapshotItemId],
                                                    comment: event.target.value,
                                                },
                                            }))}
                                        />
                                    </label>
                                </fieldset>
                            </li>)}
                        </ol>
                    </section>)}
                {selectedJob.jobCardStatus !== 122830002 && selectedJob.checklist.length > 0 && <>
                    <label>Job Card story *
                        <textarea rows={4} required value={story} onChange={(event) => setStory(event.target.value)} />
                    </label>
                    <fieldset disabled={busy}>
                        <legend>Time</legend>
                        <label>Date
                            <input type="date" value={timeDate} onChange={(event) => setTimeDate(event.target.value)} />
                        </label>
                        <label>Hours
                            <input type="number" min="0" max="24" step="0.25" value={timeHours} onChange={(event) => setTimeHours(event.target.value)} />
                        </label>
                        <label>Kilometres
                            <input type="number" min="0" step="1" value={kilometres} onChange={(event) => setKilometres(event.target.value)} />
                        </label>
                    </fieldset>
                    <label>Parts used (one per line)
                        <textarea rows={4} value={partsText} onChange={(event) => setPartsText(event.target.value)} />
                    </label>
                    <fieldset className="technician-repeatable technician-photos" disabled={busy}>
                        <legend>Photos</legend>
                        <p>Add up to 20 optional photos.</p>
                        {photos.length > 0 && <div className="technician-photo-grid">
                            {photos.map((photo) => <figure key={photo.id}>
                                <img src={photo.previewUrl} alt={photo.fileName} />
                                <figcaption>{photo.fileName}</figcaption>
                                <button
                                    type="button"
                                    className="technician-remove-row"
                                    onClick={() => setPhotos((current) =>
                                        removePendingJobPhoto(current, photo.id))}
                                >
                                    Remove
                                </button>
                            </figure>)}
                        </div>}
                        <label className="technician-photo-picker">
                            + Add Photo
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
                                capture="environment"
                                multiple
                                disabled={photos.length >= MAX_JOB_PHOTOS}
                                onChange={(event) => {
                                    const files = Array.from(event.target.files ?? [])
                                    event.target.value = ''
                                    if (photos.length + files.length > MAX_JOB_PHOTOS) {
                                        setValidation('A maximum of 20 photos may be attached.')
                                        return
                                    }
                                    void Promise.all(files.map(prepareJobPhoto))
                                        .then((prepared) => {
                                            setPhotos((current) => [...current, ...prepared])
                                            setValidation('')
                                        })
                                        .catch((cause: unknown) => setValidation(
                                            cause instanceof Error
                                                ? cause.message
                                                : 'A photo could not be added.',
                                        ))
                                }}
                            />
                        </label>
                    </fieldset>
                    {validation && <p className="technician-portal-error" role="alert">{validation}</p>}
                    <button type="button" disabled={busy} onClick={() => void submit()}>
                        {busy ? 'Submitting…' : 'Submit machine Job Card'}
                    </button>
                    <p>Submitting the Job Card does not complete the operational Job.</p>
                </>}
            </section>}
        </section>
    </main>
}
