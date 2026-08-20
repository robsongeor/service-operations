import { useCallback, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import type { Job } from '../jobs/types/job.types'
import type { JobStatus } from '../jobs/types/jobStatus.types'
import { jobMapJobsQueryKey } from '../shared/data/operationalCollectionKeys'
import { useOperationalDataClient } from '../shared/data/OperationalDataClientContext'
import { useOperationalQuery } from '../shared/data/useOperationalQuery'
import { JOB_MAP_STATUSES } from './jobMap'
import { canonicalJobMapStatuses, fetchJobMapJobs } from './jobMapApi'

const EMPTY_JOBS: Job[] = []
const JOB_MAP_STALE_TIME_MS = 20_000
const JOB_MAP_CACHE_TIME_MS = 5 * 60_000
const ALL_STATUSES_KEY = jobMapJobsQueryKey(JOB_MAP_STATUSES)

export function useJobMapData(requestedStatuses: readonly JobStatus[]) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const client = useOperationalDataClient()
    const statuses = useMemo(
        () => canonicalJobMapStatuses(requestedStatuses),
        [requestedStatuses],
    )
    const enabled = Boolean(account && statuses.length)
    const key = useMemo(() => jobMapJobsQueryKey(statuses), [statuses])
    const getToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )
    const query = useOperationalQuery<Job[]>({
        key,
        enabled,
        staleTimeMs: JOB_MAP_STALE_TIME_MS,
        cacheTimeMs: JOB_MAP_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchJobMapJobs(await getToken(), statuses, signal),
    })

    const allStatusJobs = client.getState<Job[]>(ALL_STATUSES_KEY).data
    const jobs = statuses.length
        ? (query.data ?? allStatusJobs?.filter((job) => statuses.includes(job.gr_status)) ?? EMPTY_JOBS)
        : EMPTY_JOBS
    const hasUsableData = query.data !== undefined || allStatusJobs !== undefined

    const refetchQuery = query.refetch
    const refetch = useCallback(async () => {
        if (!enabled) return EMPTY_JOBS
        return refetchQuery()
    }, [enabled, refetchQuery])
    const isQueryLoading = query.status === 'initial' || query.status === 'loading'
    const errorMessage = query.error?.message ?? ''

    return {
        jobs,
        isLoading: enabled && isQueryLoading && !hasUsableData,
        isRefreshing: enabled && (query.status === 'refreshing' || (isQueryLoading && hasUsableData)),
        loadError: errorMessage && !hasUsableData ? errorMessage : '',
        refreshError: errorMessage && hasUsableData ? errorMessage : '',
        refetch,
    }
}
