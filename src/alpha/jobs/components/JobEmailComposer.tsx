import { useState } from 'react'
import type { Job } from '../types/job.types'
import { ONLINE_JOB_CARD_ENABLED, TECHNICIAN_COMMENTS_MAX_LENGTH, type JobEmailDraft } from '../services/jobEmail'
import { buildTechnicianEmailSubject } from '../utils/technicianMailto'
import { isValidTechnicianEmail } from '../utils/technicianMailto'
import { jobHasActiveSubmissionLink } from '../services/jobSubmissionLinkApi'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import { formatFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'
import './JobEmailComposer.css'

type Props = {
    job: Job
    onCancel: () => void
    onSend: (draft: JobEmailDraft) => Promise<void>
}

export default function JobEmailComposer({ job, onCancel, onSend }: Props) {
    const mechanic = job.gr_Mechanic
    const [recipientEmail, setRecipientEmail] = useState(mechanic?.gr_email ?? '')
    const [subject, setSubject] = useState(() => buildTechnicianEmailSubject(job))
    const [technicianComments, setTechnicianComments] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [error, setError] = useState('')
    const [confirmReplacement, setConfirmReplacement] = useState(false)
    const recipientValid = isValidTechnicianEmail(recipientEmail)
    const canSend = recipientValid && Boolean(subject.trim())
    const equipment = job.gr_Equipment
    const site = job.gr_Site
    const contact = job.gr_Contact
    const fleetNumbers = formatFleetNumbers(equipment?.gr_fleet, equipment?.gr_alternatefleetnumbers)

    const send = async () => {
        if (!canSend) return
        try {
            setIsSending(true)
            setError('')
            await onSend({
                recipientEmail: recipientEmail.trim(),
                subject: subject.trim(),
                technicianComments: technicianComments.trim(),
            })
        } catch (sendError) {
            setError(sendError instanceof Error ? sendError.message : 'The Job Card email could not be queued.')
            setConfirmReplacement(false)
        } finally {
            setIsSending(false)
        }
    }

    const requestSend = () => {
        if (!canSend) return
        if (ONLINE_JOB_CARD_ENABLED && jobHasActiveSubmissionLink(job)) {
            setConfirmReplacement(true)
            return
        }
        void send()
    }

    return <>
        <EditDrawerFormDialog
            eyebrow="Technician job card"
            title={`Send Job ${job.gr_jobnumber || 'without a number'}`}
            error={error}
            isBusy={isSending}
            submitDisabled={!canSend}
            submitLabel={isSending ? 'Queueing…' : 'Send Job Card'}
            onCancel={onCancel}
            onSubmit={requestSend}
            dialogClassName="job-email-composer"
            fieldsClassName="job-email-composer-fields"
        >
            <div className="job-email-composer-intro">
                <strong>Ready to send</strong>
                <span>The email is queued immediately; you can keep working while delivery completes.</span>
            </div>
            <label>
                <span>To</span>
                <input
                    type="email"
                    autoFocus
                    value={recipientEmail}
                    aria-invalid={recipientEmail.length > 0 && !recipientValid}
                    onChange={(event) => setRecipientEmail(event.currentTarget.value)}
                />
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
                    <span className="job-email-preview-button is-disabled" aria-disabled="true">
                        Open Job Card — temporarily disabled
                    </span>
                    <small>Online Job Card access is temporarily unavailable.</small>
                </div>
            </section>
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
