import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { fetchEquipment, fetchEquipmentById, searchEquipment } from '../../jobs/services/equipmentApi'
import { fetchCustomers, searchCustomers, createCustomer as createCustomerApi } from '../../jobs/services/customersApi'
import { fetchCustomerSites, fetchSites, createSite as createSiteApi } from '../../jobs/services/sitesApi'
import { createEquipment as createJobEquipmentApi } from '../../jobs/services/equipmentApi'
import { createContact as createContactApi, createSiteContact as createSiteContactApi } from '../../jobs/services/contactsApi'
import { fetchSiteContactsForSite } from '../../jobs/services/siteContactsApi'
import { createJobScheduleOption, deleteJobScheduleOption, fetchJobScheduleOptionsForJobs, updateJobScheduleOption } from '../../jobs/services/jobScheduleApi'
import { SCHEDULE_TYPE } from '../../jobs/types/jobSchedule.types'
import { applyEquipmentUpdate, createEquipment as createEquipmentApi, deleteEquipment as deleteEquipmentApi, updateEquipment as updateEquipmentApi } from '../../equipment/services/equipmentManagerApi'
import { normalizeEquipmentInput, type EquipmentUpdateInput } from '../../equipment/types/equipmentManager.types'
import { fetchEquipmentServicePlansForEquipment, saveEquipmentMaintenanceHistory as saveEquipmentMaintenanceHistoryApi, syncEquipmentServiceProgramme, type MaintenanceHistoryInput } from '../../equipment/servicePlans/servicePlanApi'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Site } from '../../jobs/types/site.types'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import type { SiteContact } from '../../jobs/types/siteContact.types'
import type { JobSaveInput } from '../../jobs/types/jobSave.types'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types'
import { JOB_TYPES } from '../../jobs/types/jobType.types'
import { SERVICE_TYPES } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { CreateWofInput, ServiceProvider, TechnicianQualification, UpdateWofInput, WofInspection } from '../types/wof.types'
import { createWof as createWofApi, createWofJobFromJobDrawer, deleteWofInspection, fetchTechnicianQualifications, fetchWofInspection, fetchWofInspections, fetchWofProviders, updateWof as updateWofApi } from '../services/wofApi'
import { getWofDeletionBlockReason } from '../utils/wofRules'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { fetchMechanics as fetchStaffDirectory } from '../../mechanics/services/mechanicsApi'
import { subscribeToStaffChanges } from '../../mechanics/services/staffRealtime'
import { useOperationalQuery } from '../../shared/data/useOperationalQuery'
import { useOperationalDataClient } from '../../shared/data/OperationalDataClientContext'
import {
    operationalIdFingerprint,
    WOF_INSPECTIONS_QUERY_KEY,
    wofScheduleOptionsQueryKey,
} from '../../shared/data/operationalCollectionKeys'

const EMPTY_WOF_INSPECTIONS: WofInspection[] = []
const EMPTY_WOF_SCHEDULE_OPTIONS: Awaited<ReturnType<typeof fetchJobScheduleOptionsForJobs>> = []
const WOF_REGISTER_STALE_TIME_MS = 20_000
const WOF_REGISTER_CACHE_TIME_MS = 2 * 60_000

function registerJobIds(rows: WofInspection[]) {
    return [...new Set(rows
        .map((inspection) => inspection.linkedJobId ?? inspection.gr_Job?.gr_jobid)
        .filter((jobId): jobId is string => Boolean(jobId)))]
}

function equipmentRelationships(rows: Equipment[]) {
    const customers = new Map<string, Customer>()
    const sites = new Map<string, Site>()
    rows.forEach((item) => {
        const site = item.gr_Site
        const customer = site?.gr_Customer
        if (customer?.gr_customerid) customers.set(customer.gr_customerid.toLowerCase(), customer)
        if (site?.gr_siteid) sites.set(site.gr_siteid.toLowerCase(), { ...site, gr_address: site.gr_address ?? '' })
    })
    return { customers: [...customers.values()], sites: [...sites.values()] }
}

export function useWof() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const client = useOperationalDataClient()
    const [equipment, setEquipment] = useState<Awaited<ReturnType<typeof fetchEquipment>>>([])
    const [qualifications, setQualifications] = useState<TechnicianQualification[]>([])
    const [providers, setProviders] = useState<ServiceProvider[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [siteContacts, setSiteContacts] = useState<SiteContact[]>([])
    const [servicePlans, setServicePlans] = useState<EquipmentServicePlan[]>([])
    const [isEquipmentSaving, setIsEquipmentSaving] = useState(false)
    const [equipmentSaveError, setEquipmentSaveError] = useState('')
    const [equipmentLoading, setEquipmentLoading] = useState(true)
    const [equipmentError, setEquipmentError] = useState('')
    const wofEditorSupportLoaded = useRef(false)
    const wofEditorSupportRequest = useRef<Promise<void> | null>(null)
    const staffDirectoryLoaded = useRef(false)

    const mergeEquipment = useCallback((record: Equipment) => {
        setEquipment((current) => current.some((item) => item.gr_equipmentid.toLowerCase() === record.gr_equipmentid.toLowerCase())
            ? current.map((item) => item.gr_equipmentid.toLowerCase() === record.gr_equipmentid.toLowerCase() ? record : item)
            : [...current, record])
    }, [])

    const token = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )

    const inspectionsQuery = useOperationalQuery<WofInspection[]>({
        key: WOF_INSPECTIONS_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: WOF_REGISTER_STALE_TIME_MS,
        cacheTimeMs: WOF_REGISTER_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchWofInspections(await token(), signal),
    })
    const refetchInspections = inspectionsQuery.refetch
    const inspections = inspectionsQuery.data ?? EMPTY_WOF_INSPECTIONS
    const inspectionJobIds = useMemo(() => registerJobIds(inspections), [inspections])
    const inspectionJobFingerprint = useMemo(
        () => operationalIdFingerprint(inspectionJobIds),
        [inspectionJobIds],
    )
    const scheduleOptionsQuery = useOperationalQuery<Awaited<ReturnType<typeof fetchJobScheduleOptionsForJobs>>>({
        key: wofScheduleOptionsQueryKey(inspectionJobFingerprint),
        enabled: Boolean(account && inspectionsQuery.data !== undefined),
        staleTimeMs: WOF_REGISTER_STALE_TIME_MS,
        cacheTimeMs: WOF_REGISTER_CACHE_TIME_MS,
        queryFn: async ({ signal }) => fetchJobScheduleOptionsForJobs(await token(), inspectionJobIds, signal),
    })
    const scheduleOptions = scheduleOptionsQuery.data ?? EMPTY_WOF_SCHEDULE_OPTIONS

    const loadEquipmentServicePlans = useCallback(async (equipmentId: string, signal?: AbortSignal) => {
        return fetchEquipmentServicePlansForEquipment(await token(), [equipmentId], signal)
    }, [token])

    const refreshWorkflowData = useCallback(async (forceEquipmentRefresh = true) => {
        const accessToken = await token()
        const [equipmentRows, inspectionRows] = await Promise.all([
            fetchEquipment(accessToken, { forceRefresh: forceEquipmentRefresh }),
            refetchInspections(),
        ])
        const refreshedJobIds = registerJobIds(inspectionRows)
        await client.fetchQuery(
            wofScheduleOptionsQueryKey(operationalIdFingerprint(refreshedJobIds)),
            async ({ signal }) => fetchJobScheduleOptionsForJobs(await token(), refreshedJobIds, signal),
            {
                staleTimeMs: WOF_REGISTER_STALE_TIME_MS,
                cacheTimeMs: WOF_REGISTER_CACHE_TIME_MS,
                forceRefresh: true,
            },
        )
        const relationships = equipmentRelationships(equipmentRows)
        setEquipment(equipmentRows)
        setCustomers((current) => wofEditorSupportLoaded.current ? current : relationships.customers)
        setSites((current) => wofEditorSupportLoaded.current ? current : relationships.sites)
    }, [client, refetchInspections, token])

    const loadEquipmentRegister = useCallback(async (forceRefresh = false) => {
        if (!account) { setEquipmentLoading(false); return }
        setEquipmentLoading(true); setEquipmentError('')
        try {
            const equipmentRows = await fetchEquipment(await token(), { forceRefresh })
            const relationships = equipmentRelationships(equipmentRows)
            setEquipment(equipmentRows)
            setCustomers((current) => wofEditorSupportLoaded.current ? current : relationships.customers)
            setSites((current) => wofEditorSupportLoaded.current ? current : relationships.sites)
        } catch (caught) { setEquipmentError(caught instanceof Error ? caught.message : 'WOF Equipment could not be loaded.') }
        finally { setEquipmentLoading(false) }
    }, [account, token])

    const reload = useCallback(async () => {
        if (!account) return
        setEquipmentLoading(true); setEquipmentError('')
        try {
            await refreshWorkflowData(true)
        } catch (caught) { setEquipmentError(caught instanceof Error ? caught.message : 'WOF data could not be loaded.') }
        finally { setEquipmentLoading(false) }
    }, [account, refreshWorkflowData])

    useEffect(() => {
        const timer = window.setTimeout(() => { void loadEquipmentRegister(false) }, 0)
        return () => window.clearTimeout(timer)
    }, [loadEquipmentRegister])

    useEffect(() => {
        if (!account) return
        let cancelled = false
        let refreshTimer: number | undefined
        const unsubscribe = subscribeToStaffChanges(() => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(async () => {
                try {
                    if (!staffDirectoryLoaded.current) return
                    const rows = await fetchStaffDirectory(await token())
                    if (!cancelled) setMechanics(rows)
                } catch { /* Keep the current Staff choices until the next refresh. */ }
            }, 750)
        })
        return () => {
            cancelled = true
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            unsubscribe()
        }
    }, [account, token])

    const loadWofEditorSupport = useCallback(async () => {
        if (wofEditorSupportLoaded.current) return
        if (wofEditorSupportRequest.current) return wofEditorSupportRequest.current
        const request = (async () => {
            const accessToken = await token()
            const [qualificationRows, providerRows, customerRows, siteRows] = await Promise.all([
                fetchTechnicianQualifications(accessToken),
                fetchWofProviders(accessToken),
                fetchCustomers(accessToken),
                fetchSites(accessToken),
            ])
            setQualifications(qualificationRows)
            setProviders(providerRows)
            setCustomers(customerRows)
            setSites(siteRows)
            wofEditorSupportLoaded.current = true
        })()
        wofEditorSupportRequest.current = request
        try {
            await request
        } finally {
            if (wofEditorSupportRequest.current === request) wofEditorSupportRequest.current = null
        }
    }, [token])

    const loadWofJobCreationSupport = useCallback(async (record: typeof equipment[number]) => {
        const accessToken = await token()
        const siteId = record.gr_Site?.gr_siteid
        const mechanicRequest = staffDirectoryLoaded.current
            ? Promise.resolve(mechanics)
            : fetchStaffDirectory(accessToken)
        const [mechanicRows, contactRows, planRows] = await Promise.all([
            mechanicRequest,
            siteId ? fetchSiteContactsForSite(accessToken, siteId) : Promise.resolve([]),
            fetchEquipmentServicePlansForEquipment(accessToken, [record.gr_equipmentid]),
        ])
        staffDirectoryLoaded.current = true
        setMechanics(mechanicRows)
        setSiteContacts(contactRows)
        setServicePlans(planRows)
    }, [mechanics, token])

    const searchEquipmentForEditor = useCallback(async (query: string, context: { customerId?: string; siteId?: string }, signal?: AbortSignal) =>
        searchEquipment(await token(), query, context, signal), [token])
    const searchCustomersForEditor = useCallback(async (query: string, signal?: AbortSignal) =>
        searchCustomers(await token(), query, signal), [token])
    const loadCustomerSitesForEditor = useCallback(async (customerId: string, signal?: AbortSignal) =>
        fetchCustomerSites(await token(), customerId, signal), [token])
    const loadSiteContactsForEditor = useCallback(async (siteId: string, signal?: AbortSignal) =>
        fetchSiteContactsForSite(await token(), siteId, signal), [token])
    const loadEquipmentForEditor = useCallback(async (equipmentId: string, signal?: AbortSignal) => {
        const record = await fetchEquipmentById(await token(), equipmentId, signal)
        if (record) mergeEquipment(record)
        return record
    }, [mergeEquipment, token])

    const createWof = async (input: CreateWofInput) => {
        const accessToken = await token()
        await createWofApi(accessToken, input, {
            jobNumber: input.jobNumber.trim(), orderNumber: '', description: input.description.trim(),
            jobType: JOB_TYPES.WOF, status: input.assignmentMode === 'internal' ? JOB_STATUSES.ALLOCATED : JOB_STATUSES.UNALLOCATED,
            equipmentId: input.equipment.gr_equipmentid,
            mechanicId: input.assignmentMode === 'internal' ? input.internalInspectorId : undefined,
            siteId: input.equipment.gr_Site?.gr_siteid,
            serviceType: SERVICE_TYPES.NONE,
        })
        await refreshWorkflowData()
    }

    const createWofJob = async (equipmentRecord: typeof equipment[number], job: JobSaveInput) => {
        const jobId = await createWofJobFromJobDrawer(await token(), equipmentRecord, job)
        await refreshWorkflowData()
        return jobId
    }

    const createWofScheduleOption = async (input: Parameters<typeof createJobScheduleOption>[1]) => {
        await createJobScheduleOption(await token(), input)
        await refreshWorkflowData()
    }

    const updateWof = async (input: UpdateWofInput) => {
        const accessToken = await token()
        await updateWofApi(accessToken, input)
        try {
            if (input.scheduledDate && input.scheduleOptionId) await updateJobScheduleOption(accessToken, input.scheduleOptionId, { jobId: input.jobId, scheduleType: SCHEDULE_TYPE.ANY_TIME, scheduleDate: input.scheduledDate, confirmed: true })
            else if (input.scheduledDate) await createJobScheduleOption(accessToken, { jobId: input.jobId, scheduleType: SCHEDULE_TYPE.ANY_TIME, scheduleDate: input.scheduledDate, confirmed: true })
            else if (input.scheduleOptionId) await deleteJobScheduleOption(accessToken, input.scheduleOptionId)
        } catch (caught) {
            throw new Error(`The Job and WOF Inspection were updated, but the schedule was not. Retry the schedule change. ${caught instanceof Error ? caught.message : ''}`, { cause: caught })
        }
        await refreshWorkflowData()
    }

    const loadWofInspection = async (inspectionId: string) =>
        fetchWofInspection(await token(), inspectionId)

    const loadEquipment = async (equipmentId: string) => {
        const record = await fetchEquipmentById(await token(), equipmentId)
        if (!record) throw new Error('The selected Equipment record could not be found.')
        mergeEquipment(record)
        return record
    }

    const updateEquipment = async (record: typeof equipment[number], input: EquipmentUpdateInput) => {
        setIsEquipmentSaving(true)
        setEquipmentSaveError('')
        try {
            const normalized = normalizeEquipmentInput(input)
            const accessToken = await token()
            await updateEquipmentApi(accessToken, record.gr_equipmentid, normalized)
            const updated = applyEquipmentUpdate(record, normalized, sites.find((site) => site.gr_siteid === normalized.siteId))
            const recordPlans = await fetchEquipmentServicePlansForEquipment(accessToken, [record.gr_equipmentid])
            const syncedPlans = await syncEquipmentServiceProgramme(accessToken, updated, recordPlans)
            setServicePlans((current) => [...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()), ...syncedPlans])
            setEquipment((current) => current.map((item) => item.gr_equipmentid === updated.gr_equipmentid ? updated : item))
            return updated
        } catch (caught) {
            setEquipmentSaveError(caught instanceof Error ? caught.message : 'Equipment could not be saved.')
            throw caught
        } finally {
            setIsEquipmentSaving(false)
        }
    }

    const saveEquipmentMaintenanceHistory = async (record: typeof equipment[number], plans: EquipmentServicePlan[], input: MaintenanceHistoryInput) => {
        setIsEquipmentSaving(true)
        setEquipmentSaveError('')
        try {
            const updatedPlans = await saveEquipmentMaintenanceHistoryApi(await token(), record.gr_equipmentid, record, plans, input)
            const updatedEquipment = {
                ...record,
                gr_currenthourmeter: input.currentHourMeter,
                gr_currenthourmeterrecordeddate: input.readingRecordedDate,
            }
            setEquipment((current) => current.map((item) => item.gr_equipmentid === record.gr_equipmentid ? updatedEquipment : item))
            setServicePlans((current) => [
                ...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()),
                ...updatedPlans,
            ])
            return updatedEquipment
        } catch (caught) {
            setEquipmentSaveError(caught instanceof Error ? caught.message : 'Maintenance history could not be saved.')
            throw caught
        } finally {
            setIsEquipmentSaving(false)
        }
    }

    const deleteEquipment = async (equipmentId: string) => {
        setIsEquipmentSaving(true)
        setEquipmentSaveError('')
        try {
            await deleteEquipmentApi(await token(), equipmentId)
            setEquipment((current) => current.filter((item) => item.gr_equipmentid !== equipmentId))
        } catch (caught) {
            setEquipmentSaveError(caught instanceof Error ? caught.message : 'Equipment could not be deleted.')
            throw caught
        } finally {
            setIsEquipmentSaving(false)
        }
    }

    const deleteWof = async (inspection: WofInspection) => {
        const blockedReason = getWofDeletionBlockReason(inspection)
        if (blockedReason) throw new Error(blockedReason)
        const accessToken = await token()

        try {
            await deleteWofInspection(accessToken, inspection.gr_wofinspectionid)
        } catch (caught) {
            throw new Error('The WOF Inspection could not be deleted. Check delete permissions or dependent records and try again.', { cause: caught })
        }
        await refreshWorkflowData()
    }

    const createCustomer = async (input: { name: string }) => {
        const id = await createCustomerApi(await token(), input)
        const created = { gr_customerid: id, gr_name: input.name.trim() }
        setCustomers((current) => [...current, created])
        return created
    }

    const createSite = async (input: { customerId: string; name: string; address?: string }, customer?: Customer) => {
        const id = await createSiteApi(await token(), input)
        const created = { gr_siteid: id, gr_name: input.name.trim(), gr_address: input.address?.trim() || '', gr_Customer: customers.find((item) => item.gr_customerid === input.customerId) ?? customer }
        setSites((current) => [...current, created])
        return created
    }

    const createContact = async (input: { siteId: string; name: string; phone?: string; email?: string }) => {
        const accessToken = await token()
        const contactId = await createContactApi(accessToken, input)
        await createSiteContactApi(accessToken, input.siteId, contactId)
        setSiteContacts(await fetchSiteContactsForSite(accessToken, input.siteId))
        return contactId
    }

    const createJobEquipment = async (input: { fleet: string; serial: string; make?: string; model?: string }) => {
        const equipmentId = await createJobEquipmentApi(await token(), input)
        const record = await fetchEquipmentById(await token(), equipmentId)
        if (record) mergeEquipment(record)
        return equipmentId
    }

    const createEquipment = async (input: EquipmentUpdateInput, resolvedSite?: Site) => {
        const normalized = normalizeEquipmentInput(input)
        const response = await createEquipmentApi(await token(), normalized)
        const created = { ...response, gr_fleet: normalized.fleet || null, gr_alternatefleetnumbers: normalized.alternateFleetNumbers || null, gr_make: normalized.make || null, gr_model: normalized.model || null, gr_serial: normalized.serial || null, gr_registrationnumber: normalized.registrationNumber || null, gr_wofrequired: normalized.wofRequired, gr_currentwofexpiry: normalized.currentWofExpiry || null, gr_regoexpiry: normalized.regoExpiry || null, gr_Site: resolvedSite ?? sites.find((site) => site.gr_siteid === normalized.siteId) }
        setEquipment((current) => current.some((item) => item.gr_equipmentid === created.gr_equipmentid)
            ? current.map((item) => item.gr_equipmentid === created.gr_equipmentid ? created : item)
            : [...current, created])
        return created
    }

    const inspectionsLoading = inspectionsQuery.status === 'initial' || inspectionsQuery.status === 'loading'
    const scheduleOptionsLoading = inspectionsQuery.data !== undefined
        && (scheduleOptionsQuery.status === 'initial' || scheduleOptionsQuery.status === 'loading')
    const loading = Boolean(account) && (equipmentLoading || inspectionsLoading || scheduleOptionsLoading)
    const error = equipmentError
        || (inspectionsQuery.data === undefined ? inspectionsQuery.error?.message : '')
        || (scheduleOptionsQuery.data === undefined ? scheduleOptionsQuery.error?.message : '')
        || ''

    return {
        equipment, inspections, qualifications, providers, customers, sites, mechanics, siteContacts,
        scheduleOptions, servicePlans, loading, error, isEquipmentSaving, equipmentSaveError,
        reload, refreshWorkflowData, loadWofInspection, loadEquipment, loadEquipmentServicePlans,
        loadWofEditorSupport, loadWofJobCreationSupport,
        searchEquipmentForEditor, searchCustomersForEditor, loadCustomerSitesForEditor,
        loadSiteContactsForEditor, loadEquipmentForEditor,
        createWof, createWofJob, createWofScheduleOption, updateWof, deleteWof, createCustomer,
        createSite, createContact, createJobEquipment, createEquipment, updateEquipment,
        saveEquipmentMaintenanceHistory, deleteEquipment, clearEquipmentSaveError: () => setEquipmentSaveError(''),
    }
}
