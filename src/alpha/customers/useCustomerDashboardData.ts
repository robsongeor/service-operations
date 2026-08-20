import { useCallback, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useOperationalQuery } from '../shared/data/useOperationalQuery'
import {
    customerDashboardEquipmentQueryKey,
    customerDashboardJobsQueryKey,
    customerDashboardOfficeUpdatesQueryKey,
    customerDashboardScheduleOptionsQueryKey,
    operationalIdFingerprint,
    customerDashboardServicePlansQueryKey,
    customerDashboardSitesQueryKey,
    customerDashboardQuotesQueryKey,
} from '../shared/data/operationalCollectionKeys'
import { fetchCustomerSites } from '../jobs/services/sitesApi'
import { fetchEquipmentForSites } from '../jobs/services/equipmentApi'
import { fetchJobsForSites } from '../jobs/services/jobsApi'
import { fetchJobScheduleOptionsForJobs } from '../jobs/services/jobScheduleApi'
import { fetchJobOfficeUpdatesForJobs } from '../jobs/services/jobOfficeUpdatesApi'
import { fetchEquipmentServicePlansForEquipment } from '../equipment/servicePlans/servicePlanApi'
import type { Site } from '../jobs/types/site.types'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Job } from '../jobs/types/job.types'
import type { EquipmentServicePlan } from '../equipment/servicePlans/equipmentServicePlan.types'
import { fetchQuotesForCustomer } from '../quotes/services/quotesApi'
import type { Quote } from '../quotes/types/quote.types'
import type { JobScheduleOption } from '../jobs/types/jobSchedule.types'
import type { JobOfficeUpdate } from '../jobs/types/officeAction.types'

const EMPTY_SITES: Site[] = []
const EMPTY_EQUIPMENT: Equipment[] = []
const EMPTY_JOBS: Job[] = []
const EMPTY_SERVICE_PLANS: EquipmentServicePlan[] = []
const EMPTY_QUOTES: Quote[] = []
const EMPTY_SCHEDULE_OPTIONS: JobScheduleOption[] = []
const EMPTY_OFFICE_UPDATES: JobOfficeUpdate[] = []

export function useCustomerDashboardData(customerId: string, loadQuotes = false) {
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
    const jobs = jobsQuery.data ?? EMPTY_JOBS
    const jobIds = useMemo(() => jobs.map((job) => job.gr_jobid), [jobs])
    const jobFingerprint = useMemo(() => operationalIdFingerprint(jobIds), [jobIds])
    const scheduleOptionsKey = useMemo(
        () => customerDashboardScheduleOptionsQueryKey(
            persistedCustomerId || 'none',
            jobFingerprint,
        ),
        [jobFingerprint, persistedCustomerId],
    )
    const officeUpdatesKey = useMemo(
        () => customerDashboardOfficeUpdatesQueryKey(
            persistedCustomerId || 'none',
            jobFingerprint,
        ),
        [jobFingerprint, persistedCustomerId],
    )
    const jobChildrenEnabled = childQueriesEnabled
        && jobsQuery.status !== 'initial'
        && jobsQuery.status !== 'loading'
    const scheduleOptionsQuery = useOperationalQuery<JobScheduleOption[]>({
        key: scheduleOptionsKey,
        enabled: jobChildrenEnabled,
        staleTimeMs: 20_000,
        cacheTimeMs: 2 * 60_000,
        queryFn: async ({ signal }) => fetchJobScheduleOptionsForJobs(await getToken(), jobIds, signal),
    })
    const officeUpdatesQuery = useOperationalQuery<JobOfficeUpdate[]>({
        key: officeUpdatesKey,
        enabled: jobChildrenEnabled,
        staleTimeMs: 20_000,
        cacheTimeMs: 2 * 60_000,
        queryFn: async ({ signal }) => fetchJobOfficeUpdatesForJobs(await getToken(), jobIds, signal),
    })
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
    const quotesKey = useMemo(
        () => customerDashboardQuotesQueryKey(persistedCustomerId || 'none'),
        [persistedCustomerId],
    )
    const quotesQuery = useOperationalQuery<Quote[]>({
        key: quotesKey,
        enabled: enabled && loadQuotes,
        staleTimeMs: 30_000,
        cacheTimeMs: 2 * 60_000,
        queryFn: async ({ signal }) => fetchQuotesForCustomer(await getToken(), persistedCustomerId, signal),
    })

    const refetch = useCallback(async () => {
        if (!enabled) return
        await sitesQuery.refetch()
        await Promise.all([equipmentQuery.refetch(), jobsQuery.refetch()])
        await Promise.all([
            servicePlansQuery.refetch(),
            scheduleOptionsQuery.refetch(),
            officeUpdatesQuery.refetch(),
        ])
        if (loadQuotes) await quotesQuery.refetch()
    }, [enabled, equipmentQuery, jobsQuery, loadQuotes, officeUpdatesQuery, quotesQuery, scheduleOptionsQuery, servicePlansQuery, sitesQuery])

    const statuses = [sitesQuery.status, equipmentQuery.status, jobsQuery.status, servicePlansQuery.status]
    const isLoading = enabled && statuses.some((status) => status === 'initial' || status === 'loading')
    const error = sitesQuery.error ?? equipmentQuery.error ?? jobsQuery.error ?? servicePlansQuery.error

    return {
        sites,
        equipment,
        jobs,
        scheduleOptions: scheduleOptionsQuery.data ?? EMPTY_SCHEDULE_OPTIONS,
        officeUpdates: officeUpdatesQuery.data ?? EMPTY_OFFICE_UPDATES,
        servicePlans: servicePlansQuery.data ?? EMPTY_SERVICE_PLANS,
        quotes: quotesQuery.data ?? EMPTY_QUOTES,
        quotesLoading: loadQuotes && (quotesQuery.status === 'initial' || quotesQuery.status === 'loading'),
        quotesError: quotesQuery.error?.message ?? '',
        isLoading,
        error: error?.message ?? '',
        refetch,
    }
}
