import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import type { Job } from '../../jobs/types/job.types'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import type { TechnicianQualificationInput } from '../../wof/types/wof.types'
import {
    createTechnicianQualification as createQualificationApi,
    deactivateTechnicianQualification as deactivateQualificationApi,
    fetchAllTechnicianQualifications,
    fetchQualificationTypes,
    updateTechnicianQualification as updateQualificationApi,
} from '../../wof/services/qualificationApi'
import { useOperationalDataClient } from '../../shared/data/OperationalDataClientContext'
import { useOperationalQuery } from '../../shared/data/useOperationalQuery'
import {
    focusedStaffJobsQueryKey,
    STAFF_DIRECTORY_QUERY_KEY,
    STAFF_OPEN_ALLOCATIONS_QUERY_KEY,
    STAFF_QUALIFICATIONS_QUERY_KEY,
    STAFF_QUALIFICATION_TYPES_QUERY_KEY,
} from '../../shared/data/operationalCollectionKeys'
import {
    createMechanic as createMechanicApi,
    fetchMechanics as fetchMechanicsApi,
    setMechanicActive as setMechanicActiveApi,
    updateMechanic as updateMechanicApi,
    type MechanicInput,
} from '../services/mechanicsApi'
import { subscribeToStaffChanges } from '../services/staffRealtime'
import { fetchStaffJobs, fetchStaffOpenJobCounts, type StaffJobView } from '../services/staffWorkloadApi'

const QUERY_STALE_TIME_MS = 20_000
const QUERY_CACHE_TIME_MS = 5 * 60_000
const DISABLED_STAFF_JOBS_QUERY_KEY = ['staff', 'disabled', 'jobs-v1'] as const
const EMPTY_JOBS: Job[] = []

function initialLoad(status: string, hasData: boolean) {
    return !hasData && (status === 'initial' || status === 'loading')
}

function sortMechanics(rows: Mechanic[]) {
    return [...rows].sort((left, right) => left.gr_name.localeCompare(right.gr_name))
}

export function useMechanics({ loadQualificationTypes = false }: { loadQualificationTypes?: boolean } = {}) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const client = useOperationalDataClient()
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const getToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )

    const directoryQuery = useOperationalQuery<Mechanic[]>({
        key: STAFF_DIRECTORY_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchMechanicsApi(await getToken(), signal),
    })
    const allocationQuery = useOperationalQuery<Record<string, number>>({
        key: STAFF_OPEN_ALLOCATIONS_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchStaffOpenJobCounts(await getToken(), signal),
    })
    const qualificationsQuery = useOperationalQuery<Awaited<ReturnType<typeof fetchAllTechnicianQualifications>>>({
        key: STAFF_QUALIFICATIONS_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchAllTechnicianQualifications(await getToken(), signal),
    })
    const qualificationTypesQuery = useOperationalQuery<Awaited<ReturnType<typeof fetchQualificationTypes>>>({
        key: STAFF_QUALIFICATION_TYPES_QUERY_KEY,
        enabled: Boolean(account) && loadQualificationTypes,
        staleTimeMs: 5 * 60_000,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchQualificationTypes(await getToken(), signal),
    })

    const refetchDirectory = directoryQuery.refetch
    useEffect(() => {
        if (!account) return
        let refreshTimer: number | undefined
        const unsubscribe = subscribeToStaffChanges(() => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(() => {
                void refetchDirectory().catch(() => undefined)
            }, 750)
        })
        return () => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            unsubscribe()
        }
    }, [account, refetchDirectory])

    const mutate = async <T,>(action: (token: string) => Promise<T>, onSuccess: (result: T) => void) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const result = await action(await getToken())
            onSuccess(result)
            return result
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The staff member could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const invalidateQualifications = () => client.invalidate((key) => key[0] === 'staff' && key[1] === 'qualifications-v1')
    const mechanics = directoryQuery.data ?? []
    const qualifications = qualificationsQuery.data ?? []
    const qualificationTypes = qualificationTypesQuery.data ?? []
    const hasDirectory = directoryQuery.data !== undefined
    const hasAllocations = allocationQuery.data !== undefined
    const hasQualifications = qualificationsQuery.data !== undefined
    const hasQualificationTypes = qualificationTypesQuery.data !== undefined

    return {
        mechanics,
        openJobCounts: allocationQuery.data ?? {},
        qualifications,
        qualificationTypes,
        isLoading: initialLoad(directoryQuery.status, hasDirectory),
        allocationCountsLoading: initialLoad(allocationQuery.status, hasAllocations),
        qualificationsLoading: initialLoad(qualificationsQuery.status, hasQualifications),
        qualificationTypesLoading: loadQualificationTypes && initialLoad(qualificationTypesQuery.status, hasQualificationTypes),
        isSaving,
        loadError: !hasDirectory ? directoryQuery.error?.message ?? '' : '',
        allocationCountsError: allocationQuery.error?.message ?? '',
        qualificationsError: qualificationsQuery.error?.message ?? '',
        qualificationTypesError: qualificationTypesQuery.error?.message ?? '',
        saveError,
        reload: directoryQuery.refetch,
        retryQualifications: qualificationsQuery.refetch,
        retryQualificationTypes: qualificationTypesQuery.refetch,
        clearSaveError: () => setSaveError(''),
        createMechanic: (input: MechanicInput) => mutate(
            (token) => createMechanicApi(token, input),
            (created) => client.updateQueryData<Mechanic[]>(
                STAFF_DIRECTORY_QUERY_KEY,
                (current) => sortMechanics([created, ...(current ?? []).filter((row) => row.gr_mechanicid !== created.gr_mechanicid)]),
                { staleTimeMs: QUERY_STALE_TIME_MS, cacheTimeMs: QUERY_CACHE_TIME_MS },
            ),
        ),
        updateMechanic: (mechanicId: string, input: MechanicInput) => mutate(
            (token) => updateMechanicApi(token, mechanicId, input),
            () => client.updateQueryData<Mechanic[]>(
                STAFF_DIRECTORY_QUERY_KEY,
                (current) => sortMechanics((current ?? []).map((row) => row.gr_mechanicid === mechanicId ? {
                    ...row,
                    gr_name: input.name.trim(),
                    gr_phone: input.phone.trim(),
                    gr_email: input.email.trim(),
                    gr_camnumber: input.camNumber.trim() || null,
                    gr_rego: input.rego.trim().replace(/\s+/g, ' ') || null,
                    gr_region: input.region.trim() || null,
                    gr_department: input.department,
                    gr_jobassignmentenabled: input.jobAssignmentEnabled,
                    gr_customeremailccenabled: input.customerEmailCcEnabled,
                } : row)),
                { staleTimeMs: QUERY_STALE_TIME_MS, cacheTimeMs: QUERY_CACHE_TIME_MS },
            ),
        ),
        setMechanicActive: (mechanicId: string, active: boolean) => mutate(
            (token) => setMechanicActiveApi(token, mechanicId, active),
            () => client.updateQueryData<Mechanic[]>(
                STAFF_DIRECTORY_QUERY_KEY,
                (current) => (current ?? []).map((row) => row.gr_mechanicid === mechanicId ? { ...row, statecode: active ? 0 : 1 } : row),
                { staleTimeMs: QUERY_STALE_TIME_MS, cacheTimeMs: QUERY_CACHE_TIME_MS },
            ),
        ),
        createQualification: (input: TechnicianQualificationInput) => mutate(
            (token) => createQualificationApi(token, input, qualifications, qualificationTypes),
            invalidateQualifications,
        ),
        updateQualification: (id: string, input: TechnicianQualificationInput) => mutate(
            (token) => updateQualificationApi(token, id, input, qualifications, qualificationTypes),
            invalidateQualifications,
        ),
        deactivateQualification: (id: string) => mutate(
            (token) => deactivateQualificationApi(token, id),
            invalidateQualifications,
        ),
    }
}

export function useStaffJobs(mechanicId: string | undefined, view: StaffJobView) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const normalizedMechanicId = mechanicId?.trim().toLowerCase() ?? ''
    const key = useMemo(
        () => normalizedMechanicId ? focusedStaffJobsQueryKey(normalizedMechanicId, view) : DISABLED_STAFF_JOBS_QUERY_KEY,
        [normalizedMechanicId, view],
    )
    const getToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )
    const query = useOperationalQuery<Job[]>({
        key,
        enabled: Boolean(account) && Boolean(normalizedMechanicId),
        staleTimeMs: QUERY_STALE_TIME_MS,
        cacheTimeMs: QUERY_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchStaffJobs(await getToken(), normalizedMechanicId, view, signal),
    })
    const hasData = query.data !== undefined
    return {
        jobs: query.data ?? EMPTY_JOBS,
        isLoading: Boolean(normalizedMechanicId) && initialLoad(query.status, hasData),
        loadError: !hasData ? query.error?.message ?? '' : '',
        refreshError: hasData ? query.error?.message ?? '' : '',
        refetch: query.refetch,
    }
}
