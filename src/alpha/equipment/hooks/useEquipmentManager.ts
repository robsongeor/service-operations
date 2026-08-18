import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { createCustomer as createCustomerApi, fetchCustomers } from '../../jobs/services/customersApi'
import { fetchEquipmentJobs } from '../../jobs/services/jobsApi'
import { updateEquipmentSite } from '../../jobs/services/equipmentApi'
import { createSite as createSiteApi, fetchSites, updateSite as updateSiteApi } from '../../jobs/services/sitesApi'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Job } from '../../jobs/types/job.types'
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
import { startEquipmentRealtime, type EquipmentRealtimeStatus } from '../services/equipmentRealtime'

export function useEquipmentManager() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [equipment, setEquipment] = useState<Equipment[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [jobs, setJobs] = useState<Job[]>([])
    const [isEquipmentJobsLoading, setIsEquipmentJobsLoading] = useState(false)
    const [equipmentJobsError, setEquipmentJobsError] = useState('')
    const equipmentJobsRequestRef = useRef(0)
    const [servicePlans, setServicePlans] = useState<EquipmentServicePlan[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [equipmentCacheStatus, setEquipmentCacheStatus] = useState<{
        source: 'device' | 'network'
        savedAt: number
        refreshing: boolean
    } | null>(null)
    const [equipmentRealtimeStatus, setEquipmentRealtimeStatus] = useState<EquipmentRealtimeStatus>('disabled')

    const getToken = useCallback(async () => {
        return acquireDataverseAccessToken(instance, account)
    }, [account, instance])

    const load = useCallback(async () => {
        if (!account) return
        setIsLoading(true)
        setLoadError('')
        try {
            const token = await getToken()
            const [nextEquipment, nextCustomers, nextSites, nextServicePlans] = await Promise.all([
                fetchEquipment(token, {
                    forceRefresh: true,
                    onBackgroundRefresh: (rows, refreshedAt) => {
                        setEquipment(rows)
                        setEquipmentCacheStatus({ source: 'network', savedAt: refreshedAt, refreshing: false })
                    },
                }),
                fetchCustomers(token),
                fetchSites(token),
                fetchEquipmentServicePlans(token),
            ])
            setEquipment(nextEquipment)
            setCustomers(nextCustomers)
            setSites(nextSites)
            setServicePlans(nextServicePlans)
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Equipment data could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [account, getToken])

    useEffect(() => {
        let cancelled = false
        let deviceSnapshotRestored = false
        if (!account) return
        const loadInitialData = async () => {
            setIsLoading(true)
            setLoadError('')
            try {
                const token = await getToken()
                const [nextEquipment, nextCustomers, nextSites, nextServicePlans] = await Promise.all([
                    fetchEquipment(token, {
                        useDeviceCache: true,
                        onDeviceSnapshot: (rows, savedAt) => {
                            deviceSnapshotRestored = true
                            if (!cancelled) {
                                setEquipment(rows)
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
                    }), fetchCustomers(token), fetchSites(token), fetchEquipmentServicePlans(token),
                ])
                if (!cancelled) {
                    setEquipment(nextEquipment)
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
    }, [account, getToken])

    useEffect(() => {
        const apiUrl = import.meta.env.VITE_EQUIPMENT_REALTIME_API_URL?.trim() ?? ''
        if (!account || !apiUrl) return

        let cancelled = false
        let refreshTimer: number | undefined
        const stop = startEquipmentRealtime({
            apiUrl,
            getAccessToken: getToken,
            onStatus: (status) => { if (!cancelled) setEquipmentRealtimeStatus(status) },
            onEvent: () => {
                if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
                refreshTimer = window.setTimeout(async () => {
                    if (cancelled) return
                    setEquipmentCacheStatus((current) => current ? { ...current, refreshing: true } : current)
                    try {
                        const rows = await fetchEquipment(await getToken(), { forceRefresh: true })
                        if (!cancelled) {
                            setEquipment(rows)
                            setEquipmentCacheStatus({ source: 'network', savedAt: Date.now(), refreshing: false })
                        }
                    } catch {
                        if (!cancelled) setEquipmentCacheStatus((current) => current ? { ...current, refreshing: false } : current)
                    }
                }, 2_000)
            },
        })

        return () => {
            cancelled = true
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            stop()
        }
    }, [account, getToken])

    const loadEquipmentJobs = useCallback(async (equipmentId: string) => {
        const requestId = equipmentJobsRequestRef.current + 1
        equipmentJobsRequestRef.current = requestId
        setJobs([])
        setEquipmentJobsError('')
        setIsEquipmentJobsLoading(true)
        try {
            const rows = await fetchEquipmentJobs(await getToken(), equipmentId)
            if (equipmentJobsRequestRef.current === requestId) setJobs(rows)
            return rows
        } catch (error) {
            if (equipmentJobsRequestRef.current === requestId) {
                setEquipmentJobsError(error instanceof Error ? error.message : 'Equipment Job history could not be loaded.')
            }
            throw error
        } finally {
            if (equipmentJobsRequestRef.current === requestId) setIsEquipmentJobsLoading(false)
        }
    }, [getToken])

    const clearEquipmentJobs = useCallback(() => {
        equipmentJobsRequestRef.current += 1
        setJobs([])
        setEquipmentJobsError('')
        setIsEquipmentJobsLoading(false)
    }, [])

    const updateEquipment = async (record: Equipment, input: EquipmentUpdateInput, resolvedSite?: Site) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await updateEquipmentApi(token, record.gr_equipmentid, input)
            const selectedSite = resolvedSite ?? sites.find((site) => site.gr_siteid === input.siteId)
            const updated = applyEquipmentUpdate(record, input, selectedSite)
            const recordPlans = servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === record.gr_equipmentid.toLowerCase())
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

    return {
        equipment, customers, sites, jobs, servicePlans, equipmentCacheStatus, equipmentRealtimeStatus, isLoading, isSaving, isEquipmentJobsLoading, loadError, saveError, equipmentJobsError,
        reload: load,
        loadEquipmentJobs,
        clearEquipmentJobs,
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
        saveEquipmentMaintenanceHistory,
        applyEquipmentCsvUpdates,
        deleteEquipment,
    }
}
