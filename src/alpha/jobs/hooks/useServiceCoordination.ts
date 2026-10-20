import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount.ts'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication.ts'
import { JOB_CARD_PROGRESS_SUMMARY_ENABLED, SERVICE_COORDINATION_BRANCH_ENABLED, SERVICE_COORDINATION_CLIENT_ENABLED, SERVICE_COORDINATION_WATCHLIST_ENABLED } from '../domain/serviceCoordinationConfig.ts'
import { fetchJobCardProgressSummaries, fetchPersonalJobWatches, fetchServiceCoordinationContext, setPersonalJobWatch } from '../services/serviceCoordinationApi.ts'
import type { Job } from '../types/job.types.ts'
import type { JobCardProgressSummary, PersonalJobWatch, ServiceCoordinationContext } from '../types/serviceCoordination.types.ts'

export function useServiceCoordination() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const generation = useRef(0)
    const [context, setContext] = useState<ServiceCoordinationContext | null>(null)
    const [watches, setWatches] = useState<PersonalJobWatch[]>([])
    const [busy, setBusy] = useState(SERVICE_COORDINATION_CLIENT_ENABLED)
    const [contextError, setContextError] = useState('')
    const [watchError, setWatchError] = useState('')
    const getToken = useCallback(() => acquireDataverseAccessToken(instance, account), [account, instance])

    const load = useCallback(async () => {
        if (!SERVICE_COORDINATION_CLIENT_ENABLED || !account) return
        const current = ++generation.current
        setBusy(true); setContextError(''); setWatchError('')
        setContext(null); setWatches([])
        try {
            const token = await getToken()
            const [contextResult, watchesResult] = await Promise.allSettled([
                SERVICE_COORDINATION_BRANCH_ENABLED ? fetchServiceCoordinationContext(token) : Promise.resolve(null),
                SERVICE_COORDINATION_WATCHLIST_ENABLED ? fetchPersonalJobWatches(token) : Promise.resolve([]),
            ])
            if (current !== generation.current) return
            if (contextResult.status === 'fulfilled') setContext(contextResult.value)
            else setContextError(contextResult.reason instanceof Error ? contextResult.reason.message : 'Your Service Coordination branch could not be loaded.')
            if (watchesResult.status === 'fulfilled') setWatches(watchesResult.value)
            else setWatchError(watchesResult.reason instanceof Error ? watchesResult.reason.message : 'Your personal watchlist could not be loaded.')
        } finally {
            if (current === generation.current) setBusy(false)
        }
    }, [account, getToken])

    useEffect(() => {
        if (!SERVICE_COORDINATION_CLIENT_ENABLED) return
        const timer = window.setTimeout(() => { void load() }, 0)
        return () => { window.clearTimeout(timer); generation.current += 1 }
    }, [load])

    const watchedJobIds = useMemo(() => new Set(watches.map((item) => item.job.gr_jobid.toLowerCase())), [watches])
    const toggleWatch = useCallback(async (job: Job) => {
        if (!SERVICE_COORDINATION_WATCHLIST_ENABLED) return
        const jobId = job.gr_jobid.toLowerCase()
        const watched = watchedJobIds.has(jobId)
        const previous = watches
        setWatchError('')
        setWatches((current) => watched
            ? current.filter((item) => item.job.gr_jobid.toLowerCase() !== jobId)
            : [{ watchId: `pending:${jobId}`, watchedOn: new Date().toISOString(), job }, ...current])
        try {
            await setPersonalJobWatch(await getToken(), jobId, !watched)
        } catch (cause) {
            setWatches(previous)
            const message = cause instanceof Error ? cause.message : 'Your personal watchlist could not be updated.'
            setWatchError(message)
            throw cause
        }
    }, [getToken, watchedJobIds, watches])

    return { context, watches, watchedJobIds, busy, contextError, watchError, reload: load, toggleWatch }
}

export function useJobCardProgress(jobs: readonly Job[]) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const generation = useRef(0)
    const [summaries, setSummaries] = useState<Record<string, JobCardProgressSummary>>({})
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const jobIds = useMemo(() => [...new Set(jobs.map((job) => job.gr_jobid.toLowerCase()))].sort(), [jobs])
    const jobKey = jobIds.join(',')
    useEffect(() => {
        const requestedJobIds = jobKey ? jobKey.split(',') : []
        if (!JOB_CARD_PROGRESS_SUMMARY_ENABLED || !account || !requestedJobIds.length) {
            const reset = window.setTimeout(() => { setSummaries({}); setBusy(false); setError('') }, 0)
            return () => window.clearTimeout(reset)
        }
        const controller = new AbortController()
        const current = ++generation.current
        const start = window.setTimeout(() => { setBusy(true); setError(''); void (async () => {
            try {
                const token = await acquireDataverseAccessToken(instance, account)
                const next: Record<string, JobCardProgressSummary> = {}
                for (let start = 0; start < requestedJobIds.length; start += 100) {
                    const result = await fetchJobCardProgressSummaries(token, requestedJobIds.slice(start, start + 100), controller.signal)
                    result.items.forEach((item) => { next[item.jobId.toLowerCase()] = item })
                }
                if (current === generation.current) setSummaries(next)
            } catch (cause) {
                if (!controller.signal.aborted && current === generation.current) setError(cause instanceof Error ? cause.message : 'Job Card progress is unavailable.')
            } finally {
                if (current === generation.current) setBusy(false)
            }
        })() }, 0)
        return () => { window.clearTimeout(start); controller.abort(); generation.current += 1 }
    }, [account, instance, jobKey])
    return { summaries, busy, error }
}
