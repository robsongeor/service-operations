import { useCallback, useEffect, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { fetchJobsByIds } from '../jobs/services/jobsApi'
import { fetchJobScheduleOptionsForWindow } from '../jobs/services/jobScheduleApi'
import { fetchJobOfficeUpdatesForJobs } from '../jobs/services/jobOfficeUpdatesApi'
import type { Job } from '../jobs/types/job.types'
import type { JobScheduleOption } from '../jobs/types/jobSchedule.types'
import type { JobOfficeUpdate } from '../jobs/types/officeAction.types'
import {
    operationalIdFingerprint,
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
    const enabled = Boolean(account)
    const window = useMemo(() => schedulerWindow(weekStart), [weekStart])
    const getToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )
    const optionsKey = useMemo(
        () => schedulerOptionsQueryKey(window.startDate, window.endDate),
        [window.endDate, window.startDate],
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
        ),
    })
    const scheduleOptions = optionsQuery.data ?? EMPTY_OPTIONS
    const jobIds = useMemo(() => optionJobIds(scheduleOptions), [scheduleOptions])
    const jobFingerprint = useMemo(() => operationalIdFingerprint(jobIds), [jobIds])
    const jobsKey = useMemo(
        () => schedulerJobsQueryKey(window.startDate, window.endDate, jobFingerprint),
        [jobFingerprint, window.endDate, window.startDate],
    )
    const optionsReady = optionsQuery.status !== 'initial' && optionsQuery.status !== 'loading'
    const jobsQuery = useOperationalQuery<Job[]>({
        key: jobsKey,
        enabled: enabled && optionsReady,
        staleTimeMs: WINDOW_STALE_TIME_MS,
        cacheTimeMs: WINDOW_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchJobsByIds(await getToken(), jobIds, signal),
    })
    const officeUpdatesQuery = useOperationalQuery<JobOfficeUpdate[]>({
        key: schedulerOfficeUpdatesQueryKey(window.startDate, window.endDate, jobFingerprint),
        enabled: enabled && optionsReady,
        staleTimeMs: WINDOW_STALE_TIME_MS,
        cacheTimeMs: WINDOW_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchJobOfficeUpdatesForJobs(await getToken(), jobIds, signal),
    })

    useEffect(() => {
        if (!enabled || optionsQuery.data === undefined) return
        const prefetchWindow = async (target: SchedulerWindow, token: string) => {
            const prefetchedOptions = await client.prefetchQuery(
                schedulerOptionsQueryKey(target.startDate, target.endDate),
                ({ signal }) => fetchJobScheduleOptionsForWindow(
                    token,
                    target.startDate,
                    target.endDate,
                    signal,
                ),
                { staleTimeMs: WINDOW_STALE_TIME_MS, cacheTimeMs: WINDOW_CACHE_TIME_MS },
            )
            const prefetchedIds = optionJobIds(prefetchedOptions)
            await client.prefetchQuery(
                schedulerJobsQueryKey(
                    target.startDate,
                    target.endDate,
                    operationalIdFingerprint(prefetchedIds),
                ),
                ({ signal }) => fetchJobsByIds(token, prefetchedIds, signal),
                { staleTimeMs: WINDOW_STALE_TIME_MS, cacheTimeMs: WINDOW_CACHE_TIME_MS },
            )
        }
        void getToken().then((token) => Promise.all(
            adjacentSchedulerWindows(weekStart).map((target) => prefetchWindow(target, token)),
        )).catch(() => undefined)
    }, [client, enabled, getToken, optionsQuery.data, weekStart])

    const refetch = useCallback(async () => {
        if (!enabled) return
        await Promise.all([optionsQuery.refetch(), jobsQuery.refetch(), officeUpdatesQuery.refetch()])
    }, [enabled, jobsQuery, officeUpdatesQuery, optionsQuery])
    const statuses = [optionsQuery.status, jobsQuery.status]
    const isLoading = enabled && statuses.some((status) => status === 'initial' || status === 'loading')
    const error = optionsQuery.error ?? jobsQuery.error

    return {
        jobs: jobsQuery.data ?? EMPTY_JOBS,
        scheduleOptions,
        officeUpdates: officeUpdatesQuery.data ?? EMPTY_OFFICE_UPDATES,
        isLoading,
        isRefreshing: statuses.some((status) => status === 'refreshing'),
        error: error?.message ?? '',
        refetch,
    }
}
