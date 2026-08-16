import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import type { Site } from '../../jobs/types/site.types'
import { createSiteChecksDataCoordinator, type SiteChecksSnapshot } from '../services/siteChecksCoordinator'
import {
    allocateSiteCheckJobNumbers,
    clearSiteCheckJobNumber,
    deleteSiteCheckOccurrence,
    fetchSiteCheckDetailJobsPage,
    fetchSiteCheckEquipmentExclusionsPage,
    fetchSiteCheckHistoryPage,
    fetchSiteCheckSchedulesForSites,
} from '../services/siteChecksApi'
import {
    fetchSiteCheckEquipmentForSite,
    startSiteCheckWorkflow,
    type StartSiteCheckWorkflowInput,
} from '../services/siteCheckCreationWorkflow'
import {
    fetchSiteCheckWorkspaceMechanics,
    fetchSiteCheckWorkspaceSites,
} from '../services/siteCheckWorkspaceApi'
import type {
    SiteCheck,
    SiteCheckDetailJob,
    SiteCheckEquipmentExclusion,
} from '../types/siteCheck.types'
import { subscribeToStaffChanges } from '../../mechanics/services/staffRealtime'
import {
    prepareSiteCheckAssignmentEmail,
    type SiteCheckAssignmentEmailInput,
} from '../services/siteCheckAssignmentApi'

const EMPTY_SNAPSHOT: SiteChecksSnapshot = {
    schedules: [],
    siteChecks: [],
    jobs: [],
    scheduleEquipment: [],
}

export function useSiteCheckWorkspace() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [sites, setSites] = useState<Site[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [snapshot, setSnapshot] = useState<SiteChecksSnapshot>(EMPTY_SNAPSHOT)
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [requiresInteraction, setRequiresInteraction] = useState(false)
    const [isStarting, setIsStarting] = useState(false)
    const [startError, setStartError] = useState('')
    const requestVersion = useRef(0)

    const acquireAccessToken = useCallback(async () => {
        return acquireDataverseAccessToken(instance, account)
    }, [account, instance])

    const coordinator = useMemo(
        () => createSiteChecksDataCoordinator({
            acquireAccessToken,
            fetchSchedules: (token, siteIds) =>
                fetchSiteCheckSchedulesForSites(token, siteIds, { enabledOnly: true }),
        }),
        [acquireAccessToken],
    )

    useEffect(() => {
        if (!account) return
        let cancelled = false
        let refreshTimer: number | undefined
        const unsubscribe = subscribeToStaffChanges(() => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(async () => {
                try {
                    const rows = await fetchSiteCheckWorkspaceMechanics(await acquireAccessToken())
                    if (!cancelled) setMechanics(rows)
                } catch { /* Keep the current Staff choices until the next refresh. */ }
            }, 750)
        })
        return () => {
            cancelled = true
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            unsubscribe()
        }
    }, [account, acquireAccessToken])

    const load = useCallback(async (suppliedToken?: string) => {
        const version = ++requestVersion.current
        if (!account) return
        setIsLoading(true)
        setLoadError('')
        setRequiresInteraction(false)
        try {
            const token = suppliedToken ?? await acquireAccessToken()
            const [nextSites, nextMechanics] = await Promise.all([
                fetchSiteCheckWorkspaceSites(token),
                fetchSiteCheckWorkspaceMechanics(token),
            ])
            const siteIds = nextSites.map((site) => site.gr_siteid)
            const scopes = Array.from(
                { length: Math.ceil(siteIds.length / 100) },
                (_, index) => siteIds.slice(index * 100, index * 100 + 100),
            )
            const snapshots = await Promise.all(scopes.map((scope) =>
                coordinator.loadSiteChecks(scope, token)))
            const nextSnapshot = snapshots.reduce<SiteChecksSnapshot>((combined, part) => ({
                schedules: [...combined.schedules, ...part.schedules],
                siteChecks: [...combined.siteChecks, ...part.siteChecks],
                jobs: [...combined.jobs, ...part.jobs],
                scheduleEquipment: [...combined.scheduleEquipment, ...part.scheduleEquipment],
            }), EMPTY_SNAPSHOT)
            if (requestVersion.current === version) {
                setSites(nextSites)
                setMechanics(nextMechanics)
                setSnapshot(nextSnapshot)
            }
        } catch (cause) {
            if (requestVersion.current === version) {
                setLoadError(cause instanceof Error ? cause.message : 'Site Checks could not be loaded.')
                setRequiresInteraction(cause instanceof InteractionRequiredAuthError)
            }
            throw cause
        } finally {
            if (requestVersion.current === version) setIsLoading(false)
        }
    }, [account, acquireAccessToken, coordinator])

    useEffect(() => {
        const timer = window.setTimeout(() => void load().catch(() => undefined), 0)
        return () => {
            window.clearTimeout(timer)
            requestVersion.current += 1
        }
    }, [load])

    useEffect(() => {
        const refresh = () => void load().catch(() => undefined)
        window.addEventListener('site-checks-changed', refresh)
        return () => window.removeEventListener('site-checks-changed', refresh)
    }, [load])

    const startSiteCheck = useCallback(async (input: StartSiteCheckWorkflowInput) => {
        setIsStarting(true)
        setStartError('')
        try {
            const token = await acquireAccessToken()
            const occurrence = await startSiteCheckWorkflow(token, input)
            await load(token)
            return occurrence
        } catch (cause) {
            setStartError(cause instanceof Error ? cause.message : 'The Site Check could not be started.')
            throw cause
        } finally {
            setIsStarting(false)
        }
    }, [acquireAccessToken, load])

    const loadSiteEquipment = useCallback(async (siteId: string): Promise<Equipment[]> => {
        const token = await acquireAccessToken()
        return await fetchSiteCheckEquipmentForSite(token, siteId) as Equipment[]
    }, [acquireAccessToken])

    const loadHistoryPage = useCallback(async (siteId: string, nextLink?: string) =>
        fetchSiteCheckHistoryPage(await acquireAccessToken(), siteId, nextLink), [acquireAccessToken])
    const loadDetailJobsPage = useCallback(async (siteCheckId: string, nextLink?: string) =>
        fetchSiteCheckDetailJobsPage(await acquireAccessToken(), siteCheckId, nextLink), [acquireAccessToken])

    const loadAllDetailJobs = useCallback(async (siteCheckId: string) => {
        const token = await acquireAccessToken()
        const records: SiteCheckDetailJob[] = []
        let nextLink: string | undefined
        do {
            const page = await fetchSiteCheckDetailJobsPage(token, siteCheckId, nextLink)
            records.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        return records
    }, [acquireAccessToken])

    const loadAllEquipmentExclusions = useCallback(async (siteCheckId: string) => {
        const token = await acquireAccessToken()
        const records: SiteCheckEquipmentExclusion[] = []
        let nextLink: string | undefined
        do {
            const page = await fetchSiteCheckEquipmentExclusionsPage(token, siteCheckId, nextLink)
            records.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        return records
    }, [acquireAccessToken])

    const allocateJobNumbers = useCallback(async (
        allocations: readonly { job: SiteCheckDetailJob; jobNumber: string }[],
    ) => allocateSiteCheckJobNumbers(await acquireAccessToken(), allocations), [acquireAccessToken])

    const clearJobNumber = useCallback(async (job: SiteCheckDetailJob) =>
        clearSiteCheckJobNumber(await acquireAccessToken(), job), [acquireAccessToken])

    const deleteOccurrence = useCallback(async (occurrence: SiteCheck) => {
        const token = await acquireAccessToken()
        const jobs: SiteCheckDetailJob[] = []
        const exclusions: SiteCheckEquipmentExclusion[] = []
        let nextLink: string | undefined
        do {
            const page = await fetchSiteCheckDetailJobsPage(token, occurrence.gr_sitecheckid, nextLink)
            jobs.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        nextLink = undefined
        do {
            const page = await fetchSiteCheckEquipmentExclusionsPage(token, occurrence.gr_sitecheckid, nextLink)
            exclusions.push(...page.records)
            nextLink = page.nextLink
        } while (nextLink)
        const schedule = snapshot.schedules.find((item) =>
            item.gr_sitecheckscheduleid.toLowerCase() === occurrence._gr_sitecheckschedule_value.toLowerCase())
        await deleteSiteCheckOccurrence(token, occurrence, jobs, exclusions, schedule)
        await load(token)
    }, [acquireAccessToken, load, snapshot.schedules])

    const prepareAssignmentEmail = useCallback(async (input: SiteCheckAssignmentEmailInput) =>
        prepareSiteCheckAssignmentEmail(await acquireAccessToken(), input), [acquireAccessToken])

    return {
        sites,
        mechanics,
        ...snapshot,
        isLoading,
        loadError,
        requiresInteraction,
        refresh: load,
        isStarting,
        startError,
        clearStartError: () => setStartError(''),
        startSiteCheck,
        loadSiteEquipment,
        loadHistoryPage,
        loadDetailJobsPage,
        loadAllDetailJobs,
        loadAllEquipmentExclusions,
        allocateJobNumbers,
        clearJobNumber,
        prepareAssignmentEmail,
        deleteOccurrence,
    }
}
