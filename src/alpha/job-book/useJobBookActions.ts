import { useEffect, useRef, useState } from 'react'
import type { JobBookRow } from './jobBookPrototype'
import type { CorrectableJob } from '../jobs/services/jobCorrectionsApi'
import type { JobEmailDraft } from '../jobs/services/jobEmail'
import { fetchJobForCorrection } from '../jobs/services/jobCorrectionsApi'
import { assignedTechnicianEmailBlockedReason } from '../jobs/services/primaryJobEmailWorkflow'
import { copyNumberedJobBookSpreadsheetRow } from '../jobs/utils/jobBookClipboard'
import { usePrimaryJobEmail } from '../jobs/hooks/usePrimaryJobEmail'
import { jobBookClipboardSource, jobBookCopyBlockedReason, jobBookEmailBlockedReason } from './jobBookActions'

export function useJobBookActions(getAccessToken: () => Promise<string>, canEmail: boolean, assignedRecipientOnly: boolean, signedInUserName: string) {
    const [emailJob, setEmailJob] = useState<CorrectableJob | null>(null)
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
            setEmailJob(job)
        } catch (error) {
            if (!controller.signal.aborted) setFeedback({ message: error instanceof Error ? error.message : 'The Job email preview could not be loaded.', error: true })
        } finally { if (!controller.signal.aborted) setLoadingJobId('') }
    }
    const send = async (draft: JobEmailDraft) => {
        if (!canEmail || !emailJob) throw new Error('Reopen the Job email preview before sending.')
        await queuePrimaryJobEmail(emailJob, draft)
        setEmailJob(null)
        setFeedback({ message: `Job Card email queued for ${draft.recipientEmail}. Delivery is shown on the row.`, error: false })
    }
    return { emailJob, loadingJobId, feedback, dismissFeedback: () => setFeedback(null), emailDeliveryStates, copy, openEmail, close, send }
}
