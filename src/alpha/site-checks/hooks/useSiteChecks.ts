import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import {
    createSiteChecksDataCoordinator,
    type SiteChecksSnapshot,
} from '../services/siteChecksCoordinator'
import {
    allocateSiteCheckJobNumbers,
    deleteSiteCheckOccurrence,
    fetchSiteCheckDetailJobsPage,
    fetchSiteCheckEquipmentExclusionsPage,
    fetchSiteCheckHistoryPage,
    saveSiteCheckScheduleConfiguration,
} from '../services/siteChecksApi'
import { startSiteCheckWorkflow, type StartSiteCheckWorkflowInput } from '../services/siteCheckCreationWorkflow'
import type {
    SiteCheck,
    SiteCheckDetailJob,
    SiteCheckEquipmentExclusion,
    SiteCheckScheduleSaveInput,
} from '../types/siteCheck.types'

const EMPTY_SNAPSHOT: SiteChecksSnapshot = {
    schedules: [],
    siteChecks: [],
    jobs: [],
    scheduleEquipment: [],
}
const silentTokenRequests = new Map<string, Promise<string>>()

function normalizedScope(siteIds: readonly string[]) {
    return [...new Set(siteIds.map((id) => id.toLowerCase()))].sort().join(',')
}

export function useSiteChecks(siteIds: readonly string[]) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [snapshot, setSnapshot] = useState<SiteChecksSnapshot>(EMPTY_SNAPSHOT)
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [requiresInteraction, setRequiresInteraction] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [isStarting, setIsStarting] = useState(false)
    const [startError, setStartError] = useState('')
    const requestVersion = useRef(0)
    const siteScope = normalizedScope(siteIds)

    const acquireAccessToken = useCallback(async () => {
        if (!account) {
            throw new Error('No active Microsoft account is available. Sign in again and retry.')
        }
        const requestKey = `${account.homeAccountId}:${import.meta.env.VITE_DATAVERSE_URL}`
        const existingRequest = silentTokenRequests.get(requestKey)
        if (existingRequest) return existingRequest
        const request = instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account,
        }).then((response) => response.accessToken)
        silentTokenRequests.set(requestKey, request)
        try {
            return await request
        } finally {
            if (silentTokenRequests.get(requestKey) === request) silentTokenRequests.delete(requestKey)
        }
    }, [account, instance])

    const coordinator = useMemo(
        () => createSiteChecksDataCoordinator({ acquireAccessToken }),
        [acquireAccessToken],
    )

    const load = useCallback(async () => {
        const version = ++requestVersion.current
        if (!siteScope) {
            setSnapshot(EMPTY_SNAPSHOT)
            setIsLoading(false)
            setLoadError('')
            setRequiresInteraction(false)
            return EMPTY_SNAPSHOT
        }
        if (!account) {
            setSnapshot(EMPTY_SNAPSHOT)
            setIsLoading(false)
            setLoadError('')
            setRequiresInteraction(false)
            return EMPTY_SNAPSHOT
        }

        setIsLoading(true)
        setLoadError('')
        setRequiresInteraction(false)
        try {
            const next = await coordinator.loadSiteChecks(siteScope.split(','))
            if (requestVersion.current === version) setSnapshot(next)
            return next
        } catch (error) {
            if (requestVersion.current === version) {
                setLoadError(error instanceof Error
                    ? error.message
                    : 'Site Check information could not be loaded.')
                setRequiresInteraction(error instanceof InteractionRequiredAuthError)
            }
            throw error
        } finally {
            if (requestVersion.current === version) setIsLoading(false)
        }
    }, [account, coordinator, siteScope])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void load().catch(() => {
                // State is set by load; authentication remains explicitly user initiated.
            })
        }, 0)
        return () => {
            window.clearTimeout(timer)
            requestVersion.current += 1
        }
    }, [load])

    useEffect(() => {
        const refreshAfterJobChange = () => {
            void load().catch(() => {
                // State is set by load; this remains silent and never opens an auth prompt.
            })
        }
        window.addEventListener('site-checks-changed', refreshAfterJobChange)
        return () => window.removeEventListener('site-checks-changed', refreshAfterJobChange)
    }, [load])

    const saveSchedule = useCallback(async (input: SiteCheckScheduleSaveInput) => {
        const existing = snapshot.schedules.find(
            (schedule) => schedule._gr_site_value.toLowerCase() === input.siteId.toLowerCase(),
        )
        setIsSaving(true)
        setSaveError('')
        setRequiresInteraction(false)
        try {
            const accessToken = await acquireAccessToken()
            await saveSiteCheckScheduleConfiguration(accessToken, input, existing)
            const next = await coordinator.loadSiteChecks(siteScope.split(','), accessToken)
            setSnapshot(next)
            return next.schedules.find(
                (schedule) => schedule._gr_site_value.toLowerCase() === input.siteId.toLowerCase(),
            )
        } catch (error) {
            setSaveError(error instanceof Error
                ? error.message
                : 'The Site Check Schedule could not be saved.')
            setRequiresInteraction(error instanceof InteractionRequiredAuthError)
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [acquireAccessToken, coordinator, siteScope, snapshot.schedules])

    const startSiteCheck = useCallback(async (input: StartSiteCheckWorkflowInput) => {
        setIsStarting(true)
        setStartError('')
        setRequiresInteraction(false)
        try {
            const accessToken = await acquireAccessToken()
            const occurrence = await startSiteCheckWorkflow(accessToken, input)
            const next = await coordinator.loadSiteChecks(siteScope.split(','), accessToken)
            setSnapshot(next)
            return occurrence
        } catch (error) {
            setStartError(error instanceof Error ? error.message : 'The Site Check could not be started.')
            setRequiresInteraction(error instanceof InteractionRequiredAuthError)
            throw error
        } finally {
            setIsStarting(false)
        }
    }, [acquireAccessToken, coordinator, siteScope])

    const loadHistoryPage = useCallback(async (siteId: string, nextLink?: string) => {
        const accessToken = await acquireAccessToken()
        return fetchSiteCheckHistoryPage(accessToken, siteId, nextLink)
    }, [acquireAccessToken])

    const loadDetailJobsPage = useCallback(async (siteCheckId: string, nextLink?: string) => {
        const accessToken = await acquireAccessToken()
        return fetchSiteCheckDetailJobsPage(accessToken, siteCheckId, nextLink)
    }, [acquireAccessToken])

    const loadAllDetailJobs = useCallback(async (siteCheckId: string) => {
        const accessToken = await acquireAccessToken()
        const records: SiteCheckDetailJob[] = []
        let nextLink: string | undefined
        do {
            const page = await fetchSiteCheckDetailJobsPage(accessToken, siteCheckId, nextLink)
            records.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        return records
    }, [acquireAccessToken])

    const loadAllEquipmentExclusions = useCallback(async (siteCheckId: string) => {
        const accessToken = await acquireAccessToken()
        const records: SiteCheckEquipmentExclusion[] = []
        let nextLink: string | undefined
        do {
            const page = await fetchSiteCheckEquipmentExclusionsPage(
                accessToken,
                siteCheckId,
                nextLink,
            )
            records.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        return records
    }, [acquireAccessToken])

    const allocateJobNumbers = useCallback(async (
        allocations: readonly { job: SiteCheckDetailJob; jobNumber: string }[],
    ) => {
        const accessToken = await acquireAccessToken()
        await allocateSiteCheckJobNumbers(accessToken, allocations)
    }, [acquireAccessToken])

    const deleteOccurrence = useCallback(async (occurrence: SiteCheck) => {
        const accessToken = await acquireAccessToken()
        const jobs: SiteCheckDetailJob[] = []
        const exclusions: SiteCheckEquipmentExclusion[] = []
        let nextLink: string | undefined
        do {
            const page = await fetchSiteCheckDetailJobsPage(
                accessToken,
                occurrence.gr_sitecheckid,
                nextLink,
            )
            jobs.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        nextLink = undefined
        do {
            const page = await fetchSiteCheckEquipmentExclusionsPage(
                accessToken,
                occurrence.gr_sitecheckid,
                nextLink,
            )
            exclusions.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        const schedule = snapshot.schedules.find((item) =>
            item.gr_sitecheckscheduleid.toLowerCase()
            === occurrence._gr_sitecheckschedule_value.toLowerCase())
        await deleteSiteCheckOccurrence(accessToken, occurrence, jobs, exclusions, schedule)
        const next = await coordinator.loadSiteChecks(siteScope.split(','), accessToken)
        setSnapshot(next)
        return jobs.length
    }, [acquireAccessToken, coordinator, siteScope, snapshot.schedules])

    return {
        ...snapshot,
        isLoading,
        loadError,
        requiresInteraction,
        refresh: load,
        isSaving,
        saveError,
        saveSchedule,
        isStarting,
        startError,
        startSiteCheck,
        clearStartError: () => setStartError(''),
        loadHistoryPage,
        loadDetailJobsPage,
        loadAllDetailJobs,
        loadAllEquipmentExclusions,
        allocateJobNumbers,
        deleteOccurrence,
    }
}
