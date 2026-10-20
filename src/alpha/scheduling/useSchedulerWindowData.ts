import { useCallback, useEffect, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { fetchJobsByIds } from '../jobs/services/jobsApi'
import { fetchJobScheduleOptionsForWindow } from '../jobs/services/jobScheduleApi'
import { fetchJobOfficeUpdatesForJobs } from '../jobs/services/jobOfficeUpdatesApi'
import { SERVICE_COORDINATION_BRANCH_ENABLED } from '../jobs/domain/serviceCoordinationConfig'
import { fetchServiceCoordinationContext } from '../jobs/services/serviceCoordinationApi'
import type { Job } from '../jobs/types/job.types'
import type { JobScheduleOption } from '../jobs/types/jobSchedule.types'
import type { JobOfficeUpdate } from '../jobs/types/officeAction.types'
import {
    operationalIdFingerprint,
    SCHEDULER_BRANCH_CONTEXT_QUERY_KEY,
    schedulerJobsQueryKey,
    schedulerOfficeUpdatesQueryKey,
    schedulerOptionsQueryKey,
} from '../shared/data/operationalCollectionKeys'
import { useOperationalDataClient } from '../shared/data/OperationalDataClientContext'
import { useOperationalQuery } from '../shared/data/useOperationalQuery'
import { adjacentSchedulerWindows, schedulerWindow, type SchedulerWindow } from './schedulerWindow'

const EMPTY_OPTIONS: JobScheduleOption[] = []
const EMPTY_JOBS: Job[] = []
const EMPTY_OFFICE_UPDATES: JobOfficeUpdate[] = []
const WINDOW_STALE_TIME_MS = 20_000
const WINDOW_CACHE_TIME_MS = 5 * 60_000

function optionJobIds(options: readonly JobScheduleOption[]) {
    return [...new Set(options
        .map((option) => option._gr_job_value?.toLowerCase())
        .filter((value): value is string => Boolean(value)))]
}

export function useSchedulerWindowData(weekStart: Date) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const client = useOperationalDataClient()
    const signedIn = Boolean(account)
    const window = useMemo(() => schedulerWindow(weekStart), [weekStart])
    const getToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )
    const branchContextQuery = useOperationalQuery({
        key: SCHEDULER_BRANCH_CONTEXT_QUERY_KEY,
        enabled: signedIn && SERVICE_COORDINATION_BRANCH_ENABLED,
        staleTimeMs: WINDOW_CACHE_TIME_MS,
        cacheTimeMs: WINDOW_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchServiceCoordinationContext(await getToken(), signal),
    })
    const branch = SERVICE_COORDINATION_BRANCH_ENABLED ? branchContextQuery.data?.branch : undefined
    const operatingBranch = branch?.value
    const enabled = signedIn && (!SERVICE_COORDINATION_BRANCH_ENABLED || operatingBranch !== undefined)
    const optionsKey = useMemo(
        () => schedulerOptionsQueryKey(window.startDate, window.endDate, operatingBranch),
        [operatingBranch, window.endDate, window.startDate],
    )
    const optionsQuery = useOperationalQuery<JobScheduleOption[]>({
        key: optionsKey,
        enabled,
        staleTimeMs: WINDOW_STALE_TIME_MS,
        cacheTimeMs: WINDOW_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchJobScheduleOptionsForWindow(
            await getToken(),
            window.startDate,
            window.endDate,
            signal,
            operatingBranch,
        ),
    })
    const scheduleOptions = optionsQuery.data ?? EMPTY_OPTIONS
    const jobIds = useMemo(() => optionJobIds(scheduleOptions), [scheduleOptions])
    const jobFingerprint = useMemo(() => operationalIdFingerprint(jobIds), [jobIds])
    const jobsKey = useMemo(
        () => schedulerJobsQueryKey(window.startDate, window.endDate, jobFingerprint, operatingBranch),
        [jobFingerprint, operatingBranch, window.endDate, window.startDate],
    )
    const optionsReady = optionsQuery.status !== 'initial' && optionsQuery.status !== 'loading'
    const jobsQuery = useOperationalQuery<Job[]>({
        key: jobsKey,
        enabled: enabled && optionsReady,
        staleTimeMs: WINDOW_STALE_TIME_MS,
        cacheTimeMs: WINDOW_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchJobsByIds(await getToken(), jobIds, signal, operatingBranch),
    })
    const scopedJobIds = useMemo(() => (jobsQuery.data ?? EMPTY_JOBS).map((job) => job.gr_jobid.toLowerCase()), [jobsQuery.data])
    const scopedJobIdSet = useMemo(() => new Set(scopedJobIds), [scopedJobIds])
    const scopedScheduleOptions = useMemo(() => scheduleOptions.filter((option) => {
        const jobId = option._gr_job_value?.toLowerCase()
        return Boolean(jobId && scopedJobIdSet.has(jobId))
    }), [scheduleOptions, scopedJobIdSet])
    const scopedJobFingerprint = useMemo(() => operationalIdFingerprint(scopedJobIds), [scopedJobIds])
    const jobsReady = jobsQuery.status !== 'initial' && jobsQuery.status !== 'loading'
    const officeUpdatesQuery = useOperationalQuery<JobOfficeUpdate[]>({
        key: schedulerOfficeUpdatesQueryKey(window.startDate, window.endDate, scopedJobFingerprint, operatingBranch),
        enabled: enabled && optionsReady && jobsReady,
        staleTimeMs: WINDOW_STALE_TIME_MS,
        cacheTimeMs: WINDOW_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchJobOfficeUpdatesForJobs(await getToken(), scopedJobIds, signal),
    })

    useEffect(() => {
        if (!enabled || optionsQuery.data === undefined) return
        const prefetchWindow = async (target: SchedulerWindow, token: string) => {
            const prefetchedOptions = await client.prefetchQuery(
                schedulerOptionsQueryKey(target.startDate, target.endDate, operatingBranch),
                ({ signal }) => fetchJobScheduleOptionsForWindow(
                    token,
                    target.startDate,
                    target.endDate,
                    signal,
                    operatingBranch,
                ),
                { staleTimeMs: WINDOW_STALE_TIME_MS, cacheTimeMs: WINDOW_CACHE_TIME_MS },
            )
            const prefetchedIds = optionJobIds(prefetchedOptions)
            await client.prefetchQuery(
                schedulerJobsQueryKey(
                    target.startDate,
                    target.endDate,
                    operationalIdFingerprint(prefetchedIds),
                    operatingBranch,
                ),
                ({ signal }) => fetchJobsByIds(token, prefetchedIds, signal, operatingBranch),
                { staleTimeMs: WINDOW_STALE_TIME_MS, cacheTimeMs: WINDOW_CACHE_TIME_MS },
            )
        }
        void getToken().then((token) => Promise.all(
            adjacentSchedulerWindows(weekStart).map((target) => prefetchWindow(target, token)),
        )).catch(() => undefined)
    }, [client, enabled, getToken, operatingBranch, optionsQuery.data, weekStart])

    const refetch = useCallback(async () => {
        if (!signedIn) return
        if (SERVICE_COORDINATION_BRANCH_ENABLED && operatingBranch === undefined) {
            await branchContextQuery.refetch()
            return
        }
        await Promise.all([optionsQuery.refetch(), jobsQuery.refetch(), officeUpdatesQuery.refetch()])
    }, [branchContextQuery, jobsQuery, officeUpdatesQuery, operatingBranch, optionsQuery, signedIn])
    const statuses = [optionsQuery.status, jobsQuery.status]
    const branchLoading = signedIn && SERVICE_COORDINATION_BRANCH_ENABLED
        && (branchContextQuery.status === 'initial' || branchContextQuery.status === 'loading')
    const isLoading = branchLoading || (enabled && statuses.some((status) => status === 'initial' || status === 'loading'))
    const error = branchContextQuery.error ?? optionsQuery.error ?? jobsQuery.error

    return {
        jobs: jobsQuery.data ?? EMPTY_JOBS,
        scheduleOptions: scopedScheduleOptions,
        officeUpdates: officeUpdatesQuery.data ?? EMPTY_OFFICE_UPDATES,
        branch,
        isLoading,
        isRefreshing: statuses.some((status) => status === 'refreshing'),
        error: error?.message ?? '',
        refetch,
    }
}
