import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { fetchWalkthroughJobsPage } from '../services/unifiedJobWalkthroughApi'
import { UNIFIED_JOB_WALKTHROUGH } from '../domain/unifiedJobWorkflow'
import type { Job } from '../types/job.types'

export function useUnifiedJobWorklist() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const getAccessToken = useCallback(() => acquireDataverseAccessToken(instance, account), [instance, account])
    const [jobs, setJobs] = useState<Job[]>([])
    const [next, setNext] = useState('')
    const [busy, setBusy] = useState(UNIFIED_JOB_WALKTHROUGH)
    const [error, setError] = useState('')
    const generation = useRef(0)
    const load = useCallback(async (cursor = '', requireConfirmation = false) => {
        if (!UNIFIED_JOB_WALKTHROUGH) return
        const current = ++generation.current
        setBusy(true); setError('')
        try {
            const page = await fetchWalkthroughJobsPage(await getAccessToken(), cursor)
            if (current !== generation.current) {
                if (requireConfirmation) throw new Error('A newer refresh started. Retry to confirm this saved Job.')
                return
            }
            setJobs((rows) => cursor ? [...new Map([...rows, ...page.records].map((row) => [row.gr_jobid, row])).values()] : page.records)
            setNext(page.next)
        } catch (cause) {
            if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Jobs could not be loaded.')
            if (requireConfirmation) throw cause
        } finally { if (current === generation.current) setBusy(false) }
    }, [getAccessToken])
    useEffect(() => {
        if (!UNIFIED_JOB_WALKTHROUGH) return
        const requestGeneration = generation
        const timer = setTimeout(() => void load(), 0)
        return () => { clearTimeout(timer); requestGeneration.current++ }
    }, [load])
    return { jobs, next, busy, error, reload: load, getAccessToken }
}
