import { useState } from 'react'
import type { Job } from '../types/job.types'
import { JOB_BOOKS, JOB_BOOK_KEYS, type JobBookKey } from '../../job-book/jobBookConfig'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import { useJobRegistration } from '../hooks/useJobRegistration'
import { fetchJobForCorrection } from '../services/jobCorrectionsApi'
import { walkthroughJobAction } from '../services/unifiedJobWalkthroughApi'
import { runJobWorkflow } from '../services/jobWorkflowApi'
import { UNIFIED_JOB_WALKTHROUGH } from '../domain/unifiedJobWorkflow'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'

export default function JobRegistrationDialog({ job: initial, mode, getAccessToken, onClose, onSaved }: {
    job: Job; mode: 'allocate' | 'manage'; getAccessToken: () => Promise<string>; onClose: () => void; onSaved: () => void | Promise<void>
}) {
    const account = useActiveMsalAccount()
    const registration = useJobRegistration(`${account?.homeAccountId}.allocation`, getAccessToken, mode === 'allocate')
    const [job, setJob] = useState(initial)
    const [book, setBook] = useState<JobBookKey | ''>(registration.pending?.book ?? '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [reloaded, setReloaded] = useState(false)
    const reload = async () => {
        setBusy(true)
        try { setJob(await fetchJobForCorrection(await getAccessToken(), job.gr_jobid)); setReloaded(true); setError('') }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload this Job.') }
        finally { setBusy(false) }
    }
    const save = async () => {
        if (busy || registration.busy) return
        setBusy(true); setError('')
        try {
            if (mode === 'manage') {
                const token = await getAccessToken()
                if (UNIFIED_JOB_WALKTHROUGH) await walkthroughJobAction(token, 'manage', { jobId: job.gr_jobid, etag: job['@odata.etag'] })
                else await runJobWorkflow(token, { kind: 'manage', jobId: job.gr_jobid, jobEtag: job['@odata.etag'] ?? '' })
            }
            else {
                if (!book) { setError('Select the regional Job Book before allocating a number.'); return }
                const result = await registration.submit({ kind: 'allocate', requestId: crypto.randomUUID(), book, jobId: job.gr_jobid, etag: job['@odata.etag'] ?? '' })
                if (!result) return
            }
            await onSaved()
            if (mode === 'allocate') registration.complete()
            onClose()
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'The change could not be confirmed. Reload or retry the same request.') }
        finally { setBusy(false) }
    }
    return <EditDrawerFormDialog eyebrow="Job workflow" title={mode === 'allocate' ? 'Confirm Job Number allocation' : 'Manage job'}
        isBusy={busy || registration.busy} error={error || registration.error} onCancel={onClose} onSubmit={() => void save()}
        submitLabel={mode === 'manage' ? 'Add to Operational' : registration.pending ? 'Retry same request' : 'Allocate number'}
        submitDisabled={Boolean(job.gr_registrationvoid || (mode === 'allocate' && (!book || (job.gr_jobnumber && !registration.pending))) || (registration.pending?.kind === 'allocate' && registration.pending.jobId !== job.gr_jobid))}>
        <p>{job.gr_description}</p>
        {mode === 'allocate' ? <>
            <p>You are about to allocate one permanent regional Job Number to this Job. Check the Job Book below before confirming. This does not send an email, enter GreenTree or add the Job to Operational.</p>
            <label><span>Job Book</span><select value={book} disabled={busy || registration.busy || Boolean(registration.pending)} onChange={(event) => setBook(event.target.value as JobBookKey | '')}><option value="">Select regional Job Book</option>{JOB_BOOK_KEYS.map((key) => <option key={key} value={key}>{JOB_BOOKS[key].label}</option>)}</select></label>
            {job.gr_jobnumber && <p>Current number: <strong>{job.gr_jobnumber}</strong>. It cannot be replaced.</p>}
            {registration.pending && <p>The original request is retained across closing or reloading this tab.</p>}
            {registration.conflict && reloaded && <button type="button" disabled={busy} onClick={() => { registration.complete(); setReloaded(false) }}>Accept refreshed Job and discard rejected request</button>}
        </> : <p>Add this same Job to the coordinator’s Operational worklist. No new Job or number is created. Configure its type, status and scheduling in Jobs.</p>}
        <button type="button" disabled={busy || registration.busy} onClick={() => void reload()}>Reload latest Job</button>
    </EditDrawerFormDialog>
}
