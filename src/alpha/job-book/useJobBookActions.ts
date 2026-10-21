import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobBookRow } from './jobBookPrototype'
import type { CorrectableJob } from '../jobs/services/jobCorrectionsApi'
import type { Job } from '../jobs/types/job.types'
import type { JobEmailDraft } from '../jobs/services/jobEmail'
import { fetchJobForCorrection } from '../jobs/services/jobCorrectionsApi'
import { assignedTechnicianEmailBlockedReason } from '../jobs/services/primaryJobEmailWorkflow'
import { copyNumberedJobBookSpreadsheetRow } from '../jobs/utils/jobBookClipboard'
import { usePrimaryJobEmail } from '../jobs/hooks/usePrimaryJobEmail'
import { jobBookClipboardSource, jobBookCopyBlockedReason, jobBookEmailBlockedReason } from './jobBookActions'
import type { JobAssignment, JobAssignmentInput } from '../jobs/types/jobAssignment.types'
import { createJobAssignment, deleteJobAssignment, fetchJobAssignmentsForJob, updateJobAssignmentStatus } from '../jobs/services/jobAssignmentsApi'
import { assertJobEmailSendingAllowed, buildAssignmentJobEmail, onlineJobCardPilotEnabled } from '../jobs/services/jobEmail'
import { assertJobHasEmailableJobNumber } from '../jobs/services/jobEmailRules'
import { isValidTechnicianEmail } from '../jobs/utils/technicianMailto'
import { generateJobSubmissionLink } from '../jobs/services/jobSubmissionLinkApi'
import { createEmailDispatch, fetchJobEmailDispatches, waitForEmailDispatch } from '../jobs/services/emailDispatchApi'
import { markJobAllocatedAfterConfirmedDelivery } from '../jobs/services/jobsApi'
import { usesAzureJobCards } from '../jobs/types/jobCardWorkflow'
import { JOB_CARD_STATUSES } from '../jobs/types/jobCardStatus.types'

export function useJobBookActions(getAccessToken: () => Promise<string>, canEmail: boolean, assignedRecipientOnly: boolean, signedInUserName: string) {
    const [emailJob, setEmailJob] = useState<CorrectableJob | null>(null)
    const [emailPreviousTechnicians, setEmailPreviousTechnicians] = useState<Array<{ id?: string; name: string }>>([])
    const [loadingJobId, setLoadingJobId] = useState('')
    const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null)
    const readController = useRef<AbortController | null>(null)
    useEffect(() => () => readController.current?.abort(), [])
    const { queuePrimaryJobEmail, emailDeliveryStates } = usePrimaryJobEmail({ getAccessToken, enabled: canEmail, assignedRecipientOnly, verifyCurrentJob: true })

    const copy = async (row: JobBookRow) => {
        try {
            const blocked = jobBookCopyBlockedReason(row)
            if (blocked) throw new Error(blocked)
            await copyNumberedJobBookSpreadsheetRow(jobBookClipboardSource(row), signedInUserName)
            setFeedback({ message: `Job ${row.jobNumber} copied — paste into the order number book.`, error: false })
        } catch (error) {
            setFeedback({ message: error instanceof Error ? error.message : 'The row could not be copied. Check the entry and clipboard permission, then try again.', error: true })
        }
    }
    const close = () => {
        readController.current?.abort()
        setEmailJob(null)
        setEmailPreviousTechnicians([])
        setLoadingJobId('')
    }
    const openEmail = async (row: JobBookRow) => {
        const blocked = jobBookEmailBlockedReason(row, canEmail)
        if (blocked) { setFeedback({ message: blocked, error: true }); return }
        readController.current?.abort()
        const controller = new AbortController()
        readController.current = controller
        setLoadingJobId(row.linkedJobId)
        setFeedback(null)
        try {
            const job = await fetchJobForCorrection(await getAccessToken(), row.linkedJobId, controller.signal)
            if (controller.signal.aborted) return
            const latestBlocked = assignedTechnicianEmailBlockedReason(job)
            if (latestBlocked) throw new Error(latestBlocked)
            const originalName = row.originalMechanicName?.trim() ?? ''
            const currentId = job.gr_Mechanic?.gr_mechanicid?.toLowerCase()
            setEmailPreviousTechnicians(originalName && row.originalMechanicId?.toLowerCase() !== currentId
                ? [{ id: row.originalMechanicId, name: originalName }]
                : [])
            setEmailJob(job)
        } catch (error) {
            if (!controller.signal.aborted) setFeedback({ message: error instanceof Error ? error.message : 'The Job email preview could not be loaded.', error: true })
        } finally { if (!controller.signal.aborted) setLoadingJobId('') }
    }
    const send = async (draft: JobEmailDraft) => {
        if (!canEmail || !emailJob) throw new Error('Reopen the Job email preview before sending.')
        await queuePrimaryJobEmail(emailJob, draft)
        setFeedback({ message: `Job Card email queued for ${draft.recipientEmail}. Delivery is shown on the row.`, error: false })
    }
    const loadAssignments = useCallback(async (jobId: string, signal?: AbortSignal) => (
        fetchJobAssignmentsForJob(await getAccessToken(), jobId, signal)
    ), [getAccessToken])
    const loadDispatches = useCallback(async (jobId: string, signal?: AbortSignal) => (
        fetchJobEmailDispatches(await getAccessToken(), jobId, signal)
    ), [getAccessToken])
    const addAssignment = useCallback(async (assignment: JobAssignmentInput) => {
        await createJobAssignment(await getAccessToken(), assignment)
    }, [getAccessToken])
    const removeAssignment = useCallback(async (assignmentId: string) => {
        await deleteJobAssignment(await getAccessToken(), assignmentId)
    }, [getAccessToken])
    const sendAssignment = useCallback(async (job: Job, assignment: JobAssignment, draft: JobEmailDraft) => {
        assertJobEmailSendingAllowed(window.location.hostname)
        assertJobHasEmailableJobNumber(job)
        if (!isValidTechnicianEmail(assignment.gr_Mechanic?.gr_email)) throw new Error('This technician needs a valid email address before the Job can be sent.')
        const token = await getAccessToken()
        const submissionUrl = onlineJobCardPilotEnabled(draft.recipientEmail)
            ? (await generateJobSubmissionLink(token, {
                jobId: job.gr_jobid,
                mechanicId: assignment.gr_Mechanic?.gr_mechanicid,
                assignmentId: assignment.gr_jobassignmentid,
                recipientName: assignment.gr_Mechanic?.gr_name ?? 'Technician',
                recipientEmail: draft.recipientEmail,
            })).url
            : ''
        const email = buildAssignmentJobEmail(job, assignment, submissionUrl, draft)
        const dispatchId = await createEmailDispatch(token, { jobId: job.gr_jobid, assignmentId: assignment.gr_jobassignmentid, ...email })
        await waitForEmailDispatch(token, dispatchId)
        await markJobAllocatedAfterConfirmedDelivery(token, job.gr_jobid)
        if (!usesAzureJobCards(job)) await updateJobAssignmentStatus(token, assignment.gr_jobassignmentid, JOB_CARD_STATUSES.SENT)
        setFeedback({ message: `Job Card email queued for ${draft.recipientEmail}. Delivery is shown in the technician roster.`, error: false })
    }, [getAccessToken])
    return {
        emailJob, emailPreviousTechnicians, loadingJobId, feedback, dismissFeedback: () => setFeedback(null), emailDeliveryStates,
        copy, openEmail, close, send, loadAssignments, loadDispatches, addAssignment, removeAssignment, sendAssignment,
    }
}
