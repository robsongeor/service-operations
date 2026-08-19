import { useCallback, useMemo, useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import type { JobAssignment } from '../types/jobAssignment.types'
import type { JobCardSubmission } from '../types/jobCardSubmission.types'
import { JOB_CARD_SUBMISSION_ROLES } from '../types/jobCardSubmission.types'
import { canBeAssignedJobs } from '../../mechanics/staffDirectory.ts'
import { getJobCardStatus, JOB_CARD_STATUSES, JOB_CARD_STATUS_OPTIONS, type JobCardStatus } from '../types/jobCardStatus.types'
import { JOB_NUMBER_REQUIRED_EMAIL_MESSAGE, jobHasEmailableJobNumber } from '../services/jobEmailRules'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import { formatTechnicianSubmissionHourMeter, hasTechnicianSubmission } from '../types/technicianSubmission'
import { downloadSubmittedJobSheet } from '../services/submittedJobSheetPdf'
import { jobEmailSendingAllowedForHostname, LOCAL_JOB_EMAIL_DISABLED_MESSAGE } from '../services/jobEmail'
import { useOperationalQuery } from '../../shared/data/useOperationalQuery'
import { jobPhotoBodyQueryKey } from '../../shared/data/operationalCollectionKeys'

type Props = {
    job: Job
    mechanics: Mechanic[]
    assignments: JobAssignment[]
    onStatusChange: (jobId: string, status: JobCardStatus) => Promise<void>
    onCreateAssignment: (assignment: { jobId: string; mechanicId: string; mechanicName: string; instructions?: string }) => Promise<void>
    onSendPrimary: (job: Job) => Promise<void>
    onSendAssignment: (job: Job, assignment: JobAssignment) => Promise<void>
    onDeleteAssignment: (assignmentId: string) => Promise<void>
    onLoadPhoto?: (photoId: string, signal?: AbortSignal) => Promise<string>
}

const formatEntryDate = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split('-')
    return year && month && day ? `${day}/${month}/${year}` : value
}

function Evidence({ submission, onPhoto }: { submission: JobCardSubmission; onPhoto: (id: string) => void }) {
    return <div className="job-card-evidence">
        <div className="job-card-evidence-metrics">
            {submission.gr_hourmeter != null && <div><span>Hour meter</span><strong>{formatTechnicianSubmissionHourMeter(submission.gr_hourmeter)}</strong></div>}
            {submission.timeEntries.length > 0 && <div><span>Total hours</span><strong>{submission.timeEntries.reduce((sum, entry) => sum + entry.hours, 0).toLocaleString('en-NZ')}</strong></div>}
            {submission.timeEntries.some((entry) => entry.kilometres > 0) && <div><span>Kilometres</span><strong>{submission.timeEntries.reduce((sum, entry) => sum + entry.kilometres, 0).toLocaleString('en-NZ')}</strong></div>}
            {submission.parts.length > 0 && <div><span>Parts</span><strong>{submission.parts.reduce((sum, part) => sum + part.quantity, 0)}</strong></div>}
        </div>
        {submission.gr_story?.trim() && <section className="job-card-evidence-block"><h4>Work completed</h4><p>{submission.gr_story.trim()}</p></section>}
        {submission.timeEntries.length > 0 && <section className="job-card-evidence-block"><h4>Time &amp; travel</h4><div className="job-card-evidence-table">
            {submission.timeEntries.map((entry) => <div key={entry.id}><span>{formatEntryDate(entry.date)}</span><strong>{entry.hours.toLocaleString('en-NZ')} h</strong><span>{entry.kilometres.toLocaleString('en-NZ')} km</span></div>)}
        </div></section>}
        {submission.parts.length > 0 && <section className="job-card-evidence-block"><h4>Parts used</h4><div className="job-card-parts-table">
            {submission.parts.map((part) => <div key={part.id}><strong>{part.quantity} &times;</strong><span>{part.part}</span></div>)}
        </div></section>}
        {submission.gr_furtherworkrequired && <section className="job-card-evidence-alert further"><h4>Further work required</h4><p>{submission.gr_furtherworkdetails?.trim() || 'Details not supplied'}</p></section>}
        {submission.gr_safetyissueidentified && <section className="job-card-evidence-alert safety"><h4>Safety issue</h4><p>{submission.gr_safetyissuedetails?.trim() || 'Details not supplied'}</p></section>}
        {submission.photos.length > 0 && <section className="job-card-evidence-block"><h4>Photos</h4><div className="manager-job-photo-grid">
            {submission.photos.map((photo) => <button type="button" key={photo.id} onClick={() => onPhoto(photo.id)} aria-label={`Open ${photo.fileName}`}>
                <span className="manager-job-photo-placeholder" aria-hidden="true">Photo</span>
                <span>{photo.fileName}</span>
            </button>)}
        </div></section>}
    </div>
}

type CardProps = {
    name: string
    email?: string | null
    label: string
    status: JobCardStatus
    submission?: JobCardSubmission
    isBusy: boolean
    canSend: boolean
    expanded: boolean
    onToggle: () => void
    onSend: () => void
    onRemove?: () => void
    onPhoto: (id: string) => void
    onDownload?: () => void
    isPdfBusy?: boolean
    allowSend?: boolean
}

function TechnicianCard({ name, email, label, status, submission, isBusy, canSend, expanded, onToggle, onSend, onRemove, onPhoto, onDownload, isPdfBusy, allowSend = true }: CardProps) {
    const statusLabel = JOB_CARD_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Not sent'
    const submitted = status === JOB_CARD_STATUSES.SUBMITTED || Boolean(submission?.gr_submittedon)
    return <article className={`job-card-person ${expanded ? 'expanded' : ''}`}>
        <div className="job-card-person-row">
            <button type="button" className="job-card-person-main" onClick={onToggle} aria-expanded={expanded} disabled={!submission}>
                <span className="job-card-person-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase() || '?'}</span>
                <span><strong>{name}</strong><small>{label}{email ? ` · ${email}` : ''}</small></span>
            </button>
            <span className={`job-card-current status-${status}`}>{statusLabel}</span>
            <div className="job-card-person-actions">
                {submitted && submission && onDownload && <button type="button" disabled={isPdfBusy} onClick={onDownload}>{isPdfBusy ? 'Preparing...' : 'Download PDF'}</button>}
                {submission && <button type="button" onClick={onToggle}>{expanded ? 'Hide' : 'View'}</button>}
                {allowSend && <button type="button" className="primary" disabled={isBusy || !canSend} onClick={onSend}>{isBusy ? 'Sending…' : submitted ? 'Send again' : status === JOB_CARD_STATUSES.SENT ? 'Resend' : 'Send'}</button>}
                {onRemove && !submitted && <button type="button" className="danger" disabled={isBusy} onClick={onRemove}>Remove</button>}
            </div>
        </div>
        {expanded && submission && <Evidence submission={submission} onPhoto={onPhoto} />}
    </article>
}

function legacySubmission(job: Job): JobCardSubmission | undefined {
    if (!hasTechnicianSubmission(job)) return undefined
    return {
        gr_jobcardsubmissionid: 'legacy', gr_name: 'Original technician submission',
        gr_recipientname: job.gr_Mechanic?.gr_name, gr_recipientemail: job.gr_Mechanic?.gr_email,
        gr_role: JOB_CARD_SUBMISSION_ROLES.LEGACY, gr_status: JOB_CARD_STATUSES.SUBMITTED,
        gr_submittedon: job.gr_techniciansubmissionsubmittedon, gr_hourmeter: job.gr_techniciansubmissionhourmeter,
        gr_story: job.gr_techniciansubmissionstory, gr_furtherworkrequired: job.gr_techniciansubmissionfurtherworkrequired,
        gr_furtherworkdetails: job.gr_techniciansubmissionfurtherworkdetails,
        gr_safetyissueidentified: job.gr_techniciansubmissionsafetyissueidentified,
        gr_safetyissuedetails: job.gr_techniciansubmissionsafetyissuedetails, gr_islegacy: true,
        _gr_job_value: job.gr_jobid, timeEntries: job.technicianSubmissionTimeEntries ?? [],
        parts: job.technicianSubmissionParts ?? [], photos: job.jobPhotos ?? [],
    }
}

export default function JobCardFields({ job, mechanics, assignments, onStatusChange, onCreateAssignment, onSendPrimary, onSendAssignment, onDeleteAssignment, onLoadPhoto }: Props) {
    const [isUpdating, setIsUpdating] = useState(false)
    const [busyId, setBusyId] = useState('')
    const [showAssignmentForm, setShowAssignmentForm] = useState(false)
    const [mechanicId, setMechanicId] = useState('')
    const [error, setError] = useState('')
    const [pendingEmail, setPendingEmail] = useState<'primary' | JobAssignment | null>(null)
    const [expandedId, setExpandedId] = useState('')
    const [preview, setPreview] = useState<{ submission: JobCardSubmission; photoId: string } | null>(null)
    const [pdfBusyId, setPdfBusyId] = useState('')
    const previewPhoto = preview?.submission.photos.find((item) => item.id === preview.photoId)
    const previewPhotoId = previewPhoto?.id ?? ''
    const existingPreviewPhotoUrl = previewPhoto?.previewUrl
    const previewPhotoKey = useMemo(() => jobPhotoBodyQueryKey(previewPhotoId || 'none'), [previewPhotoId])
    const previewPhotoLoader = useCallback(async ({ signal }: { signal: AbortSignal }) => {
        if (existingPreviewPhotoUrl) return existingPreviewPhotoUrl
        if (!onLoadPhoto || !previewPhotoId) throw new Error('The Job Card photo loader is unavailable.')
        return onLoadPhoto(previewPhotoId, signal)
    }, [existingPreviewPhotoUrl, onLoadPhoto, previewPhotoId])
    const previewPhotoQuery = useOperationalQuery<string>({
        key: previewPhotoKey,
        enabled: Boolean(previewPhotoId && !existingPreviewPhotoUrl && onLoadPhoto),
        queryFn: previewPhotoLoader,
        staleTimeMs: 5 * 60_000,
        cacheTimeMs: 30_000,
    })
    const previewPhotoUrl = existingPreviewPhotoUrl ?? previewPhotoQuery.data
    const hasJobNumber = jobHasEmailableJobNumber(job)
    const localSendingDisabled = !jobEmailSendingAllowedForHostname(window.location.hostname)
    const submissions = useMemo(() => {
        const normalized = job.jobCardSubmissions ?? []
        const old = legacySubmission(job)
        return old && !normalized.some((item) => item.gr_islegacy) ? [...normalized, old] : normalized
    }, [job])
    const primarySubmission = [...submissions].reverse().find((item) => item.gr_role === JOB_CARD_SUBMISSION_ROLES.PRIMARY)
    const legacy = submissions.find((item) => item.gr_role === JOB_CARD_SUBMISSION_ROLES.LEGACY)
    const latestSubmissionIds = new Set([
        (primarySubmission ?? legacy)?.gr_jobcardsubmissionid,
        ...assignments.map((assignment) => [...submissions].reverse().find(
            (item) => item._gr_jobassignment_value === assignment.gr_jobassignmentid,
        )?.gr_jobcardsubmissionid),
    ].filter((id): id is string => Boolean(id)))
    const previousSubmissions = submissions.filter((item) =>
        !latestSubmissionIds.has(item.gr_jobcardsubmissionid)
        && (item.gr_status === JOB_CARD_STATUSES.SUBMITTED || item.gr_status === JOB_CARD_STATUSES.CLOSED || Boolean(item.gr_submittedon)),
    )
    const requiredCount = 1 + assignments.length
    const submittedCount = (primarySubmission?.gr_status === JOB_CARD_STATUSES.SUBMITTED || (!primarySubmission && legacy) ? 1 : 0) + assignments.filter((assignment) =>
        [...submissions].reverse().find((item) => item._gr_jobassignment_value === assignment.gr_jobassignmentid)?.gr_status === JOB_CARD_STATUSES.SUBMITTED,
    ).length
    const progressLabel = getJobCardStatus(job.gr_jobcardstatus) === JOB_CARD_STATUSES.CLOSED
        ? 'Closed'
        : submittedCount === requiredCount ? 'Ready for office'
            : submittedCount > 0 ? 'Partially submitted'
                : submissions.some((item) => item.gr_status === JOB_CARD_STATUSES.SENT) ? 'Awaiting technicians' : 'Not sent'

    const performSend = async (target: 'primary' | JobAssignment) => {
        if (localSendingDisabled) return setError(LOCAL_JOB_EMAIL_DISABLED_MESSAGE)
        const email = target === 'primary' ? job.gr_Mechanic?.gr_email : target.gr_Mechanic?.gr_email
        if (!hasJobNumber) return setError(JOB_NUMBER_REQUIRED_EMAIL_MESSAGE)
        if (!email) return setError('This technician needs an email address before the job can be sent.')
        const id = target === 'primary' ? 'primary' : target.gr_jobassignmentid
        if (target === 'primary') setIsUpdating(true)
        else setBusyId(id)
        setError('')
        try {
            if (target === 'primary') await onSendPrimary(job)
            else await onSendAssignment(job, target)
        }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'The Job Card could not be sent.') }
        finally { setIsUpdating(false); setBusyId(''); setPendingEmail(null) }
    }
    const requestSend = (target: 'primary' | JobAssignment, status: JobCardStatus) => {
        if (status !== JOB_CARD_STATUSES.NOT_SENT) setPendingEmail(target)
        else void performSend(target)
    }
    const addAssignment = async () => {
        const mechanic = mechanics.find((item) => item.gr_mechanicid === mechanicId)
        if (!mechanic) return setError('Choose a technician first.')
        setIsUpdating(true); setError('')
        try { await onCreateAssignment({ jobId: job.gr_jobid, mechanicId, mechanicName: mechanic.gr_name }); setMechanicId(''); setShowAssignmentForm(false) }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'The technician could not be assigned.') }
        finally { setIsUpdating(false) }
    }
    const removeAssignment = async (assignment: JobAssignment) => {
        if (!window.confirm(`Remove ${assignment.gr_Mechanic?.gr_name ?? 'this technician'} from this Job Card?`)) return
        setBusyId(assignment.gr_jobassignmentid)
        try { await onDeleteAssignment(assignment.gr_jobassignmentid) }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'The assignment could not be removed.') }
        finally { setBusyId('') }
    }
    const showPhoto = (submission: JobCardSubmission, photoId: string) => setPreview({ submission, photoId })
    const downloadPdf = async (submission: JobCardSubmission) => {
        setPdfBusyId(submission.gr_jobcardsubmissionid)
        setError('')
        try { await downloadSubmittedJobSheet(job, submission) }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'The filled Job sheet could not be created.') }
        finally { setPdfBusyId('') }
    }

    return <>
        <div className="job-card-layout">
            <header className="job-card-overview">
                <div><span>Job Card progress</span><strong>{submittedCount} of {requiredCount} submitted</strong><small>{progressLabel}</small></div>
                <label><span>Office status</span><select value={getJobCardStatus(job.gr_jobcardstatus)} disabled={isUpdating} onChange={(event) => void onStatusChange(job.gr_jobid, Number(event.target.value) as JobCardStatus)}>{JOB_CARD_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </header>
            {localSendingDisabled && <p className="job-card-local-send-warning" role="status">{LOCAL_JOB_EMAIL_DISABLED_MESSAGE}</p>}

            <section className="job-card-people" aria-label="Technician Job Cards">
                <TechnicianCard
                    name={job.gr_Mechanic?.gr_name ?? 'No primary technician'} email={job.gr_Mechanic?.gr_email} label="Primary technician"
                    status={primarySubmission?.gr_status ?? (legacy ? JOB_CARD_STATUSES.SUBMITTED : getJobCardStatus(job.gr_jobcardstatus))}
                    submission={primarySubmission ?? legacy} isBusy={isUpdating} canSend={!localSendingDisabled && hasJobNumber && Boolean(job.gr_Mechanic?.gr_email)}
                    expanded={expandedId === (primarySubmission ?? legacy)?.gr_jobcardsubmissionid}
                    onToggle={() => setExpandedId((current) => current ? '' : (primarySubmission ?? legacy)?.gr_jobcardsubmissionid ?? '')}
                    onSend={() => requestSend('primary', primarySubmission?.gr_status ?? getJobCardStatus(job.gr_jobcardstatus))}
                    onPhoto={(id) => (primarySubmission ?? legacy) && showPhoto((primarySubmission ?? legacy)!, id)}
                    onDownload={(primarySubmission ?? legacy) ? () => void downloadPdf((primarySubmission ?? legacy)!) : undefined}
                    isPdfBusy={pdfBusyId === (primarySubmission ?? legacy)?.gr_jobcardsubmissionid}
                />
                {assignments.map((assignment) => {
                    const submission = [...submissions].reverse().find((item) => item._gr_jobassignment_value === assignment.gr_jobassignmentid)
                    const status = submission?.gr_status ?? getJobCardStatus(assignment.gr_jobcardstatus)
                    return <TechnicianCard key={assignment.gr_jobassignmentid} name={assignment.gr_Mechanic?.gr_name ?? 'Unknown technician'} email={assignment.gr_Mechanic?.gr_email} label="Additional technician"
                        status={status} submission={submission} isBusy={busyId === assignment.gr_jobassignmentid} canSend={!localSendingDisabled && hasJobNumber && Boolean(assignment.gr_Mechanic?.gr_email)}
                        expanded={expandedId === submission?.gr_jobcardsubmissionid} onToggle={() => setExpandedId((current) => current ? '' : submission?.gr_jobcardsubmissionid ?? '')}
                        onSend={() => requestSend(assignment, status)} onRemove={() => void removeAssignment(assignment)} onPhoto={(id) => submission && showPhoto(submission, id)}
                        onDownload={submission ? () => void downloadPdf(submission) : undefined} isPdfBusy={pdfBusyId === submission?.gr_jobcardsubmissionid} />
                })}
            </section>

            {previousSubmissions.length > 0 && <section className="job-card-people" aria-label="Previous technician Job Cards">
                <h4>Previous submissions</h4>
                {[...previousSubmissions].reverse().map((submission) => <TechnicianCard
                    key={submission.gr_jobcardsubmissionid}
                    name={submission.gr_recipientname || 'Technician'} email={submission.gr_recipientemail} label="Previous submission"
                    status={submission.gr_status} submission={submission} isBusy={false} canSend={false} allowSend={false}
                    expanded={expandedId === submission.gr_jobcardsubmissionid}
                    onToggle={() => setExpandedId((current) => current ? '' : submission.gr_jobcardsubmissionid)}
                    onSend={() => undefined} onPhoto={(id) => showPhoto(submission, id)}
                    onDownload={() => void downloadPdf(submission)} isPdfBusy={pdfBusyId === submission.gr_jobcardsubmissionid}
                />)}
            </section>}

            {showAssignmentForm && <div className="job-assignment-form"><label className="job-edit-field"><span>Technician</span><select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">Select technician</option>{mechanics.filter((mechanic) => canBeAssignedJobs(mechanic) && mechanic.gr_mechanicid !== job.gr_Mechanic?.gr_mechanicid && !assignments.some((assignment) => assignment.gr_Mechanic?.gr_mechanicid === mechanic.gr_mechanicid)).map((mechanic) => <option key={mechanic.gr_mechanicid} value={mechanic.gr_mechanicid}>{mechanic.gr_name}</option>)}</select></label><button type="button" className="job-assignment-save" onClick={() => void addAssignment()} disabled={isUpdating}>{isUpdating ? 'Adding…' : 'Add technician'}</button></div>}
            <button type="button" className="job-assignment-add" onClick={() => setShowAssignmentForm((current) => !current)} disabled={isUpdating}>{showAssignmentForm ? 'Cancel' : '+ Add another technician'}</button>
            {error && <p className="job-card-error" role="alert">{error}</p>}
        </div>

        {pendingEmail && <EditDrawerConfirmation eyebrow="Confirm Job Card email" title="Send a new Job Card link?" message="An unused link will be replaced. If this technician has already submitted, their evidence will be preserved and a new submission cycle will start." isBusy={isUpdating || Boolean(busyId)} confirmLabel="Generate and email" onCancel={() => setPendingEmail(null)} onConfirm={() => void performSend(pendingEmail)} />}
        {previewPhoto && <div className="job-photo-preview" role="dialog" aria-modal="true" aria-label={previewPhoto.fileName} onClick={() => setPreview(null)}>
            <button type="button" aria-label="Close photo preview" onClick={() => setPreview(null)}>×</button>
            {previewPhotoUrl
                ? <img src={previewPhotoUrl} alt={previewPhoto.fileName} onClick={(event) => event.stopPropagation()} />
                : previewPhotoQuery.status === 'error' || previewPhotoQuery.status === 'stale'
                    ? <div className="job-photo-preview-state error" onClick={(event) => event.stopPropagation()}>
                        <strong>Photo unavailable</strong>
                        <span>{previewPhotoQuery.error?.message ?? 'The photo could not be loaded.'}</span>
                        <button type="button" onClick={() => { void previewPhotoQuery.refetch().catch(() => undefined) }}>Try again</button>
                    </div>
                    : <div className="job-photo-preview-state" role="status" onClick={(event) => event.stopPropagation()}>Loading photo…</div>}
            <span>{previewPhoto.fileName}</span>
        </div>}
    </>
}
