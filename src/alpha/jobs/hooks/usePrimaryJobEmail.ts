import { useRef, useState } from 'react'
import type { Job } from '../types/job.types'
import { assertJobEmailSendingAllowed, type JobEmailDeliveryState, type JobEmailDraft } from '../services/jobEmail'
import { queuePrimaryJobDispatch, type InitialDispatchAttempt } from '../services/primaryJobEmailWorkflow'
import { invalidateJobsCache } from '../services/jobsApi'
import { JOB_WORKFLOW_ENABLED } from '../services/jobWorkflowApi'
import { ConfirmedDeliveryStatusError } from '../services/jobsApi'

type Options = {
    getAccessToken: () => Promise<string>
    enabled?: boolean
    assignedRecipientOnly?: boolean
    verifyCurrentJob?: boolean
    onDelivered?: () => Promise<unknown>
}

export function usePrimaryJobEmail({ getAccessToken, enabled = true, assignedRecipientOnly = false, verifyCurrentJob = false, onDelivered }: Options) {
    const [emailDeliveryStates, setEmailDeliveryStates] = useState<Record<string, JobEmailDeliveryState>>({})
    const pending = useRef(new Set<string>())
    const dispatchAttempts = useRef(new Map<string, { key: string; attempt: InitialDispatchAttempt }>())
    const queuePrimaryJobEmail = async (job: Job, draft: JobEmailDraft) => {
        if (!enabled) throw new Error('You do not have permission to email this Job.')
        assertJobEmailSendingAllowed(window.location.hostname)
        if (pending.current.has(job.gr_jobid)) throw new Error('This Job email is already being sent.')
        pending.current.add(job.gr_jobid)
        const state = (status: JobEmailDeliveryState['status'], message: string) => setEmailDeliveryStates((current) => ({ ...current, [job.gr_jobid]: { status, message } }))
        state('sending', 'Job Card email is being sent.')
        try {
            const token = await getAccessToken()
            const attemptKey = JSON.stringify([job.gr_jobid, job['@odata.etag'], draft.recipientEmail.trim().toLowerCase(), draft.subject.trim(), draft.technicianComments?.trim() ?? ''])
            let retained = dispatchAttempts.current.get(job.gr_jobid)
            if (!retained || retained.key !== attemptKey) {
                retained = { key: attemptKey, attempt: { requestId: crypto.randomUUID() } }
                dispatchAttempts.current.set(job.gr_jobid, retained)
            }
            const guardedAttempt = assignedRecipientOnly && JOB_WORKFLOW_ENABLED ? retained.attempt : undefined
            const queued = await queuePrimaryJobDispatch(token, job, draft, { hostname: window.location.hostname, assignedRecipientOnly, verifyCurrentJob, dispatchAttempt: guardedAttempt })
            if (guardedAttempt) dispatchAttempts.current.delete(job.gr_jobid)
            void (async () => {
                try {
                    await queued.confirmDelivery()
                    state('sent', 'Job Card email sent.')
                    invalidateJobsCache(token)
                    // A failed display refresh must not relabel confirmed delivery as failed.
                    try { await onDelivered?.() } catch { /* Consumers already present their scoped load errors. */ }
                } catch (error) {
                    state(error instanceof ConfirmedDeliveryStatusError ? 'sent' : 'failed', error instanceof Error ? error.message : 'Delivery was not confirmed. Check the dispatch history before sending again.')
                } finally { pending.current.delete(job.gr_jobid) }
            })()
        } catch (error) {
            pending.current.delete(job.gr_jobid)
            state('failed', error instanceof Error ? error.message : 'Job Card email could not be queued.')
            throw error
        }
    }
    return { queuePrimaryJobEmail, emailDeliveryStates }
}
