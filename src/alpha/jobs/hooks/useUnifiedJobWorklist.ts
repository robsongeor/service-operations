import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { fetchWalkthroughJobsPage } from '../services/unifiedJobWalkthroughApi'
import { fetchUnifiedJobsPage } from '../services/jobsApi'
import { UNIFIED_JOB_RUNTIME, UNIFIED_JOB_WALKTHROUGH } from '../domain/unifiedJobWorkflow'
import type { Job } from '../types/job.types'
import type { JobTypeFilter } from '../types/jobType.types'

export function useUnifiedJobWorklist(scope: JobTypeFilter) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const getAccessToken = useCallback(() => acquireDataverseAccessToken(instance, account), [instance, account])
    const [jobs, setJobs] = useState<Job[]>([])
    const [busy, setBusy] = useState(UNIFIED_JOB_RUNTIME)
    const [error, setError] = useState('')
    const generation = useRef(0)
    const load = useCallback(async (requireConfirmation = false) => {
        if (!UNIFIED_JOB_RUNTIME) return
        const current = ++generation.current
        setBusy(true); setError('')
        try {
            const token = await getAccessToken()
            const rows = new Map<string, Job>()
            const seen = new Set<string>()
            let cursor = ''
            for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
                const page = UNIFIED_JOB_WALKTHROUGH
                    ? await fetchWalkthroughJobsPage(token, cursor)
                    : await fetchUnifiedJobsPage(token, scope, cursor)
                for (const row of page.records) rows.set(row.gr_jobid.toLowerCase(), row)
                if (!page.next) { cursor = ''; break }
                if (seen.has(page.next)) throw new Error('Dataverse returned a repeated Jobs continuation page.')
                seen.add(page.next)
                cursor = page.next
            }
            if (cursor) throw new Error('The Jobs worklist exceeded its safe automatic paging limit.')
            if (current !== generation.current) {
                if (requireConfirmation) throw new Error('A newer refresh started. Retry to confirm this saved Job.')
                return
            }
            setJobs([...rows.values()])
        } catch (cause) {
            if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Jobs could not be loaded.')
            if (requireConfirmation) throw cause
        } finally { if (current === generation.current) setBusy(false) }
    }, [getAccessToken, scope])
    useEffect(() => {
        if (!UNIFIED_JOB_RUNTIME) return
        const requestGeneration = generation
        const timer = setTimeout(() => void load(), 0)
        return () => { clearTimeout(timer); requestGeneration.current++ }
    }, [load])
    return { jobs, busy, error, reload: load, getAccessToken }
}
