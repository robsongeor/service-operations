import { useRef, useState } from 'react'
import type { Job } from '../types/job.types'
import { assertJobEmailSendingAllowed, type JobEmailDeliveryState, type JobEmailDraft } from '../services/jobEmail'
import { queuePrimaryJobDispatch } from '../services/primaryJobEmailWorkflow'
import { invalidateJobsCache } from '../services/jobsApi'

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
    const queuePrimaryJobEmail = async (job: Job, draft: JobEmailDraft) => {
        if (!enabled) throw new Error('You do not have permission to email this Job.')
        assertJobEmailSendingAllowed(window.location.hostname)
        if (pending.current.has(job.gr_jobid)) throw new Error('This Job email is already being sent.')
        pending.current.add(job.gr_jobid)
        const state = (status: JobEmailDeliveryState['status'], message: string) => setEmailDeliveryStates((current) => ({ ...current, [job.gr_jobid]: { status, message } }))
        state('sending', 'Job Card email is being sent.')
        try {
            const token = await getAccessToken()
            const queued = await queuePrimaryJobDispatch(token, job, draft, { hostname: window.location.hostname, assignedRecipientOnly, verifyCurrentJob })
            void (async () => {
                try {
                    await queued.confirmDelivery()
                    state('sent', 'Job Card email sent.')
                    invalidateJobsCache(token)
                    // A failed display refresh must not relabel confirmed delivery as failed.
                    try { await onDelivered?.() } catch { /* Consumers already present their scoped load errors. */ }
                } catch (error) {
                    state('failed', error instanceof Error ? error.message : 'Delivery was not confirmed. Check the dispatch history before sending again.')
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
