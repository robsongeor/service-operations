import type { Job } from '../types/job.types.ts'
import { assertJobEmailSendingAllowed, buildPrimaryJobEmail, onlineJobCardPilotEnabled, TECHNICIAN_COMMENTS_MAX_LENGTH, type JobEmail, type JobEmailDraft } from './jobEmail.ts'
import { assertJobHasEmailableJobNumber } from './jobEmailRules.ts'
import { isValidTechnicianEmail } from '../utils/technicianMailto.ts'
import { usesAzureJobCards } from '../types/jobCardWorkflow.ts'
import { JOB_STATUSES } from '../types/jobStatus.types.ts'
import { JOB_CARD_STATUSES } from '../types/jobCardStatus.types.ts'
import { createEmailDispatch, waitForEmailDispatch } from './emailDispatchApi.ts'
import { generateJobSubmissionLink } from './jobSubmissionLinkApi.ts'
import { markJobAllocatedAfterConfirmedDelivery, updateJobCardStatus } from './jobsApi.ts'
import { fetchJobForCorrection } from './jobCorrectionsApi.ts'
import { JOB_WORKFLOW_ENABLED, runJobWorkflow } from './jobWorkflowApi.ts'

export function assignedTechnicianEmailBlockedReason(job: Job) {
    if (!job.gr_jobnumber?.trim()) return 'A Job Number must be assigned before this Job can be emailed.'
    if (job.gr_status === JOB_STATUSES.UNCONFIRMED) return 'A coordinator must confirm this Job before it can be emailed.'
    if (!usesAzureJobCards(job)) return 'Use the separate Site Check workflow for this Job.'
    if (!job.gr_Mechanic?.gr_mechanicid) return 'A coordinator must assign a technician before this Job can be emailed.'
    if (!isValidTechnicianEmail(job.gr_Mechanic.gr_email)) return 'The assigned technician needs a valid email address before this Job can be emailed.'
    return ''
}

export type InitialDispatchAttempt = { requestId: string; email?: JobEmail }
type Options = { hostname: string; assignedRecipientOnly?: boolean; verifyCurrentJob?: boolean; dispatchAttempt?: InitialDispatchAttempt }

/** Shared by Jobs and Job Book. Opening a preview never calls this mutation workflow. */
export async function queuePrimaryJobDispatch(token: string, original: Job, draft: JobEmailDraft, options: Options) {
    assertJobEmailSendingAllowed(options.hostname)
    assertJobHasEmailableJobNumber(original)
    if (!isValidTechnicianEmail(draft.recipientEmail)) throw new Error('Enter a valid technician email address before sending.')
    if (!draft.subject.trim() || draft.subject.trim().length > 500) throw new Error('Enter an email subject of 500 characters or fewer.')
    if ((draft.technicianComments?.length ?? 0) > TECHNICIAN_COMMENTS_MAX_LENGTH) throw new Error('Technician comments must be 2000 characters or fewer.')
    let job = original
    if (options.assignedRecipientOnly || options.verifyCurrentJob) {
        const blocked = assignedTechnicianEmailBlockedReason(job)
        if (blocked) throw new Error(blocked)
        if (!job['@odata.etag'] || job['@odata.etag'] === '*') throw new Error('Reopen the email preview to load the current Job version.')
        job = await fetchJobForCorrection(token, job.gr_jobid)
        if (job['@odata.etag'] !== original['@odata.etag']) throw new Error('This Job or its allocation changed. Close and reopen the email preview before sending. No email was queued.')
        const latestBlocked = assignedTechnicianEmailBlockedReason(job)
        if (latestBlocked) throw new Error(latestBlocked)
        if (job.gr_Mechanic?.gr_mechanicid !== original.gr_Mechanic?.gr_mechanicid || job.gr_Mechanic?.gr_email !== original.gr_Mechanic?.gr_email) throw new Error('The technician details changed. Close and reopen the email preview before sending.')
        if (JSON.stringify(buildPrimaryJobEmail(job, '', draft)) !== JSON.stringify(buildPrimaryJobEmail(original, '', draft))) throw new Error('The Job details changed. Close and reopen the email preview before sending.')
    }
    if (options.assignedRecipientOnly && draft.recipientEmail.trim().toLowerCase() !== job.gr_Mechanic?.gr_email?.trim().toLowerCase()) throw new Error('Admins can email only the assigned technician. Ask a coordinator to change the allocation.')
    // Validate the base message before creating any secure link.
    buildPrimaryJobEmail(job, '', draft)
    let email = options.dispatchAttempt?.email
    if (!email) {
        const submissionUrl = onlineJobCardPilotEnabled(draft.recipientEmail)
            ? (await generateJobSubmissionLink(token, {
                jobId: job.gr_jobid, mechanicId: job.gr_Mechanic?.gr_mechanicid,
                recipientName: job.gr_Mechanic?.gr_name ?? 'Technician', recipientEmail: draft.recipientEmail,
            })).url : ''
        email = buildPrimaryJobEmail(job, submissionUrl, draft)
        if (options.dispatchAttempt) options.dispatchAttempt.email = email
    }
    const dispatchId = options.assignedRecipientOnly && JOB_WORKFLOW_ENABLED
        ? (await runJobWorkflow(token, {
            kind: 'dispatch', requestId: options.dispatchAttempt?.requestId ?? crypto.randomUUID(), jobId: job.gr_jobid,
            jobEtag: job['@odata.etag'] ?? '', recipientEmail: email.recipientEmail, subject: email.subject, body: email.body,
        })).dispatchId as string
        : await createEmailDispatch(token, { jobId: job.gr_jobid, ...email })
    return {
        dispatchId,
        confirmDelivery: async () => {
            await waitForEmailDispatch(token, dispatchId)
            await markJobAllocatedAfterConfirmedDelivery(token, job.gr_jobid)
            // Legacy Job Card status is separate from the operational allocation transition above.
            if (!usesAzureJobCards(job)) await updateJobCardStatus(token, job.gr_jobid, JOB_CARD_STATUSES.SENT)
        },
    }
}
