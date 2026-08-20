import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { createCustomer as createCustomerApi, fetchCustomers, searchCustomers } from '../../jobs/services/customersApi'
import { updateEquipmentSite } from '../../jobs/services/equipmentApi'
import { createSite as createSiteApi, fetchCustomerSites, fetchSites, updateSite as updateSiteApi } from '../../jobs/services/sitesApi'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Site, SiteInductionDocument, SiteUpdateInput } from '../../jobs/types/site.types'
import {
    deleteSiteInductionDocument as deleteSiteInductionDocumentApi,
    downloadSiteInductionDocument as downloadSiteInductionDocumentApi,
    fetchSiteInductionDocuments as fetchSiteInductionDocumentsApi,
    uploadSiteInductionDocuments as uploadSiteInductionDocumentsApi,
} from '../../jobs/services/siteInductionDocumentsApi'
import {
    applyEquipmentUpdate,
    createEquipment as createEquipmentApi,
    deleteEquipment as deleteEquipmentApi,
    fetchEquipment,
    updateEquipmentMaintenanceProfile,
    updateEquipment as updateEquipmentApi,
} from '../services/equipmentManagerApi'
import { normalizeEquipmentInput, type EquipmentUpdateInput } from '../types/equipmentManager.types'
import {
    fetchEquipmentServicePlans,
    fetchEquipmentServicePlansForEquipment,
    syncEquipmentServiceProgramme,
    saveEquipmentMaintenanceHistory as saveEquipmentMaintenanceHistoryApi,
    type MaintenanceHistoryInput,
} from '../servicePlans/servicePlanApi'
import type { EquipmentServicePlan } from '../servicePlans/equipmentServicePlan.types'
import type { MaintenanceProfile } from '../servicePlans/maintenanceConfiguration'
import { updateEquipmentCurrentHourMeter } from '../servicePlans/servicePlanApi'
import type { SignedInUserInfo } from '../../../auth/signedInUser'
import {
    canUseEquipmentCsvTools,
    equipmentInputFromCsvPatch,
    type EquipmentCsvReviewRow,
} from '../utils/equipmentCsv'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { subscribeToEquipmentChanges } from '../services/equipmentRealtime'
import { useOperationalQueryState } from '../../shared/data/useOperationalQueryState'
import { EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY } from '../../shared/data/operationalCollectionKeys'
import { useOperationalDataClient } from '../../shared/data/OperationalDataClientContext'
import { subscribeToOperationalRealtimeRecovery } from '../../shared/realtime/operationalRealtimeEvents'
import { useOperationalRealtimeStatus } from '../../shared/realtime/OperationalRealtimeStatusContext'

const EMPTY_EQUIPMENT: Equipment[] = []

type UseEquipmentManagerOptions = Readonly<{
    loadGlobalOperationalData?: boolean
    loadGlobalRelationships?: boolean
    loadGlobalServicePlans?: boolean
    scopedData?: Readonly<{
        equipment: Equipment[]
        sites: Site[]
        servicePlans: EquipmentServicePlan[]
    }>
    onScopedDataChanged?: () => void | Promise<void>
}>

export function useEquipmentManager(options: UseEquipmentManagerOptions = {}) {
    const loadGlobalOperationalData = options.loadGlobalOperationalData !== false
    const loadGlobalRelationships = options.loadGlobalRelationships !== false
    const loadGlobalServicePlans = options.loadGlobalServicePlans !== false
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const operationalDataClient = useOperationalDataClient()
    const {
        data: sharedEquipment,
        hasData: hasSharedEquipment,
        setData: setSharedEquipment,
    } = useOperationalQueryState<Equipment[]>(EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY, EMPTY_EQUIPMENT)
    const [scopedEquipment, setScopedEquipment] = useState<Equipment[]>(options.scopedData?.equipment ?? [])
    const equipment = loadGlobalOperationalData ? sharedEquipment : options.scopedData?.equipment ?? scopedEquipment
    const setEquipment = useCallback((updater: Equipment[] | ((current: Equipment[]) => Equipment[])) => {
        if (loadGlobalOperationalData) setSharedEquipment(updater)
        else setScopedEquipment(updater)
    }, [loadGlobalOperationalData, setSharedEquipment])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [storedSites, setSites] = useState<Site[]>(options.scopedData?.sites ?? [])
    const [storedServicePlans, setServicePlans] = useState<EquipmentServicePlan[]>(options.scopedData?.servicePlans ?? [])
    const sites = loadGlobalOperationalData ? storedSites : options.scopedData?.sites ?? storedSites
    const servicePlans = loadGlobalOperationalData ? storedServicePlans : options.scopedData?.servicePlans ?? storedServicePlans
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [equipmentCacheStatus, setEquipmentCacheStatus] = useState<{
        source: 'device' | 'network'
        savedAt: number
        refreshing: boolean
    } | null>(null)
    const equipmentRealtimeStatus = useOperationalRealtimeStatus()
    const hasSharedEquipmentRef = useRef(hasSharedEquipment)
    const onScopedDataChangedRef = useRef(options.onScopedDataChanged)

    useEffect(() => {
        onScopedDataChangedRef.current = options.onScopedDataChanged
    }, [options.onScopedDataChanged])

    useEffect(() => {
        hasSharedEquipmentRef.current = hasSharedEquipment
    }, [hasSharedEquipment])

    const getToken = useCallback(async () => {
        return acquireDataverseAccessToken(instance, account)
    }, [account, instance])

    const loadEquipmentServicePlans = useCallback(async (equipmentId: string, signal?: AbortSignal) => {
        const token = await getToken()
        return fetchEquipmentServicePlansForEquipment(token, [equipmentId], signal)
    }, [getToken])

    const loadEquipmentServicePlansForIds = useCallback(async (equipmentIds: readonly string[], signal?: AbortSignal) => {
        const token = await getToken()
        return fetchEquipmentServicePlansForEquipment(token, equipmentIds, signal)
    }, [getToken])

    const searchEquipmentCustomers = useCallback(async (query: string, signal?: AbortSignal) => {
        return searchCustomers(await getToken(), query, signal)
    }, [getToken])

    const loadEquipmentCustomerSites = useCallback(async (customerId: string, signal?: AbortSignal) => {
        return fetchCustomerSites(await getToken(), customerId, signal)
    }, [getToken])

    const load = useCallback(async () => {
        if (!account) return
        setIsLoading(!hasSharedEquipmentRef.current)
        setLoadError('')
        try {
            if (!loadGlobalOperationalData) {
                const token = await getToken()
                setCustomers(await fetchCustomers(token))
                await onScopedDataChangedRef.current?.()
                return
            }
            const [nextEquipment, nextCustomers, nextSites, nextServicePlans] = await Promise.all([
                operationalDataClient.fetchQuery(
                    EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY,
                    async () => fetchEquipment(await getToken(), { forceRefresh: true }),
                    { forceRefresh: true, staleTimeMs: 30_000, cacheTimeMs: 5 * 60_000 },
                ),
                loadGlobalRelationships ? getToken().then(fetchCustomers) : Promise.resolve([]),
                loadGlobalRelationships ? getToken().then(fetchSites) : Promise.resolve([]),
                loadGlobalServicePlans ? getToken().then(fetchEquipmentServicePlans) : Promise.resolve([]),
            ])
            void nextEquipment
            setEquipmentCacheStatus({ source: 'network', savedAt: Date.now(), refreshing: false })
            setCustomers(nextCustomers)
            setSites(nextSites)
            setServicePlans(nextServicePlans)
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Equipment data could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [account, getToken, loadGlobalOperationalData, loadGlobalRelationships, loadGlobalServicePlans, operationalDataClient])

    useEffect(() => {
        let cancelled = false
        let deviceSnapshotRestored = false
        if (!account) return
        const loadInitialData = async () => {
            setIsLoading(!hasSharedEquipmentRef.current)
            setLoadError('')
            try {
                if (!loadGlobalOperationalData) {
                    const token = await getToken()
                    const nextCustomers = await fetchCustomers(token)
                    if (!cancelled) setCustomers(nextCustomers)
                    return
                }
                const [nextEquipment, nextCustomers, nextSites, nextServicePlans] = await Promise.all([
                    operationalDataClient.fetchQuery(
                        EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY,
                        async () => fetchEquipment(await getToken(), {
                            useDeviceCache: true,
                            onDeviceSnapshot: (_rows, savedAt) => {
                                deviceSnapshotRestored = true
                                if (!cancelled) {
                                    setIsLoading(false)
                                    setEquipmentCacheStatus({ source: 'device', savedAt, refreshing: true })
                                }
                            },
                            onBackgroundRefresh: (rows, refreshedAt) => {
                                if (!cancelled) {
                                    setEquipment(rows)
                                    setEquipmentCacheStatus({ source: 'network', savedAt: refreshedAt, refreshing: false })
                                }
                            },
                            onBackgroundRefreshError: () => {
                                if (!cancelled) setEquipmentCacheStatus((current) => current ? { ...current, refreshing: false } : current)
                            },
                        }),
                        { staleTimeMs: 30_000, cacheTimeMs: 5 * 60_000 },
                    ),
                    loadGlobalRelationships ? getToken().then(fetchCustomers) : Promise.resolve([]),
                    loadGlobalRelationships ? getToken().then(fetchSites) : Promise.resolve([]),
                    loadGlobalServicePlans ? getToken().then(fetchEquipmentServicePlans) : Promise.resolve([]),
                ])
                if (!cancelled) {
                    void nextEquipment
                    setCustomers(nextCustomers)
                    setSites(nextSites)
                    setServicePlans(nextServicePlans)
                }
            } catch (error) {
                if (!cancelled && !deviceSnapshotRestored) {
                    setLoadError(error instanceof Error ? error.message : 'Equipment data could not be loaded.')
                } else if (!cancelled) {
                    setEquipmentCacheStatus((current) => current ? { ...current, refreshing: false } : current)
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        void loadInitialData()
        return () => { cancelled = true }
    }, [account, getToken, loadGlobalOperationalData, loadGlobalRelationships, loadGlobalServicePlans, operationalDataClient, setEquipment])

    useEffect(() => {
        if (!account || !loadGlobalOperationalData) return

        let cancelled = false
        let refreshTimer: number | undefined
        const refreshEquipment = () => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(async () => {
                if (cancelled) return
                setEquipmentCacheStatus((current) => current ? { ...current, refreshing: true } : current)
                try {
                    await operationalDataClient.fetchQuery(
                        EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY,
                        async () => fetchEquipment(await getToken(), { forceRefresh: true }),
                        { forceRefresh: true, staleTimeMs: 30_000, cacheTimeMs: 5 * 60_000 },
                    )
                    if (!cancelled) {
                        setEquipmentCacheStatus({ source: 'network', savedAt: Date.now(), refreshing: false })
                    }
                } catch {
                    if (!cancelled) setEquipmentCacheStatus((current) => current ? { ...current, refreshing: false } : current)
                }
            }, 2_000)
        }
        const unsubscribeChanges = subscribeToEquipmentChanges(refreshEquipment)
        const unsubscribeRecovery = subscribeToOperationalRealtimeRecovery(refreshEquipment)

        return () => {
            cancelled = true
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            unsubscribeChanges()
            unsubscribeRecovery()
        }
    }, [account, getToken, loadGlobalOperationalData, operationalDataClient])

    const updateEquipment = async (record: Equipment, input: EquipmentUpdateInput, resolvedSite?: Site) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await updateEquipmentApi(token, record.gr_equipmentid, input)
            const selectedSite = resolvedSite ?? sites.find((site) => site.gr_siteid === input.siteId)
            const updated = applyEquipmentUpdate(record, input, selectedSite)
            const recordPlans = await fetchEquipmentServicePlansForEquipment(token, [record.gr_equipmentid])
            const syncedPlans = await syncEquipmentServiceProgramme(token, updated, recordPlans)
            setServicePlans((current) => [...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()), ...syncedPlans])
            setEquipment((current) => current.map((item) =>
                item.gr_equipmentid === updated.gr_equipmentid ? updated : item,
            ))
            return updated
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Equipment could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const createEquipment = async (input: EquipmentUpdateInput, resolvedSite?: Site) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            const normalized = normalizeEquipmentInput(input)
            const createdResponse = await createEquipmentApi(token, normalized)
            const selectedSite = resolvedSite ?? sites.find((site) => site.gr_siteid === normalized.siteId)
            const created: Equipment = {
                ...createdResponse,
                gr_fleet: normalized.fleet || null,
                gr_alternatefleetnumbers: normalized.alternateFleetNumbers || null,
                gr_make: normalized.make || null,
                gr_model: normalized.model || null,
                gr_serial: normalized.serial || null,
                gr_registrationnumber: normalized.registrationNumber || null,
                gr_wofrequired: normalized.wofRequired,
                gr_currentwofexpiry: normalized.currentWofExpiry || null,
                gr_regoexpiry: normalized.regoExpiry || null,
                gr_Site: selectedSite,
            }
            setEquipment((current) => current.some((item) => item.gr_equipmentid === created.gr_equipmentid)
                ? current.map((item) => item.gr_equipmentid === created.gr_equipmentid ? created : item)
                : [...current, created])
            return created
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Equipment could not be created.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const createCustomer = async (input: { name: string }) => {
        const token = await getToken()
        const customerId = await createCustomerApi(token, { name: input.name.trim() })
        const created: Customer = { gr_customerid: customerId, gr_name: input.name.trim() }
        setCustomers((current) => [...current, created].sort((a, b) => a.gr_name.localeCompare(b.gr_name)))
        return created
    }

    const createSite = async (
        input: { customerId: string; name: string; address?: string },
        customerOverride?: Customer,
    ) => {
        const token = await getToken()
        const siteId = await createSiteApi(token, {
            customerId: input.customerId,
            name: input.name.trim(),
            address: input.address?.trim() || undefined,
        })
        const customer = customers.find((item) => item.gr_customerid === input.customerId)
        const created: Site = {
            gr_siteid: siteId,
            gr_name: input.name.trim(),
            gr_address: input.address?.trim() || '',
            gr_inductionrequired: null,
            gr_inductionrequirements: null,
            gr_Customer: customer ?? customerOverride,
        }
        setSites((current) => [...current, created])
        return created
    }

    const updateSites = async (updates: Array<{ siteId: string; input: SiteUpdateInput }>) => {
        if (updates.length === 0) return
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await Promise.all(updates.map(({ siteId, input }) => updateSiteApi(token, siteId, input)))
            const updatesById = new Map(updates.map(({ siteId, input }) => [siteId, input]))
            setSites((current) => current.map((site) => {
                const input = updatesById.get(site.gr_siteid)
                return input
                    ? {
                        ...site,
                        gr_name: input.name.trim(),
                        gr_address: input.address.trim(),
                        ...(input.defaultMaintenanceProfile !== undefined
                            ? { gr_defaultmaintenanceprofile: input.defaultMaintenanceProfile }
                            : {}),
                        ...(input.inductionRequired !== undefined
                            ? { gr_inductionrequired: input.inductionRequired }
                            : {}),
                        ...(input.inductionRequirements !== undefined
                            ? { gr_inductionrequirements: input.inductionRequirements }
                            : {}),
                    }
                    : site
            }))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Site changes could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const transferEquipment = async (equipmentIds: string[], destinationSiteId: string, adoptDestinationProfile = false) => {
        const uniqueIds = [...new Set(equipmentIds)].filter((equipmentId) =>
            equipment.some((item) => item.gr_equipmentid === equipmentId && item.gr_Site?.gr_siteid !== destinationSiteId),
        )
        if (uniqueIds.length === 0) return { succeeded: [] as string[], failures: [] as Array<{ equipmentId: string; message: string }> }

        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            const authoritativeSites = await fetchSites(token)
            const destination = authoritativeSites.find((site) => site.gr_siteid === destinationSiteId)
            if (!destination) throw new Error('The destination Site no longer exists. Refresh the dashboard and try again.')
            const settled = await Promise.allSettled(uniqueIds.map(async (equipmentId) => {
                await updateEquipmentSite(
                    token,
                    equipmentId,
                    destinationSiteId,
                    adoptDestinationProfile ? destination.gr_defaultmaintenanceprofile : undefined,
                )
                return equipmentId
            }))
            const succeeded: string[] = []
            const failures: Array<{ equipmentId: string; message: string }> = []
            settled.forEach((result, index) => {
                const equipmentId = uniqueIds[index]
                if (result.status === 'fulfilled') succeeded.push(equipmentId)
                else failures.push({
                    equipmentId,
                    message: result.reason instanceof Error ? result.reason.message : 'Dataverse did not accept the Site update.',
                })
            })
            if (succeeded.length > 0) {
                const succeededIds = new Set(succeeded)
                setEquipment((current) => current.map((item) =>
                    succeededIds.has(item.gr_equipmentid) ? {
                        ...item,
                        gr_Site: destination,
                        ...(adoptDestinationProfile && destination.gr_defaultmaintenanceprofile != null
                            ? { gr_maintenanceprofile: destination.gr_defaultmaintenanceprofile }
                            : {}),
                    } : item,
                ))
            }
            return { succeeded, failures }
        } finally {
            setIsSaving(false)
        }
    }

    const updateSiteMaintenanceSettings = async (
        site: Site,
        defaultMaintenanceProfile: MaintenanceProfile,
        equipmentIds: string[],
    ) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await updateSiteApi(token, site.gr_siteid, {
                name: site.gr_name,
                address: site.gr_address,
                defaultMaintenanceProfile,
            })
            await Promise.all(equipmentIds.map((equipmentId) =>
                updateEquipmentMaintenanceProfile(token, equipmentId, defaultMaintenanceProfile),
            ))
            setSites((current) => current.map((item) =>
                item.gr_siteid === site.gr_siteid
                    ? { ...item, gr_defaultmaintenanceprofile: defaultMaintenanceProfile }
                    : item,
            ))
            if (equipmentIds.length) {
                const selected = new Set(equipmentIds)
                setEquipment((current) => current.map((item) =>
                    selected.has(item.gr_equipmentid)
                        ? { ...item, gr_maintenanceprofile: defaultMaintenanceProfile }
                        : item,
                ))
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Site maintenance settings could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const loadSiteInductionDocuments = useCallback(async (site: Site): Promise<SiteInductionDocument[]> => {
        const token = await getToken()
        return fetchSiteInductionDocumentsApi(token, site.gr_siteid)
    }, [getToken])

    const uploadSiteInductionDocuments = useCallback(async (site: Site, files: File[]) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            return await uploadSiteInductionDocumentsApi(token, site.gr_siteid, files)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Site documents could not be uploaded.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [getToken])

    const deleteSiteInductionDocument = useCallback(async (site: Site, documentId: string) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await deleteSiteInductionDocumentApi(token, documentId)
            return loadSiteInductionDocuments(site)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Site documents could not be deleted.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [getToken, loadSiteInductionDocuments])

    const downloadSiteInductionDocument = useCallback(async (documentId: string) => {
        const token = await getToken()
        return downloadSiteInductionDocumentApi(token, documentId)
    }, [getToken])

    const deleteEquipment = async (equipmentId: string) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await deleteEquipmentApi(token, equipmentId)
            setEquipment((current) => current.filter((item) => item.gr_equipmentid !== equipmentId))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Equipment could not be deleted.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const saveEquipmentMaintenanceHistory = async (
        record: Equipment,
        existingPlans: EquipmentServicePlan[],
        input: MaintenanceHistoryInput,
    ) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            const updatedPlans = await saveEquipmentMaintenanceHistoryApi(token, record.gr_equipmentid, record, existingPlans, input)
            setEquipment((current) => current.map((item) =>
                item.gr_equipmentid === record.gr_equipmentid
                    ? {
                        ...item,
                        gr_currenthourmeter: input.currentHourMeter,
                        gr_currenthourmeterrecordeddate: input.readingRecordedDate,
                    }
                    : item,
            ))
            setServicePlans((current) => {
                const updatedTypes = new Set(updatedPlans.map((plan) => plan.gr_servicetype))
                const retained = current.filter((plan) =>
                    plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()
                    || !updatedTypes.has(plan.gr_servicetype)
                )
                return [...retained, ...updatedPlans]
            })
            return {
                equipment: {
                    ...record,
                    gr_currenthourmeter: input.currentHourMeter,
                    gr_currenthourmeterrecordeddate: input.readingRecordedDate,
                },
                servicePlans: updatedPlans,
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Maintenance history could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    const applyEquipmentCsvUpdates = async (user: SignedInUserInfo | null, reviewRows: EquipmentCsvReviewRow[]) => {
        if (!canUseEquipmentCsvTools(user)) throw new Error('You are not authorised to import Equipment data.')
        const rows = reviewRows.filter((row) => row.status === 'changed' && row.equipment)
        const succeeded: string[] = []
        const failures: Array<{ equipmentId: string; message: string }> = []
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            for (const row of rows) {
                if (!canUseEquipmentCsvTools(user)) throw new Error('You are not authorised to import Equipment data.')
                const record = row.equipment!
                try {
                    const input = equipmentInputFromCsvPatch(record, row.patch)
                    await updateEquipmentApi(token, record.gr_equipmentid, input)
                    const selectedSite = sites.find((site) => site.gr_siteid === input.siteId)
                    const updated = applyEquipmentUpdate(record, input, selectedSite)
                    const recordPlans = servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === record.gr_equipmentid.toLowerCase())
                    const syncedPlans = await syncEquipmentServiceProgramme(token, updated, recordPlans)
                    if (row.patch.currentHourMeter !== undefined || row.patch.readingRecordedDate !== undefined) {
                        await updateEquipmentCurrentHourMeter(
                            token,
                            record.gr_equipmentid,
                            row.patch.currentHourMeter ?? record.gr_currenthourmeter ?? 0,
                            row.patch.readingRecordedDate ?? record.gr_currenthourmeterrecordeddate!,
                        )
                    }
                    setServicePlans((current) => [
                        ...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()),
                        ...syncedPlans,
                    ])
                    succeeded.push(record.gr_equipmentid)
                } catch (error) {
                    failures.push({
                        equipmentId: record.gr_equipmentid,
                        message: error instanceof Error ? error.message : 'Dataverse rejected the Equipment update.',
                    })
                }
            }
            if (succeeded.length) await load()
            return { succeeded, failures }
        } finally {
            setIsSaving(false)
        }
    }

    const loadEquipmentCsvReferenceData = useCallback(async () => {
        const token = await getToken()
        const [nextSites, nextServicePlans] = await Promise.all([
            fetchSites(token),
            fetchEquipmentServicePlans(token),
        ])
        setSites(nextSites)
        setServicePlans(nextServicePlans)
        return { sites: nextSites, servicePlans: nextServicePlans }
    }, [getToken])

    return {
        equipment, customers, sites, servicePlans, equipmentCacheStatus, equipmentRealtimeStatus, isLoading, isSaving, loadError, saveError,
        reload: load,
        clearSaveError: () => setSaveError(''),
        createCustomer,
        createSite,
        updateSites,
        updateSiteMaintenanceSettings,
        transferEquipment,
        loadSiteInductionDocuments,
        uploadSiteInductionDocuments,
        deleteSiteInductionDocument,
        downloadSiteInductionDocument,
        createEquipment,
        updateEquipment,
        loadEquipmentServicePlans,
        loadEquipmentServicePlansForIds,
        searchEquipmentCustomers,
        loadEquipmentCustomerSites,
        loadEquipmentCsvReferenceData,
        saveEquipmentMaintenanceHistory,
        applyEquipmentCsvUpdates,
        deleteEquipment,
    }
}
