import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Job } from '../types/job.types'
import type { JobAssignment, JobAssignmentInput } from '../types/jobAssignment.types'
import type { Mechanic } from '../types/mechanic.types'
import { jobEmailSendingAllowedForHostname, LOCAL_JOB_EMAIL_DISABLED_MESSAGE, onlineJobCardPilotEnabled, TECHNICIAN_COMMENTS_MAX_LENGTH, type JobEmailDraft } from '../services/jobEmail'
import { buildTechnicianEmailSubject } from '../utils/technicianMailto'
import { isValidTechnicianEmail } from '../utils/technicianMailto'
import { jobHasActiveSubmissionLink } from '../services/jobSubmissionLinkApi'
import { usesAzureJobCards } from '../types/jobCardWorkflow'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import { formatFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'
import { canBeAssignedJobs } from '../../mechanics/staffDirectory'
import { useJobCardHistory } from '../../job-card-reviews/useJobCardHistory'
import type { JobCardRequestSummary } from '../../job-card-reviews/jobCardReview.types'
import './JobEmailComposer.css'

type Props = {
    job: Job
    onCancel: () => void
    onSend: (draft: JobEmailDraft) => Promise<void>
    assignedRecipientOnly?: boolean
    mechanics?: Mechanic[]
    loadAssignments?: (jobId: string, signal?: AbortSignal) => Promise<JobAssignment[]>
    onCreateAssignment?: (assignment: JobAssignmentInput) => Promise<void>
    onSendAssignment?: (job: Job, assignment: JobAssignment, draft: JobEmailDraft) => Promise<void>
    onDeleteAssignment?: (assignmentId: string) => Promise<void>
}

const requestStatusLabel = (request?: JobCardRequestSummary) => {
    if (!request) return 'Not sent'
    if (request.status === 'active') return 'Sent · Awaiting card'
    if (request.status === 'expired') return 'Link expired'
    if (request.status === 'superseded') return 'Previous link replaced'
    if (request.status === 'withdrawn') return 'Withdrawn · No card required'
    if (request.status === 'pendingReview') return 'Received · Awaiting review'
    return 'Received · Reviewed'
}

const requestTimeLabel = (request?: JobCardRequestSummary) => {
    if (!request) return ''
    const value = request.submittedOn || request.withdrawnOn || request.createdOn
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function JobEmailComposer({
    job,
    onCancel,
    onSend,
    assignedRecipientOnly = false,
    mechanics = [],
    loadAssignments,
    onCreateAssignment,
    onSendAssignment,
    onDeleteAssignment,
}: Props) {
    const primaryMechanic = job.gr_Mechanic
    const rosterEnabled = Boolean(loadAssignments)
    const history = useJobCardHistory(rosterEnabled && usesAzureJobCards(job) ? job.gr_jobid : undefined)
    const [assignmentRevision, setAssignmentRevision] = useState(0)
    const [assignmentResult, setAssignmentResult] = useState<{ revision: number; data?: JobAssignment[]; error?: string }>()
    const assignments = useMemo(() => assignmentResult?.revision === assignmentRevision ? assignmentResult.data ?? [] : [], [assignmentResult, assignmentRevision])
    const assignmentsBusy = rosterEnabled && assignmentResult?.revision !== assignmentRevision
    const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
    const selectedAssignment = assignments.find((item) => item.gr_jobassignmentid === selectedAssignmentId)
    const mechanic = selectedAssignment?.gr_Mechanic ?? primaryMechanic
    const [recipientEmail, setRecipientEmail] = useState(mechanic?.gr_email ?? '')
    const [subject, setSubject] = useState(() => buildTechnicianEmailSubject(job))
    const [technicianComments, setTechnicianComments] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [confirmReplacement, setConfirmReplacement] = useState(false)
    const [showAddTechnician, setShowAddTechnician] = useState(false)
    const [newMechanicId, setNewMechanicId] = useState('')
    const [rosterBusyId, setRosterBusyId] = useState('')
    const [withdrawRequestId, setWithdrawRequestId] = useState('')
    const [withdrawReason, setWithdrawReason] = useState('')
    const localSendingDisabled = !jobEmailSendingAllowedForHostname(window.location.hostname)
    const recipientValid = isValidTechnicianEmail(recipientEmail)
    const canSend = !localSendingDisabled && recipientValid && Boolean(subject.trim())
    const equipment = job.gr_Equipment
    const site = job.gr_Site
    const contact = job.gr_Contact
    const fleetNumbers = formatFleetNumbers(equipment?.gr_fleet, equipment?.gr_alternatefleetnumbers)
    const onlineJobCardEnabled = onlineJobCardPilotEnabled(recipientEmail)

    useEffect(() => {
        if (!loadAssignments) return
        const controller = new AbortController()
        void loadAssignments(job.gr_jobid, controller.signal)
            .then((data) => { if (!controller.signal.aborted) setAssignmentResult({ revision: assignmentRevision, data }) })
            .catch((reason: unknown) => {
                if (!controller.signal.aborted) setAssignmentResult({
                    revision: assignmentRevision,
                    error: reason instanceof Error ? reason.message : 'Assigned technicians could not be loaded.',
                })
            })
        return () => controller.abort()
    }, [assignmentRevision, job.gr_jobid, loadAssignments])

    const requestsByAssignment = useMemo(() => {
        const result = new Map<string, JobCardRequestSummary>()
        for (const request of history.data?.items ?? []) {
            const key = request.assignmentId?.toLowerCase() || 'primary'
            const current = result.get(key)
            if (!current || current.createdOn < request.createdOn) result.set(key, request)
        }
        return result
    }, [history.data])
    const historyError = history.error || (history.data?.truncated ? 'Technician history is incomplete. Reload before sending another Job Card.' : '')
    const rosterError = assignmentResult?.revision === assignmentRevision ? assignmentResult.error || historyError : historyError
    const rosterBusy = assignmentsBusy || (rosterEnabled && usesAzureJobCards(job) && history.busy)
    const showRoster = rosterEnabled
    const assignedTechnicianCount = (primaryMechanic ? 1 : 0) + assignments.length

    const selectTechnician = (assignment?: JobAssignment) => {
        if (assignedRecipientOnly && assignment) return
        setSelectedAssignmentId(assignment?.gr_jobassignmentid ?? '')
        setRecipientEmail((assignment?.gr_Mechanic ?? primaryMechanic)?.gr_email ?? '')
        setError('')
        setSuccess('')
    }

    const reloadRoster = useCallback(() => {
        setAssignmentRevision((value) => value + 1)
        if (usesAzureJobCards(job)) history.refresh()
    }, [history, job])

    const send = async () => {
        if (!canSend) return
        try {
            setIsSending(true)
            setError('')
            const draft = {
                recipientEmail: recipientEmail.trim(),
                subject: subject.trim(),
                technicianComments: technicianComments.trim(),
            }
            if (selectedAssignment) {
                if (!onSendAssignment) throw new Error('Additional technician email is unavailable here.')
                await onSendAssignment(job, selectedAssignment, draft)
            } else {
                await onSend(draft)
            }
            setSuccess(`Job Card email queued for ${mechanic?.gr_name || recipientEmail.trim()}.`)
            reloadRoster()
        } catch (sendError) {
            setError(sendError instanceof Error ? sendError.message : 'The Job Card email could not be queued.')
            setConfirmReplacement(false)
        } finally {
            setIsSending(false)
        }
    }

    const requestSend = () => {
        if (!canSend || rosterBusy || rosterError) return
        if (!selectedAssignment && !usesAzureJobCards(job) && onlineJobCardEnabled && jobHasActiveSubmissionLink(job)) {
            setConfirmReplacement(true)
            return
        }
        void send()
    }

    const addTechnician = async () => {
        const selected = mechanics.find((item) => item.gr_mechanicid === newMechanicId)
        if (!selected || !onCreateAssignment) return setError('Choose a technician first.')
        let addedSuccessfully = false
        setRosterBusyId('add')
        setError('')
        try {
            await onCreateAssignment({ jobId: job.gr_jobid, mechanicId: selected.gr_mechanicid, mechanicName: selected.gr_name })
            addedSuccessfully = true
            setNewMechanicId('')
            setShowAddTechnician(false)
            if (loadAssignments) {
                const refreshed = await loadAssignments(job.gr_jobid)
                setAssignmentResult({ revision: assignmentRevision, data: refreshed })
                const added = refreshed.find((assignment) => assignment.gr_Mechanic?.gr_mechanicid === selected.gr_mechanicid)
                if (added) selectTechnician(added)
                if (usesAzureJobCards(job)) history.refresh()
            } else reloadRoster()
            setSuccess(`${selected.gr_name} added to this Job.`)
        } catch (reason) {
            setError(addedSuccessfully
                ? `${selected.gr_name} was added, but the technician roster could not be refreshed. Close and reopen this window.`
                : reason instanceof Error ? reason.message : 'The technician could not be added.')
        } finally { setRosterBusyId('') }
    }

    const removeTechnician = async (assignment: JobAssignment) => {
        if (!onDeleteAssignment || !window.confirm(`Remove ${assignment.gr_Mechanic?.gr_name ?? 'this technician'} from this Job?`)) return
        setRosterBusyId(assignment.gr_jobassignmentid)
        setError('')
        try {
            await onDeleteAssignment(assignment.gr_jobassignmentid)
            if (selectedAssignmentId === assignment.gr_jobassignmentid) selectTechnician()
            setSuccess(`${assignment.gr_Mechanic?.gr_name ?? 'Technician'} removed.`)
            reloadRoster()
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The technician could not be removed.')
        } finally { setRosterBusyId('') }
    }

    const withdrawTechnician = async (request: JobCardRequestSummary) => {
        if (!withdrawReason.trim()) return setError('Enter why this technician is no longer attending.')
        setRosterBusyId(request.reviewId)
        setError('')
        try {
            await history.withdraw(request.reviewId, request.etag, withdrawReason.trim())
            setWithdrawRequestId('')
            setWithdrawReason('')
            setSuccess(`${request.technicianName} withdrawn. Their Job Card is no longer required.`)
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The technician could not be withdrawn.')
        } finally { setRosterBusyId('') }
    }

    const availableMechanics = mechanics.filter((item) => canBeAssignedJobs(item)
        && item.gr_mechanicid !== primaryMechanic?.gr_mechanicid
        && !assignments.some((assignment) => assignment.gr_Mechanic?.gr_mechanicid === item.gr_mechanicid))

    const rosterRow = (assignment?: JobAssignment) => {
        const rowMechanic = assignment?.gr_Mechanic ?? primaryMechanic
        const key = assignment?.gr_jobassignmentid ?? 'primary'
        const request = requestsByAssignment.get(assignment?.gr_jobassignmentid.toLowerCase() ?? 'primary')
        const selected = assignment ? selectedAssignmentId === assignment.gr_jobassignmentid : !selectedAssignmentId
        const removable = Boolean(assignment && onDeleteAssignment && !request && !assignment.gr_emailsenton && !assignment.gr_submittedon)
        return <article key={key} className={`job-email-roster-row${selected ? ' is-selected' : ''}`}>
            <button type="button" className="job-email-roster-person" onClick={() => selectTechnician(assignment)} disabled={!rowMechanic || (assignedRecipientOnly && Boolean(assignment))}>
                <span className="job-email-roster-avatar" aria-hidden="true">{rowMechanic?.gr_name.slice(0, 1).toUpperCase() || '?'}</span>
                <span><strong>{rowMechanic?.gr_name || 'Unassigned technician'}</strong><small>{assignment ? 'Additional technician' : 'First technician'}</small></span>
            </button>
            <div className="job-email-roster-state"><strong>{requestStatusLabel(request)}</strong>{requestTimeLabel(request) && <small>{requestTimeLabel(request)}</small>}</div>
            {!assignedRecipientOnly && <div className="job-email-roster-actions">
                {!selected && <button type="button" onClick={() => selectTechnician(assignment)}>Compose</button>}
                {request?.status === 'active' && <button type="button" onClick={() => { setWithdrawRequestId(request.reviewId); setWithdrawReason('') }}>Withdraw</button>}
                {removable && <button type="button" className="danger" disabled={rosterBusyId === key} onClick={() => void removeTechnician(assignment!)}>Remove</button>}
            </div>}
            {withdrawRequestId === request?.reviewId && <div className="job-email-roster-withdraw">
                <label><span>Reason</span><textarea rows={2} value={withdrawReason} onChange={(event) => setWithdrawReason(event.currentTarget.value)} placeholder="For example: Sick before attending" /></label>
                <div><button type="button" onClick={() => { setWithdrawRequestId(''); setWithdrawReason('') }}>Cancel</button><button type="button" className="danger" disabled={rosterBusyId === request.reviewId || !withdrawReason.trim()} onClick={() => void withdrawTechnician(request)}>Withdraw card</button></div>
            </div>}
        </article>
    }

    return <>
        <EditDrawerFormDialog
            eyebrow="Technician job card"
            title={`Send Job ${job.gr_jobnumber || 'without a number'}`}
            error={error}
            isBusy={isSending || Boolean(rosterBusyId)}
            submitDisabled={!canSend || rosterBusy || Boolean(rosterError) || Boolean(rosterBusyId)}
            submitLabel={localSendingDisabled ? 'Sending disabled locally' : isSending ? 'Queueing…' : 'Send Job Card'}
            onCancel={onCancel}
            onSubmit={requestSend}
            dialogClassName={`job-email-composer${showRoster ? ' has-roster' : ''}`}
            fieldsClassName={`job-email-composer-fields${showRoster ? ' has-roster' : ''}`}
        >
            <div className="job-email-composer-main">
            <div className={`job-email-composer-intro ${localSendingDisabled ? 'is-disabled' : ''}`} role={localSendingDisabled ? 'status' : undefined}>
                <strong>{localSendingDisabled ? 'Local preview only' : 'Ready to send'}</strong>
                <span>{localSendingDisabled ? LOCAL_JOB_EMAIL_DISABLED_MESSAGE : 'The email is queued immediately; you can keep working while delivery completes.'}</span>
            </div>
            <label>
                <span>To</span>
                <input
                    type="email"
                    readOnly={assignedRecipientOnly || Boolean(selectedAssignment)}
                    autoFocus
                    value={recipientEmail}
                    aria-invalid={recipientEmail.length > 0 && !recipientValid}
                    onChange={(event) => setRecipientEmail(event.currentTarget.value)}
                />
                {(assignedRecipientOnly || selectedAssignment) && <small className="job-email-field-help">Assigned technician: {mechanic?.gr_name}. {assignedRecipientOnly ? 'A service coordinator must change the allocation.' : 'Select a different technician from the roster.'}</small>}
                {!recipientValid && recipientEmail.length > 0 && <small>Enter a valid email address.</small>}
            </label>
            <label>
                <span>Subject</span>
                <input
                    type="text"
                    maxLength={500}
                    value={subject}
                    onChange={(event) => setSubject(event.currentTarget.value)}
                />
            </label>
            <label>
                <span>Comments for technician (optional)</span>
                <textarea
                    rows={3}
                    maxLength={TECHNICIAN_COMMENTS_MAX_LENGTH}
                    value={technicianComments}
                    onChange={(event) => setTechnicianComments(event.currentTarget.value)}
                />
                <small className="job-email-field-help">
                    Included in this email only; this does not change the Job description.
                </small>
            </label>
            <section className="job-email-preview" aria-label="Email preview">
                <header>
                    <small>Service Operations</small>
                    <h4>Job {job.gr_jobnumber || 'Not supplied'}</h4>
                </header>
                <div className="job-email-preview-body">
                    <p>Hi {(mechanic?.gr_name ?? 'there').trim().split(' ')[0]},</p>
                    <p>Please see the assigned Job details below.</p>
                    <div className="job-email-work">
                        <span>Work required</span>
                        <strong>{job.gr_description || 'No work description supplied.'}</strong>
                    </div>
                    {technicianComments.trim() && <div className="job-email-comments">
                        <span>Comments for technician</span>
                        <p>{technicianComments.trim()}</p>
                    </div>}
                    <dl>
                        {(equipment?.gr_make || equipment?.gr_model) && <><dt>Equipment</dt><dd>{[equipment.gr_make, equipment.gr_model].filter(Boolean).join(' ')}</dd></>}
                        {fleetNumbers && <><dt>Fleet number</dt><dd>{fleetNumbers}</dd></>}
                        {equipment?.gr_serial && <><dt>Serial number</dt><dd>{equipment.gr_serial}</dd></>}
                        {site?.gr_Customer?.gr_name && <><dt>Customer</dt><dd>{site.gr_Customer.gr_name}</dd></>}
                        {site?.gr_name && <><dt>Site</dt><dd>{site.gr_name}</dd></>}
                        {site?.gr_address && <><dt>Address</dt><dd>{site.gr_address}</dd></>}
                        <dt>Site contact</dt><dd>{contact?.gr_name || 'No site contact assigned'}</dd>
                        {contact?.gr_phone && <><dt>Contact phone</dt><dd>{contact.gr_phone}</dd></>}
                        {contact?.gr_email && <><dt>Contact email</dt><dd>{contact.gr_email}</dd></>}
                        {job.gr_ordernumber && <><dt>Order number</dt><dd>{job.gr_ordernumber}</dd></>}
                    </dl>
                    {onlineJobCardEnabled ? <>
                        <span className="job-email-preview-button">Open Job Card</span>
                        <small>A secure pilot Job Card link will be created for this approved recipient when the email is sent.</small>
                    </> : <>
                    <span className="job-email-preview-button is-disabled" aria-disabled="true">
                        Open Job Card — temporarily disabled
                    </span>
                    <small>Online Job Card access is currently disabled.</small>
                    </>}
                </div>
            </section>
            {success && <p className="job-email-composer-success" role="status">{success}</p>}
            </div>
            {showRoster && <aside className="job-email-roster" aria-label="Assigned technicians">
                <header><div><span>Assigned technicians</span><strong>{assignedTechnicianCount}</strong></div><small>Select who this email is for.</small></header>
                {rosterBusy ? <p className="job-email-roster-message" role="status">Loading technician activity…</p>
                    : rosterError ? <div className="job-email-roster-message error"><p>{rosterError}</p><button type="button" onClick={reloadRoster}>Try again</button></div>
                    : <div className="job-email-roster-list">
                        {primaryMechanic ? rosterRow() : assignments.length === 0 && <p className="job-email-roster-message">No technicians assigned yet.</p>}
                        {assignments.map((assignment) => rosterRow(assignment))}
                    </div>}
                {!assignedRecipientOnly && !rosterBusy && !rosterError && onCreateAssignment && <>
                    {showAddTechnician ? <div className="job-email-roster-add">
                        <label><span>Technician</span><select value={newMechanicId} onChange={(event) => setNewMechanicId(event.currentTarget.value)}><option value="">Select technician</option>{availableMechanics.map((item) => <option key={item.gr_mechanicid} value={item.gr_mechanicid}>{item.gr_name}</option>)}</select></label>
                        <div><button type="button" onClick={() => { setShowAddTechnician(false); setNewMechanicId('') }}>Cancel</button><button type="button" className="primary" disabled={!newMechanicId || rosterBusyId === 'add'} onClick={() => void addTechnician()}>{rosterBusyId === 'add' ? 'Adding…' : 'Add technician'}</button></div>
                    </div> : <button type="button" className="job-email-roster-add-button" onClick={() => setShowAddTechnician(true)}>+ Add technician</button>}
                </>}
            </aside>}
        </EditDrawerFormDialog>
        {confirmReplacement && <EditDrawerConfirmation
            eyebrow="Replace secure link"
            title="Send with a new Job Card link?"
            message="This Job already has an active link. Sending this email will replace it, so the previous link will stop working."
            isBusy={isSending}
            confirmLabel={isSending ? 'Queueing…' : 'Replace link & send'}
            onCancel={() => setConfirmReplacement(false)}
            onConfirm={() => void send()}
        />}
    </>
}
