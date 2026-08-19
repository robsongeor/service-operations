import { useCallback, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useOperationalQuery } from '../shared/data/useOperationalQuery'
import {
    customerDashboardEquipmentQueryKey,
    customerDashboardJobsQueryKey,
    operationalIdFingerprint,
    customerDashboardServicePlansQueryKey,
    customerDashboardSitesQueryKey,
} from '../shared/data/operationalCollectionKeys'
import { fetchCustomerSites } from '../jobs/services/sitesApi'
import { fetchEquipmentForSites } from '../jobs/services/equipmentApi'
import { fetchJobsForSites } from '../jobs/services/jobsApi'
import { fetchEquipmentServicePlansForEquipment } from '../equipment/servicePlans/servicePlanApi'
import type { Site } from '../jobs/types/site.types'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Job } from '../jobs/types/job.types'
import type { EquipmentServicePlan } from '../equipment/servicePlans/equipmentServicePlan.types'

const EMPTY_SITES: Site[] = []
const EMPTY_EQUIPMENT: Equipment[] = []
const EMPTY_JOBS: Job[] = []
const EMPTY_SERVICE_PLANS: EquipmentServicePlan[] = []

export function useCustomerDashboardData(customerId: string) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const persistedCustomerId = customerId.startsWith('prototype-customer-') ? '' : customerId
    const enabled = Boolean(account && persistedCustomerId)
    const getToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )
    const sitesKey = useMemo(
        () => customerDashboardSitesQueryKey(persistedCustomerId || 'none'),
        [persistedCustomerId],
    )

    const sitesQuery = useOperationalQuery<Site[]>({
        key: sitesKey,
        enabled,
        staleTimeMs: 30_000,
        cacheTimeMs: 2 * 60_000,
        queryFn: async ({ signal }) => fetchCustomerSites(await getToken(), persistedCustomerId, signal),
    })
    const sites = sitesQuery.data ?? EMPTY_SITES
    const siteIds = useMemo(() => sites.map((site) => site.gr_siteid), [sites])
    const siteFingerprint = useMemo(() => operationalIdFingerprint(siteIds), [siteIds])
    const equipmentKey = useMemo(
        () => customerDashboardEquipmentQueryKey(persistedCustomerId || 'none', siteFingerprint),
        [persistedCustomerId, siteFingerprint],
    )
    const jobsKey = useMemo(
        () => customerDashboardJobsQueryKey(persistedCustomerId || 'none', siteFingerprint),
        [persistedCustomerId, siteFingerprint],
    )
    const childQueriesEnabled = enabled && sitesQuery.status !== 'initial' && sitesQuery.status !== 'loading'

    const equipmentQuery = useOperationalQuery<Equipment[]>({
        key: equipmentKey,
        enabled: childQueriesEnabled,
        staleTimeMs: 30_000,
        cacheTimeMs: 2 * 60_000,
        queryFn: async ({ signal }) => fetchEquipmentForSites(await getToken(), siteIds, signal),
    })
    const jobsQuery = useOperationalQuery<Job[]>({
        key: jobsKey,
        enabled: childQueriesEnabled,
        staleTimeMs: 20_000,
        cacheTimeMs: 2 * 60_000,
        queryFn: async ({ signal }) => fetchJobsForSites(await getToken(), siteIds, signal),
    })
    const equipment = equipmentQuery.data ?? EMPTY_EQUIPMENT
    const equipmentIds = useMemo(() => equipment.map((item) => item.gr_equipmentid), [equipment])
    const equipmentFingerprint = useMemo(() => operationalIdFingerprint(equipmentIds), [equipmentIds])
    const servicePlansKey = useMemo(
        () => customerDashboardServicePlansQueryKey(persistedCustomerId || 'none', equipmentFingerprint),
        [equipmentFingerprint, persistedCustomerId],
    )
    const plansEnabled = childQueriesEnabled
        && equipmentQuery.status !== 'initial'
        && equipmentQuery.status !== 'loading'
    const servicePlansQuery = useOperationalQuery<EquipmentServicePlan[]>({
        key: servicePlansKey,
        enabled: plansEnabled,
        staleTimeMs: 30_000,
        cacheTimeMs: 2 * 60_000,
        queryFn: async ({ signal }) => fetchEquipmentServicePlansForEquipment(await getToken(), equipmentIds, signal),
    })

    const refetch = useCallback(async () => {
        if (!enabled) return
        await sitesQuery.refetch()
        await Promise.all([equipmentQuery.refetch(), jobsQuery.refetch()])
        await servicePlansQuery.refetch()
    }, [enabled, equipmentQuery, jobsQuery, servicePlansQuery, sitesQuery])

    const statuses = [sitesQuery.status, equipmentQuery.status, jobsQuery.status, servicePlansQuery.status]
    const isLoading = enabled && statuses.some((status) => status === 'initial' || status === 'loading')
    const error = sitesQuery.error ?? equipmentQuery.error ?? jobsQuery.error ?? servicePlansQuery.error

    return {
        sites,
        equipment,
        jobs: jobsQuery.data ?? EMPTY_JOBS,
        servicePlans: servicePlansQuery.data ?? EMPTY_SERVICE_PLANS,
        isLoading,
        error: error?.message ?? '',
        refetch,
    }
}
