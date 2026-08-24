import { useCallback, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { useOperationalQuery } from '../../shared/data/useOperationalQuery'
import { fetchEquipmentJobs } from '../../jobs/services/jobsApi'
import type { Job } from '../../jobs/types/job.types'

export const EQUIPMENT_JOB_HISTORY_STALE_TIME_MS = 30_000
export const EQUIPMENT_JOB_HISTORY_CACHE_TIME_MS = 60_000

export function equipmentJobHistoryQueryKey(equipmentId: string) {
    return ['equipment', equipmentId.toLowerCase(), 'jobs', 'summary-v1'] as const
}

export function useEquipmentJobHistory(equipmentId?: string | null) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const normalizedEquipmentId = equipmentId?.toLowerCase() ?? ''
    const key = useMemo(() => equipmentJobHistoryQueryKey(normalizedEquipmentId), [normalizedEquipmentId])
    const queryFn = useCallback(async ({ signal }: { signal: AbortSignal }) => {
        if (!normalizedEquipmentId) return [] as Job[]
        const token = await acquireDataverseAccessToken(instance, account)
        return fetchEquipmentJobs(token, normalizedEquipmentId, signal)
    }, [account, instance, normalizedEquipmentId])
    const query = useOperationalQuery<Job[]>({
        key,
        enabled: Boolean(account && normalizedEquipmentId),
        queryFn,
        staleTimeMs: EQUIPMENT_JOB_HISTORY_STALE_TIME_MS,
        cacheTimeMs: EQUIPMENT_JOB_HISTORY_CACHE_TIME_MS,
    })

    return {
        jobs: query.data ?? [],
        isLoading: query.status === 'initial' || query.status === 'loading',
        isRefreshing: query.status === 'refreshing',
        error: query.error?.message ?? '',
        refetch: query.refetch,
    }
}
