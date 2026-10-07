import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { fetchWalkthroughJobsPage } from '../services/unifiedJobWalkthroughApi'
import { fetchUnifiedJobsPage, type UnifiedJobsServerScope } from '../services/jobsApi'
import { UNIFIED_JOB_RUNTIME, UNIFIED_JOB_WALKTHROUGH } from '../domain/unifiedJobWorkflow'
import type { Job } from '../types/job.types'

function mergeJobs(current: readonly Job[], incoming: readonly Job[]) {
    const rows = new Map(current.map((job) => [job.gr_jobid.toLowerCase(), job]))
    incoming.forEach((job) => rows.set(job.gr_jobid.toLowerCase(), job))
    return [...rows.values()]
}

export function useUnifiedJobWorklist(loadCompletedArchive = false) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const getAccessToken = useCallback(() => acquireDataverseAccessToken(instance, account), [instance, account])
    const [jobs, setJobs] = useState<Job[]>([])
    const [busy, setBusy] = useState(UNIFIED_JOB_RUNTIME)
    const [backgroundBusy, setBackgroundBusy] = useState(false)
    const [error, setError] = useState('')
    const generation = useRef(0)
    const archiveLoaded = useRef(false)
    const archiveLoading = useRef(false)

    const fetchScope = useCallback(async (token: string, scope: UnifiedJobsServerScope, current: number) => {
        const rows = new Map<string, Job>()
        const seen = new Set<string>()
        let cursor = ''
        for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
            const page = await fetchUnifiedJobsPage(token, scope, cursor)
            if (current !== generation.current) return []
            for (const row of page.records) rows.set(row.gr_jobid.toLowerCase(), row)
            if (!page.next) { cursor = ''; break }
            if (seen.has(page.next)) throw new Error('Dataverse returned a repeated Jobs continuation page.')
            seen.add(page.next)
            cursor = page.next
        }
        if (cursor) throw new Error('The Jobs worklist exceeded its safe automatic paging limit.')
        return [...rows.values()]
    }, [])

    const fetchWalkthrough = useCallback(async (token: string, current: number) => {
        const rows = new Map<string, Job>()
        const seen = new Set<string>()
        let cursor = ''
        for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
            const page = await fetchWalkthroughJobsPage(token, cursor)
            if (current !== generation.current) return []
            page.records.forEach((row) => rows.set(row.gr_jobid.toLowerCase(), row))
            if (!page.next) { cursor = ''; break }
            if (seen.has(page.next)) throw new Error('The walkthrough returned a repeated Jobs continuation page.')
            seen.add(page.next)
            cursor = page.next
        }
        if (cursor) throw new Error('The walkthrough exceeded its safe automatic paging limit.')
        return [...rows.values()]
    }, [])

    const loadArchive = useCallback(async (current = generation.current) => {
        if (!UNIFIED_JOB_RUNTIME || UNIFIED_JOB_WALKTHROUGH || archiveLoaded.current || archiveLoading.current) return
        archiveLoading.current = true
        setBackgroundBusy(true)
        try {
            const token = await getAccessToken()
            const rows = await fetchScope(token, 'complete-archive', current)
            if (current === generation.current) {
                setJobs((existing) => mergeJobs(existing, rows))
                archiveLoaded.current = true
            }
        } catch (cause) {
            if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Completed Job history could not be loaded.')
        } finally {
            archiveLoading.current = false
            if (current === generation.current) setBackgroundBusy(false)
        }
    }, [fetchScope, getAccessToken])

    const load = useCallback(async (requireConfirmation = false) => {
        if (!UNIFIED_JOB_RUNTIME) return
        const current = ++generation.current
        archiveLoaded.current = false
        setBusy(true); setError('')
        try {
            const token = await getAccessToken()
            const priority = UNIFIED_JOB_WALKTHROUGH
                ? await fetchWalkthrough(token, current)
                : await fetchScope(token, 'priority', current)
            if (current !== generation.current) {
                if (requireConfirmation) throw new Error('A newer refresh started. Retry to confirm this saved Job.')
                return
            }
            setJobs(priority)
            setBusy(false)
            if (!UNIFIED_JOB_WALKTHROUGH) {
                setBackgroundBusy(true)
                const [deferred, recentComplete] = await Promise.all([
                    fetchScope(token, 'deferred', current),
                    fetchScope(token, 'recent-complete', current),
                ])
                if (current === generation.current) setJobs((existing) => mergeJobs(mergeJobs(existing, deferred), recentComplete))
                setBackgroundBusy(false)
            }
        } catch (cause) {
            if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Jobs could not be loaded.')
            if (requireConfirmation) throw cause
        } finally {
            if (current === generation.current) { setBusy(false); setBackgroundBusy(false) }
        }
    }, [fetchScope, fetchWalkthrough, getAccessToken])
    useEffect(() => {
        if (!UNIFIED_JOB_RUNTIME) return
        const requestGeneration = generation
        const timer = setTimeout(() => void load(), 0)
        return () => { clearTimeout(timer); requestGeneration.current++ }
    }, [load])
    useEffect(() => {
        if (loadCompletedArchive && !busy && !backgroundBusy) void loadArchive()
    }, [backgroundBusy, busy, loadArchive, loadCompletedArchive])
    return { jobs, busy, backgroundBusy, error, reload: load, getAccessToken }
}
