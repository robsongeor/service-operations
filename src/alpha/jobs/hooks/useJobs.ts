import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import type { Job } from '../types/job.types'
import type { Equipment } from '../types/equipment.types'
import {
    fetchJobs as fetchJobsApi,
    fetchEquipmentJobs as fetchEquipmentJobsApi,
    subscribeToJobsData,
    fetchJobCore as fetchJobCoreApi,
    fetchJobCardDetails as fetchJobCardDetailsApi,
    fetchJobPhotoBody as fetchJobPhotoBodyApi,
    createJob as createJobApi,
    updateJobStatus as updateJobStatusApi,
    updateJobCardStatus as updateJobCardStatusApi,
    updateJobFields as updateJobFieldsApi,
    allocateJobNumbers as allocateJobNumbersApi,
    updateJobOfficeAttention as updateJobOfficeAttentionApi,
    updateJob as updateJobApi,
    deleteJob as deleteJobApi,
} from '../services/jobsApi'
import { subscribeToJobChanges } from '../services/jobsRealtime'
import type { JobSaveInput } from '../types/jobSave.types'
import { JOB_STATUSES, UNCONFIRMED_OPERATION_MESSAGE, jobIsOperational, type JobStatus } from '../types/jobStatus.types'
import { jobIsSchedulerEligible, SITE_CHECK_SCHEDULER_MESSAGE } from '../types/jobSchedulerEligibility'
import { JOB_CARD_STATUSES, type JobCardStatus } from '../types/jobCardStatus.types'
import type { JobAssignmentInput } from '../types/jobAssignment.types'
import {
    createJobAssignment as createJobAssignmentApi,
    deleteJobAssignment as deleteJobAssignmentApi,
    fetchJobAssignmentsForJob as fetchJobAssignmentsForJobApi,
    updateJobAssignmentStatus as updateJobAssignmentStatusApi,
} from '../services/jobAssignmentsApi'
import type { JobAssignment } from '../types/jobAssignment.types'
import { fetchMechanics as fetchStaffDirectory } from '../../mechanics/services/mechanicsApi'
import { subscribeToStaffChanges } from '../../mechanics/services/staffRealtime'
import { createEmailDispatch, waitForEmailDispatch } from '../services/emailDispatchApi'
import { assertJobEmailSendingAllowed, buildAssignmentJobEmail, buildPrimaryJobEmail, onlineJobCardPilotEnabled, type JobEmailDeliveryState, type JobEmailDraft } from '../services/jobEmail'
import { assertJobHasEmailableJobNumber } from '../services/jobEmailRules'
import { generateJobSubmissionLink } from '../services/jobSubmissionLinkApi'
import { isValidTechnicianEmail } from '../utils/technicianMailto'
import type {
    JobScheduleOption,
    JobScheduleOptionInput,
} from '../types/jobSchedule.types'
import {
    createJobScheduleOption as createJobScheduleOptionApi,
    deleteJobScheduleOption as deleteJobScheduleOptionApi,
    fetchJobScheduleOptions as fetchJobScheduleOptionsApi,
    updateJobScheduleConfirmation as updateJobScheduleConfirmationApi,
    updateJobScheduleOption as updateJobScheduleOptionApi,
} from '../services/jobScheduleApi'

import {
    fetchEquipment as fetchEquipmentApi,
    fetchEquipmentById as fetchEquipmentByIdApi,
    searchEquipment as searchEquipmentApi,
    createEquipment as createEquipmentApi,
    updateEquipmentSite
} from '../services/equipmentApi'

import type { Mechanic } from '../types/mechanic.types'

import type { Customer } from '../types/customer.types'
import {
    createCustomer as createCustomerApi,
    searchCustomers as searchCustomersApi,
} from '../services/customersApi'

import type { Site } from '../types/site.types'
import {
    createSite as createSiteApi,
    fetchCustomerSites as fetchCustomerSitesApi,
} from '../services/sitesApi'

import type { SiteContact } from '../types/siteContact.types'
import { fetchSiteContactsForSite as fetchSiteContactsForSiteApi } from '../services/siteContactsApi'
import {
    createJobOfficeUpdate as createJobOfficeUpdateApi,
    fetchJobOfficeUpdates as fetchJobOfficeUpdatesApi,
    fetchJobOfficeUpdatesForJobs as fetchJobOfficeUpdatesForJobsApi,
} from '../services/jobOfficeUpdatesApi'
import type { JobOfficeUpdate } from '../types/officeAction.types'

import {
    createContact as createContactApi,
    createSiteContact as createSiteContactApi,
} from '../services/contactsApi'
import { fetchQuotesForJob as fetchQuotesForJobApi } from '../../quotes/services/quotesApi'
import { updateSiteCheckJobStatus } from '../../site-checks/services/siteCheckCompletionApi'
import {
    fetchEquipmentServicePlansForEquipment,
    refreshEquipmentServicePlanDueDates,
    saveEquipmentMaintenanceHistory as saveEquipmentMaintenanceHistoryApi,
    syncEquipmentServiceProgramme,
    updateEquipmentCurrentHourMeter,
    type MaintenanceHistoryInput,
} from '../../equipment/servicePlans/servicePlanApi'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { resolveLatestHourMeterReading } from '../../equipment/servicePlans/equipmentUsageForecast'
import {
    applyEquipmentUpdate,
    deleteEquipment as deleteEquipmentApi,
    updateEquipment as updateEquipmentApi,
    updateEquipmentMaintenanceSetup as updateEquipmentMaintenanceSetupApi,
} from '../../equipment/services/equipmentManagerApi'
import type { EquipmentUpdateInput } from '../../equipment/types/equipmentManager.types'
import {
    validateMaintenanceConfiguration,
    type EquipmentMaintenanceSetupInput,
} from '../../equipment/servicePlans/maintenanceConfiguration'
import {
    getJobCompletionKind,
    jobCompletionDateTime,
    resolveCompletionEquipment,
    resolveCompletionServiceType,
    runWofCompletion,
    validateCompletionHourMeter,
    validateHourMeterRecordedDate,
    validateJobCompletionDate,
    validateEquipmentCompletionContext,
    validateServiceCompletionContext,
    validateWofCompletionExpiry,
    type JobCompletionRequest,
} from '../completion/jobCompletion'
import { completeServiceJobAtomically } from '../completion/serviceCompletionApi'
import { updateWofExpiryForCompletion } from '../../wof/services/wofApi'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import type { HourMeterReadingType } from '../../equipment/hourMeter/hourMeterReading.types'
import { useOperationalQueryState } from '../../shared/data/useOperationalQueryState'
import { useOperationalQuery } from '../../shared/data/useOperationalQuery'
import {
    EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY,
    JOBS_OPERATIONAL_LIST_QUERY_KEY,
    STAFF_DIRECTORY_QUERY_KEY,
} from '../../shared/data/operationalCollectionKeys'
import { subscribeToOperationalRealtimeRecovery } from '../../shared/realtime/operationalRealtimeEvents'
import { useOperationalRealtimeStatus } from '../../shared/realtime/OperationalRealtimeStatusContext'

const EMPTY_JOBS: Job[] = []
const EMPTY_EQUIPMENT: Equipment[] = []

type JobReferenceData = {
    equipment: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    servicePlans: EquipmentServicePlan[]
}

type JobEditorReferenceData = Pick<JobReferenceData,
    'equipment' | 'sites' | 'customers' | 'siteContacts' | 'servicePlans'
>

function mergeRecordsById<T>(current: T[], incoming: readonly T[], getId: (record: T) => string) {
    const merged = new Map(current.map((record) => [getId(record).toLowerCase(), record]))
    incoming.forEach((record) => merged.set(getId(record).toLowerCase(), record))
    return [...merged.values()]
}


type UseJobsOptions = Readonly<{
    loadGlobalOperationalData?: boolean
    scopedData?: Readonly<{
        jobs: Job[]
        equipment: Equipment[]
        sites: Site[]
        servicePlans: EquipmentServicePlan[]
        scheduleOptions?: JobScheduleOption[]
        officeUpdates?: JobOfficeUpdate[]
    }>
    onScopedDataChanged?: () => void | Promise<void>
}>

export function useJobs(options: UseJobsOptions = {}) {
    const loadGlobalOperationalData = options.loadGlobalOperationalData !== false
    const { instance } = useMsal()
    const account = useActiveMsalAccount()

    const {
        data: sharedJobs,
        hasData: hasSharedJobs,
        setData: setSharedJobs,
    } = useOperationalQueryState<Job[]>(JOBS_OPERATIONAL_LIST_QUERY_KEY, EMPTY_JOBS)
    const {
        data: sharedEquipmentList,
        setData: setSharedEquipmentList,
    } = useOperationalQueryState<Equipment[]>(EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY, EMPTY_EQUIPMENT)
    const [scopedJobs, setScopedJobs] = useState<Job[]>(options.scopedData?.jobs ?? [])
    const [scopedEquipmentList, setScopedEquipmentList] = useState<Equipment[]>(options.scopedData?.equipment ?? [])
    const jobs = loadGlobalOperationalData ? sharedJobs : scopedJobs
    const equipmentList = loadGlobalOperationalData ? sharedEquipmentList : scopedEquipmentList
    const setJobs = useCallback((updater: Job[] | ((current: Job[]) => Job[])) => {
        if (loadGlobalOperationalData) setSharedJobs(updater)
        else setScopedJobs(updater)
    }, [loadGlobalOperationalData, setSharedJobs])
    const setEquipmentList = useCallback((updater: Equipment[] | ((current: Equipment[]) => Equipment[])) => {
        if (loadGlobalOperationalData) setSharedEquipmentList(updater)
        else setScopedEquipmentList(updater)
    }, [loadGlobalOperationalData, setSharedEquipmentList])
    const staffDirectoryQuery = useOperationalQuery<Mechanic[]>({
        key: STAFF_DIRECTORY_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: 20_000,
        cacheTimeMs: 5 * 60_000,
        queryFn: async ({ signal }) => fetchStaffDirectory(
            await acquireDataverseAccessToken(instance, account),
            signal,
        ),
    })
    const mechanics = staffDirectoryQuery.data ?? []
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>(options.scopedData?.sites ?? [])
    const [siteContacts, setSiteContacts] = useState<SiteContact[]>([])
    const [scheduleOptions, setScheduleOptions] = useState<JobScheduleOption[]>(options.scopedData?.scheduleOptions ?? [])
    const [servicePlans, setServicePlans] = useState<EquipmentServicePlan[]>(options.scopedData?.servicePlans ?? [])
    const [officeUpdates, setOfficeUpdates] = useState<JobOfficeUpdate[]>(options.scopedData?.officeUpdates ?? [])
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [reloadKey, setReloadKey] = useState(0)
    const [completionRequest, setCompletionRequest] = useState<JobCompletionRequest | null>(null)
    const [isCompletingJob, setIsCompletingJob] = useState(false)
    const [completionError, setCompletionError] = useState('')
    const [isEquipmentSaving, setIsEquipmentSaving] = useState(false)
    const [equipmentSaveError, setEquipmentSaveError] = useState('')
    const [jobsCacheStatus, setJobsCacheStatus] = useState<{
        source: 'device' | 'network'
        savedAt: number
        refreshing: boolean
    } | null>(null)
    const jobsRealtimeStatus = useOperationalRealtimeStatus()
    const [referenceDataStatus, setReferenceDataStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [referenceDataError, setReferenceDataError] = useState('')
    const [emailDeliveryStates, setEmailDeliveryStates] = useState<Record<string, JobEmailDeliveryState>>({})
    const referenceDataRequestRef = useRef<Promise<JobReferenceData> | null>(null)
    const referenceDataValueRef = useRef<JobReferenceData | null>(null)
    const referenceDataReadyRef = useRef(false)
    const editorReferenceDataValueRef = useRef<JobEditorReferenceData | null>(null)
    const hasSharedJobsRef = useRef(hasSharedJobs)
    const scopedJobsRef = useRef(scopedJobs)
    const scopedScheduleOptionsRef = useRef(scheduleOptions)
    const scopedOfficeUpdatesRef = useRef(officeUpdates)
    const onScopedDataChangedRef = useRef(options.onScopedDataChanged)

    useEffect(() => {
        scopedJobsRef.current = scopedJobs
    }, [scopedJobs])

    useEffect(() => {
        scopedScheduleOptionsRef.current = scheduleOptions
    }, [scheduleOptions])

    useEffect(() => {
        scopedOfficeUpdatesRef.current = officeUpdates
    }, [officeUpdates])

    useEffect(() => {
        onScopedDataChangedRef.current = options.onScopedDataChanged
    }, [options.onScopedDataChanged])

    const scopedDataJobs = options.scopedData?.jobs
    const scopedDataEquipment = options.scopedData?.equipment
    const scopedDataSites = options.scopedData?.sites
    const scopedDataServicePlans = options.scopedData?.servicePlans
    const scopedDataScheduleOptions = options.scopedData?.scheduleOptions
    const scopedDataOfficeUpdates = options.scopedData?.officeUpdates
    const hasScopedScheduleOptions = scopedDataScheduleOptions !== undefined
    const hasScopedOfficeUpdates = scopedDataOfficeUpdates !== undefined
    useEffect(() => {
        if (loadGlobalOperationalData || !scopedDataJobs) return
        setScopedJobs(scopedDataJobs)
    }, [loadGlobalOperationalData, scopedDataJobs])
    useEffect(() => {
        if (loadGlobalOperationalData || !scopedDataEquipment) return
        setScopedEquipmentList(scopedDataEquipment)
    }, [loadGlobalOperationalData, scopedDataEquipment])
    useEffect(() => {
        if (loadGlobalOperationalData || !scopedDataSites) return
        setSites(scopedDataSites)
    }, [loadGlobalOperationalData, scopedDataSites])
    useEffect(() => {
        if (loadGlobalOperationalData || !scopedDataServicePlans) return
        setServicePlans(scopedDataServicePlans)
    }, [loadGlobalOperationalData, scopedDataServicePlans])
    useEffect(() => {
        if (loadGlobalOperationalData || !scopedDataScheduleOptions) return
        setScheduleOptions(scopedDataScheduleOptions)
    }, [loadGlobalOperationalData, scopedDataScheduleOptions])
    useEffect(() => {
        if (loadGlobalOperationalData || !scopedDataOfficeUpdates) return
        setOfficeUpdates(scopedDataOfficeUpdates)
    }, [loadGlobalOperationalData, scopedDataOfficeUpdates])

    useEffect(() => {
        hasSharedJobsRef.current = hasSharedJobs
    }, [hasSharedJobs])

    const getAccessToken = useCallback(async () => {
        return acquireDataverseAccessToken(instance, account)
    }, [account, instance])

    useEffect(() => {
        if (!account || !loadGlobalOperationalData) return
        let cancelled = false
        let unsubscribe: (() => void) | undefined
        void getAccessToken().then((token) => {
            if (cancelled) return
            unsubscribe = subscribeToJobsData(token, (rows) => {
                if (!cancelled) setJobs(rows)
            })
        }).catch(() => undefined)
        return () => {
            cancelled = true
            unsubscribe?.()
        }
    }, [account, getAccessToken, loadGlobalOperationalData, setJobs])

    const prepareJobEditorReferenceData = useCallback(async () => {
        if (editorReferenceDataValueRef.current) return editorReferenceDataValueRef.current
        setReferenceDataError('')
        setReferenceDataStatus('ready')
        const data: JobEditorReferenceData = {
            equipment: equipmentList,
            sites,
            customers,
            siteContacts,
            servicePlans,
        }
        editorReferenceDataValueRef.current = data
        return data
    }, [customers, equipmentList, servicePlans, siteContacts, sites])

    const searchEquipmentForEditor = useCallback(async (
        query: string,
        context: { customerId?: string; siteId?: string } = {},
        signal?: AbortSignal,
    ) => {
        const rows = await searchEquipmentApi(await getAccessToken(), query, context, signal)
        setEquipmentList((current) => mergeRecordsById(current, rows, (record) => record.gr_equipmentid))
        return rows
    }, [getAccessToken, setEquipmentList])

    const searchCustomersForEditor = useCallback(async (query: string, signal?: AbortSignal) => {
        const rows = await searchCustomersApi(await getAccessToken(), query, signal)
        setCustomers((current) => mergeRecordsById(current, rows, (record) => record.gr_customerid))
        return rows
    }, [getAccessToken])

    const loadCustomerSitesForEditor = useCallback(async (customerId: string, signal?: AbortSignal) => {
        const rows = await fetchCustomerSitesApi(await getAccessToken(), customerId, signal)
        setSites((current) => mergeRecordsById(current, rows, (record) => record.gr_siteid))
        return rows
    }, [getAccessToken])

    const loadSiteContactsForEditor = useCallback(async (siteId: string, signal?: AbortSignal) => {
        const rows = await fetchSiteContactsForSiteApi(await getAccessToken(), siteId, signal)
        setSiteContacts((current) => mergeRecordsById(current, rows, (record) => record.gr_sitecontactid))
        return rows
    }, [getAccessToken])

    const loadEquipmentForEditor = useCallback(async (equipmentId: string, signal?: AbortSignal) => {
        const row = await fetchEquipmentByIdApi(await getAccessToken(), equipmentId, signal)
        if (row) setEquipmentList((current) => mergeRecordsById(current, [row], (record) => record.gr_equipmentid))
        return row
    }, [getAccessToken, setEquipmentList])

    const loadEquipmentServicePlansForEditor = useCallback(async (equipmentId: string, signal?: AbortSignal) => {
        const rows = await fetchEquipmentServicePlansForEquipment(await getAccessToken(), [equipmentId], signal)
        setServicePlans((current) => mergeRecordsById(current, rows, (record) => record.gr_equipmentserviceplanid))
        return rows
    }, [getAccessToken])

    const prepareJobReferenceData = useCallback(async () => {
        if (referenceDataReadyRef.current && referenceDataValueRef.current) return referenceDataValueRef.current
        if (referenceDataRequestRef.current) return referenceDataRequestRef.current

        const request = (async () => {
            try {
                const data = await prepareJobEditorReferenceData()
                referenceDataValueRef.current = data
                referenceDataReadyRef.current = true
                return data
            } finally {
                referenceDataRequestRef.current = null
            }
        })()

        referenceDataRequestRef.current = request
        return request
    }, [prepareJobEditorReferenceData])

    const loadJobQuotes = useCallback(async (jobId: string, signal?: AbortSignal) => (
        fetchQuotesForJobApi(await getAccessToken(), jobId, signal)
    ), [getAccessToken])

    const loadJobAssignments = useCallback(async (jobId: string, signal?: AbortSignal) => (
        fetchJobAssignmentsForJobApi(await getAccessToken(), jobId, signal)
    ), [getAccessToken])

    useEffect(() => {
        if (editorReferenceDataValueRef.current) {
            editorReferenceDataValueRef.current = {
                ...editorReferenceDataValueRef.current,
                equipment: equipmentList,
                sites,
                customers,
                siteContacts,
                servicePlans,
            }
        }
        if (!referenceDataValueRef.current) return
        referenceDataValueRef.current = {
            ...referenceDataValueRef.current,
            equipment: equipmentList,
            sites,
            customers,
            siteContacts,
            servicePlans,
        }
    }, [customers, equipmentList, servicePlans, siteContacts, sites])

    const createEquipment = async (equipment: {
        fleet: string
        alternateFleet?: string
        serial: string
        make?: string
        model?: string
    }) => {
        const token = await getAccessToken()

        const equipmentId = await createEquipmentApi(token, equipment)

        const created = await fetchEquipmentByIdApi(token, equipmentId)
        if (created) setEquipmentList((current) => mergeRecordsById(current, [created], (record) => record.gr_equipmentid))

        return equipmentId
    }

    const updateEquipment = async (record: Equipment, input: EquipmentUpdateInput) => {
        setIsEquipmentSaving(true)
        setEquipmentSaveError('')
        try {
            const token = await getAccessToken()
            await updateEquipmentApi(token, record.gr_equipmentid, input)
            const selectedSite = sites.find((site) => site.gr_siteid === input.siteId)
            const updated = applyEquipmentUpdate(record, input, selectedSite)
            const recordPlans = servicePlans.filter((plan) =>
                plan._gr_equipment_value?.toLowerCase() === record.gr_equipmentid.toLowerCase())
            const syncedPlans = await syncEquipmentServiceProgramme(token, updated, recordPlans)
            setServicePlans((current) => [
                ...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()),
                ...syncedPlans,
            ])
            setEquipmentList((current) => current.map((item) =>
                item.gr_equipmentid === updated.gr_equipmentid ? updated : item))
            setJobs((current) => current.map((job) =>
                job.gr_Equipment?.gr_equipmentid === updated.gr_equipmentid
                    ? { ...job, gr_Equipment: updated }
                    : job))
            return updated
        } catch (error) {
            setEquipmentSaveError(error instanceof Error ? error.message : 'Equipment could not be saved.')
            throw error
        } finally {
            setIsEquipmentSaving(false)
        }
    }

    const setupEquipmentMaintenance = async (record: Equipment, input: EquipmentMaintenanceSetupInput) => {
        setIsEquipmentSaving(true)
        setEquipmentSaveError('')
        try {
            const updated: Equipment = {
                ...record,
                gr_powertype: input.powerType,
                gr_serviceprogramme: input.serviceProgramme,
                gr_maintenanceprofile: input.maintenanceProfile,
                gr_customaenabled: input.customAEnabled,
                gr_custombenabled: input.customBEnabled,
                gr_customcenabled: input.customCEnabled,
                gr_customaintervaldays: input.customAIntervalDays,
                gr_custombintervaldays: input.customBIntervalDays,
                gr_customcintervaldays: input.customCIntervalDays,
            }
            const configurationError = validateMaintenanceConfiguration(updated)
            if (configurationError) throw new Error(configurationError)

            const token = await getAccessToken()
            await updateEquipmentMaintenanceSetupApi(token, record.gr_equipmentid, input)
            const recordPlans = servicePlans.filter((plan) =>
                plan._gr_equipment_value?.toLowerCase() === record.gr_equipmentid.toLowerCase())
            const syncedPlans = await syncEquipmentServiceProgramme(token, updated, recordPlans)
            setServicePlans((current) => [
                ...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()),
                ...syncedPlans,
            ])
            setEquipmentList((current) => current.map((item) =>
                item.gr_equipmentid === updated.gr_equipmentid ? updated : item))
            setJobs((current) => current.map((job) =>
                job.gr_Equipment?.gr_equipmentid === updated.gr_equipmentid
                    ? { ...job, gr_Equipment: updated }
                    : job))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Equipment maintenance setup could not be saved.'
            setEquipmentSaveError(message)
            throw error
        } finally {
            setIsEquipmentSaving(false)
        }
    }

    const saveEquipmentMaintenanceHistory = async (
        record: Equipment,
        existingPlans: EquipmentServicePlan[],
        input: MaintenanceHistoryInput,
    ) => {
        setIsEquipmentSaving(true)
        setEquipmentSaveError('')
        try {
            const token = await getAccessToken()
            const updatedPlans = await saveEquipmentMaintenanceHistoryApi(
                token, record.gr_equipmentid, record, existingPlans, input)
            const updated = {
                ...record,
                gr_currenthourmeter: input.currentHourMeter,
                gr_currenthourmeterrecordeddate: input.readingRecordedDate,
            }
            setEquipmentList((current) => current.map((item) =>
                item.gr_equipmentid === updated.gr_equipmentid ? updated : item))
            setJobs((current) => current.map((job) =>
                job.gr_Equipment?.gr_equipmentid === updated.gr_equipmentid
                    ? { ...job, gr_Equipment: updated }
                    : job))
            setServicePlans((current) => {
                const updatedTypes = new Set(updatedPlans.map((plan) => plan.gr_servicetype))
                return [
                    ...current.filter((plan) =>
                        plan._gr_equipment_value?.toLowerCase() !== record.gr_equipmentid.toLowerCase()
                        || !updatedTypes.has(plan.gr_servicetype)),
                    ...updatedPlans,
                ]
            })
            return updated
        } catch (error) {
            setEquipmentSaveError(error instanceof Error ? error.message : 'Maintenance history could not be saved.')
            throw error
        } finally {
            setIsEquipmentSaving(false)
        }
    }

    const deleteEquipment = async (equipmentId: string) => {
        setIsEquipmentSaving(true)
        setEquipmentSaveError('')
        try {
            const token = await getAccessToken()
            await deleteEquipmentApi(token, equipmentId)
            setEquipmentList((current) => current.filter((item) => item.gr_equipmentid !== equipmentId))
            await fetchJobs()
        } catch (error) {
            setEquipmentSaveError(error instanceof Error ? error.message : 'Equipment could not be deleted.')
            throw error
        } finally {
            setIsEquipmentSaving(false)
        }
    }

    const createCustomer = async (customer: {
        name: string
    }) => {
        const token = await getAccessToken()

        const customerId = await createCustomerApi(token, customer)

        setCustomers((current) => mergeRecordsById(current, [{
            gr_customerid: customerId,
            gr_name: customer.name.trim(),
        }], (record) => record.gr_customerid))

        return customerId
    }

    const createSite = async (site: {
        customerId: string
        name: string
        address?: string
    }) => {
        const token = await getAccessToken()
        const siteId = await createSiteApi(token, site)

        const customer = customers.find((item) => item.gr_customerid.toLowerCase() === site.customerId.toLowerCase())
        setSites((current) => mergeRecordsById(current, [{
            gr_siteid: siteId,
            gr_name: site.name.trim(),
            gr_address: site.address?.trim() ?? '',
            gr_Customer: customer,
        }], (record) => record.gr_siteid))

        return siteId
    }

    const createContactForSite = async (contact: {
        siteId?: string
        name: string
        phone?: string
        email?: string
    }) => {
        const token = await getAccessToken()

        const contactId = await createContactApi(token, {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
        })

        if (contact.siteId) await createSiteContactApi(token, contact.siteId, contactId)

        if (contact.siteId) {
            const rows = await fetchSiteContactsForSiteApi(token, contact.siteId)
            setSiteContacts((current) => mergeRecordsById(current, rows, (record) => record.gr_sitecontactid))
        }

        return contactId
    }

    const fetchJobs = async () => {
        if (!loadGlobalOperationalData) {
            await onScopedDataChangedRef.current?.()
            return scopedJobsRef.current
        }
        const token = await getAccessToken()
        const jobs = await fetchJobsApi(token, { forceRefresh: true })
        setJobs(jobs)
        setJobsCacheStatus({ source: 'network', savedAt: Date.now(), refreshing: false })
        return jobs
    }

    const fetchJobForDrawer = useCallback(async (jobId: string, signal?: AbortSignal) => {
        const token = await getAccessToken()
        const refreshed = await fetchJobCoreApi(token, jobId, signal)
        if (!refreshed) return undefined
        setJobs((current) => current.some((job) => job.gr_jobid.toLowerCase() === jobId.toLowerCase())
            ? current.map((job) => job.gr_jobid.toLowerCase() === jobId.toLowerCase() ? { ...job, ...refreshed } : job)
            : [...current, refreshed])
        if (refreshed.gr_Equipment) {
            setEquipmentList((current) => mergeRecordsById(current, [refreshed.gr_Equipment!], (record) => record.gr_equipmentid))
        }
        if (refreshed.gr_Site) {
            setSites((current) => mergeRecordsById(current, [refreshed.gr_Site!], (record) => record.gr_siteid))
        }
        if (refreshed.gr_Site?.gr_Customer) {
            setCustomers((current) => mergeRecordsById(current, [refreshed.gr_Site!.gr_Customer!], (record) => record.gr_customerid))
        }
        return refreshed
    }, [getAccessToken, setEquipmentList, setJobs])

    const loadJobOfficeUpdatesForEditor = useCallback(async (jobId: string, signal?: AbortSignal) => {
        const rows = await fetchJobOfficeUpdatesForJobsApi(await getAccessToken(), [jobId], signal)
        setOfficeUpdates((current) => [
            ...current.filter((update) => update.jobId.toLowerCase() !== jobId.toLowerCase()),
            ...rows,
        ])
        return rows
    }, [getAccessToken])

    const fetchJobCardDetails = useCallback(async (jobId: string, signal?: AbortSignal) => {
        const token = await getAccessToken()
        return fetchJobCardDetailsApi(token, jobId, signal)
    }, [getAccessToken])

    const fetchJobPhotoBody = useCallback(async (photoId: string, signal?: AbortSignal) => {
        const token = await getAccessToken()
        return fetchJobPhotoBodyApi(token, photoId, signal)
    }, [getAccessToken])

    const fetchScheduleOptions = async () => {
        if (hasScopedScheduleOptions) {
            await onScopedDataChangedRef.current?.()
            return scopedScheduleOptionsRef.current
        }
        if (!loadGlobalOperationalData) return []
        const token = await getAccessToken()
        const options = await fetchJobScheduleOptionsApi(token)
        setScheduleOptions(options)
        return options
    }

    const assertJobOperational = async (token: string, jobId: string) => {
        let job = jobs.find((candidate) => candidate.gr_jobid.toLowerCase() === jobId.toLowerCase())
        if (!job) {
            if (loadGlobalOperationalData) {
                const refreshedJobs = await fetchJobsApi(token)
                setJobs(refreshedJobs)
                job = refreshedJobs.find((candidate) => candidate.gr_jobid.toLowerCase() === jobId.toLowerCase())
            } else {
                job = await fetchJobCoreApi(token, jobId)
                if (job) setJobs((current) => current.some((candidate) => candidate.gr_jobid === jobId)
                    ? current.map((candidate) => candidate.gr_jobid === jobId ? job! : candidate)
                    : [...current, job!])
            }
        }
        if (!job) throw new Error('The job could not be found. Refresh the page and try again.')
        if (!jobIsOperational(job.gr_status)) throw new Error(UNCONFIRMED_OPERATION_MESSAGE)
        return job
    }

    const assertJobSchedulerEligible = async (token: string, jobId: string) => {
        const job = await assertJobOperational(token, jobId)
        if (!jobIsSchedulerEligible(job)) throw new Error(SITE_CHECK_SCHEDULER_MESSAGE)
        return job
    }

    const prepareJobForUnconfirmed = async (token: string, job: Job) => {
        const options = scheduleOptions.filter((option) => option._gr_job_value?.toLowerCase() === job.gr_jobid.toLowerCase())
        const assignments = await fetchJobAssignmentsForJobApi(token, job.gr_jobid)
        if (!job.gr_Mechanic && options.length === 0 && assignments.length === 0) return

        const confirmed = window.confirm(
            'Move this job to Unconfirmed?\n\n'
            + 'It is already allocated or scheduled. Continuing will remove its technician allocation, '
            + 'additional assignments, and schedule options.',
        )
        if (!confirmed) throw new Error('The status change was cancelled.')

        await Promise.all([
            ...options.map((option) => deleteJobScheduleOptionApi(token, option.gr_jobscheduleoptionid)),
            ...assignments.map((assignment) => deleteJobAssignmentApi(token, assignment.gr_jobassignmentid)),
            ...(job.gr_Mechanic
                ? [updateJobFieldsApi(token, job.gr_jobid, { 'gr_Mechanic@odata.bind': null })]
                : []),
        ])
        setScheduleOptions((current) => current.filter((option) => option._gr_job_value?.toLowerCase() !== job.gr_jobid.toLowerCase()))
    }

    const createScheduleOption = async (option: JobScheduleOptionInput) => {
        const token = await getAccessToken()
        await assertJobSchedulerEligible(token, option.jobId)

        if (option.confirmed) {
            const currentlyConfirmed = scheduleOptions.filter(
                (currentOption) =>
                    currentOption._gr_job_value?.toLowerCase() === option.jobId.toLowerCase()
                    && currentOption.gr_confirmed,
            )

            await Promise.all(currentlyConfirmed.map((currentOption) =>
                updateJobScheduleConfirmationApi(
                    token,
                    currentOption.gr_jobscheduleoptionid,
                    false,
                ),
            ))
        }

        await createJobScheduleOptionApi(token, option)
        await fetchScheduleOptions()
    }

    const confirmScheduleOption = async (jobId: string, optionId: string) => {
        const token = await getAccessToken()
        await assertJobSchedulerEligible(token, jobId)
        const optionsForJob = scheduleOptions.filter(
            (option) => option._gr_job_value?.toLowerCase() === jobId.toLowerCase(),
        )

        await Promise.all(optionsForJob.map((option) =>
            updateJobScheduleConfirmationApi(
                token,
                option.gr_jobscheduleoptionid,
                option.gr_jobscheduleoptionid === optionId,
            ),
        ))

        await fetchScheduleOptions()
    }

    const updateScheduleOption = async (
        optionId: string,
        option: JobScheduleOptionInput,
    ) => {
        const token = await getAccessToken()
        await assertJobSchedulerEligible(token, option.jobId)
        await updateJobScheduleOptionApi(token, optionId, option)
        await fetchScheduleOptions()
    }

    const deleteScheduleOption = async (optionId: string) => {
        const token = await getAccessToken()
        await deleteJobScheduleOptionApi(token, optionId)
        await fetchScheduleOptions()
    }

    const fetchEquipment = async () => {
        if (!loadGlobalOperationalData) {
            await onScopedDataChangedRef.current?.()
            return
        }
        const token = await getAccessToken()
        const equipment = await fetchEquipmentApi(token)
        setEquipmentList(equipment)
    }

    const prepareScopedCompletionContext = async (job: Job, equipmentIdOverride?: string) => {
        if (loadGlobalOperationalData) return
        const equipmentId = equipmentIdOverride || job.gr_Equipment?.gr_equipmentid
        if (!equipmentId) return

        const token = await getAccessToken()
        const [equipmentJobs, completionEquipment, equipmentPlans] = await Promise.all([
            fetchEquipmentJobsApi(token, equipmentId),
            fetchEquipmentByIdApi(token, equipmentId),
            fetchEquipmentServicePlansForEquipment(token, [equipmentId]),
        ])

        setJobs((current) => {
            const merged = new Map(current.map((item) => [item.gr_jobid.toLowerCase(), item]))
            equipmentJobs.forEach((item) => merged.set(item.gr_jobid.toLowerCase(), item))
            return [...merged.values()]
        })
        if (completionEquipment) {
            setEquipmentList((current) => {
                const merged = new Map(current.map((item) => [item.gr_equipmentid.toLowerCase(), item]))
                merged.set(completionEquipment.gr_equipmentid.toLowerCase(), completionEquipment)
                return [...merged.values()]
            })
        }
        setServicePlans((current) => [
            ...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== equipmentId.toLowerCase()),
            ...equipmentPlans,
        ])
    }

    const fetchJobOfficeUpdates = async () => {
        if (hasScopedOfficeUpdates) {
            await onScopedDataChangedRef.current?.()
            return scopedOfficeUpdatesRef.current
        }
        if (!loadGlobalOperationalData) return []
        const token = await getAccessToken()
        const updates = await fetchJobOfficeUpdatesApi(token)
        setOfficeUpdates(updates)
    }

    const createJobOfficeUpdate = async (input: { jobId: string; jobNumber?: string | null; text: string }) => {
        const token = await getAccessToken()
        const created = await createJobOfficeUpdateApi(token, input)
        setOfficeUpdates((current) => [created, ...current])
        return created
    }

    const updateJobOfficeAttention = async (jobId: string, officeAttentionRequired: boolean) => {
        const token = await getAccessToken()
        await updateJobOfficeAttentionApi(token, jobId, officeAttentionRequired)
        setJobs((current) => current.map((job) => job.gr_jobid === jobId
            ? { ...job, gr_officeattentionrequired: officeAttentionRequired }
            : job))
    }

    const updateJobStatus = async (jobId: string, status: JobStatus) => {
        const currentJob = jobs.find((job) => job.gr_jobid === jobId)
        if (!currentJob) throw new Error('The job could not be found. Refresh the page and try again.')
        const isCompleting = status === JOB_STATUSES.COMPLETE && currentJob.gr_status !== JOB_STATUSES.COMPLETE
        const completionKind = getJobCompletionKind(currentJob.gr_jobtype)
        if (isCompleting) {
            await prepareScopedCompletionContext(currentJob)
        }
        if (isCompleting && completionKind === 'service') {
            const contextError = validateServiceCompletionContext(currentJob)
            if (contextError) throw new Error(contextError)
            setCompletionError('')
            setCompletionRequest({ kind: 'service', job: currentJob })
            return false
        }
        if (isCompleting && completionKind === 'wof') {
            if (!currentJob.gr_Equipment?.gr_equipmentid) throw new Error('Select Equipment before completing this WOF Job.')
            setCompletionError('')
            setCompletionRequest({ kind: 'wof', job: currentJob })
            return false
        }
        if (isCompleting) {
            const contextError = validateEquipmentCompletionContext(currentJob)
            if (contextError) throw new Error(contextError)
            setCompletionError('')
            setCompletionRequest({ kind: 'standard', job: currentJob })
            return false
        }
        const token = await getAccessToken()
        if (currentJob._gr_sitecheck_value) {
            const result = await updateSiteCheckJobStatus(token, { jobId, status })
            await fetchJobs()
            if (result) {
                window.dispatchEvent(new CustomEvent('site-checks-changed'))
            }
            return true
        }
        if (status === JOB_STATUSES.UNCONFIRMED && currentJob.gr_status !== JOB_STATUSES.UNCONFIRMED) {
            await prepareJobForUnconfirmed(token, currentJob)
        }
        const completedDate = currentJob?.gr_completeddate ?? new Date().toISOString()
        await updateJobStatusApi(token, jobId, status, isCompleting ? completedDate : undefined)
        setJobs((current) => current.map((job) => job.gr_jobid === jobId
            ? { ...job, gr_status: status, gr_completeddate: isCompleting ? completedDate : job.gr_completeddate }
            : job))
        return true
    }

    const createJobAssignment = async (assignment: JobAssignmentInput) => {
        const token = await getAccessToken()
        await assertJobOperational(token, assignment.jobId)
        await createJobAssignmentApi(token, assignment)
    }

    const updateJobAssignmentStatus = async (
        assignmentId: string,
        status: JobCardStatus,
    ) => {
        const token = await getAccessToken()
        await updateJobAssignmentStatusApi(token, assignmentId, status)
    }

    const sendPrimaryJobEmail = async (job: Job) => {
        assertJobEmailSendingAllowed(window.location.hostname)
        assertJobHasEmailableJobNumber(job)
        if (!isValidTechnicianEmail(job.gr_Mechanic?.gr_email)) {
            throw new Error('The primary technician needs an email address before the job can be sent.')
        }
        const token = await getAccessToken()
        const submissionUrl = onlineJobCardPilotEnabled(job.gr_Mechanic?.gr_email)
            ? (await generateJobSubmissionLink(token, {
                jobId: job.gr_jobid,
                mechanicId: job.gr_Mechanic?.gr_mechanicid,
                recipientName: job.gr_Mechanic?.gr_name ?? 'Technician',
                recipientEmail: job.gr_Mechanic?.gr_email ?? '',
            })).url
            : ''
        const email = buildPrimaryJobEmail(job, submissionUrl)
        const dispatchId = await createEmailDispatch(token, {
            jobId: job.gr_jobid,
            ...email,
        })
        await waitForEmailDispatch(token, dispatchId)
        await updateJobCardStatusApi(token, job.gr_jobid, JOB_CARD_STATUSES.SENT)
        await fetchJobs()
    }

    const queuePrimaryJobEmail = async (job: Job, draft: JobEmailDraft) => {
        assertJobEmailSendingAllowed(window.location.hostname)
        assertJobHasEmailableJobNumber(job)
        if (!isValidTechnicianEmail(draft.recipientEmail)) {
            throw new Error('Enter a valid technician email address before sending.')
        }
        if (!draft.subject.trim()) throw new Error('Enter an email subject before sending.')
        setEmailDeliveryStates((current) => ({
            ...current,
            [job.gr_jobid]: { status: 'sending', message: 'Job Card email is being sent.' },
        }))
        try {
            const token = await getAccessToken()
            const submissionUrl = onlineJobCardPilotEnabled(draft.recipientEmail)
                ? (await generateJobSubmissionLink(token, {
                    jobId: job.gr_jobid,
                    mechanicId: job.gr_Mechanic?.gr_mechanicid,
                    recipientName: job.gr_Mechanic?.gr_name ?? 'Technician',
                    recipientEmail: draft.recipientEmail,
                })).url
                : ''
            const email = buildPrimaryJobEmail(job, submissionUrl, draft)
            const dispatchId = await createEmailDispatch(token, { jobId: job.gr_jobid, ...email })
            void (async () => {
                try {
                    await waitForEmailDispatch(token, dispatchId)
                    await updateJobCardStatusApi(token, job.gr_jobid, JOB_CARD_STATUSES.SENT)
                    setEmailDeliveryStates((current) => ({
                        ...current,
                        [job.gr_jobid]: { status: 'sent', message: 'Job Card email sent.' },
                    }))
                    await fetchJobs()
                } catch (deliveryError) {
                    setEmailDeliveryStates((current) => ({
                        ...current,
                        [job.gr_jobid]: {
                            status: 'failed',
                            message: deliveryError instanceof Error ? deliveryError.message : 'Job Card email delivery failed.',
                        },
                    }))
                }
            })()
        } catch (queueError) {
            setEmailDeliveryStates((current) => ({
                ...current,
                [job.gr_jobid]: {
                    status: 'failed',
                    message: queueError instanceof Error ? queueError.message : 'Job Card email could not be queued.',
                },
            }))
            throw queueError
        }
    }

    const sendAssignmentJobEmail = async (job: Job, assignment: JobAssignment) => {
        assertJobEmailSendingAllowed(window.location.hostname)
        assertJobHasEmailableJobNumber(job)
        if (!isValidTechnicianEmail(assignment.gr_Mechanic?.gr_email)) {
            throw new Error('This technician needs an email address before the job can be sent.')
        }
        const token = await getAccessToken()
        const submissionUrl = onlineJobCardPilotEnabled(assignment.gr_Mechanic?.gr_email)
            ? (await generateJobSubmissionLink(token, {
                jobId: job.gr_jobid,
                mechanicId: assignment.gr_Mechanic?.gr_mechanicid,
                assignmentId: assignment.gr_jobassignmentid,
                recipientName: assignment.gr_Mechanic?.gr_name ?? 'Technician',
                recipientEmail: assignment.gr_Mechanic?.gr_email ?? '',
            })).url
            : ''
        const email = buildAssignmentJobEmail(job, assignment, submissionUrl)
        const dispatchId = await createEmailDispatch(token, {
            jobId: job.gr_jobid,
            assignmentId: assignment.gr_jobassignmentid,
            ...email,
        })
        await waitForEmailDispatch(token, dispatchId)
        await updateJobAssignmentStatusApi(
            token,
            assignment.gr_jobassignmentid,
            JOB_CARD_STATUSES.SENT,
        )
    }

    const deleteJobAssignment = async (assignmentId: string) => {
        const token = await getAccessToken()
        await deleteJobAssignmentApi(token, assignmentId)
    }

    const updateJobCardStatus = async (jobId: string, status: JobCardStatus) => {
        const token = await getAccessToken()
        await updateJobCardStatusApi(token, jobId, status)
        await fetchJobs()
    }

    const updateJobFields = async (
        jobId: string,
        fields: {
            gr_jobnumber?: string
            gr_description?: string
            gr_ordernumber?: string
            'gr_Mechanic@odata.bind'?: string | null
        }
    ) => {
        const token = await getAccessToken()
        if (fields['gr_Mechanic@odata.bind']) await assertJobOperational(token, jobId)

        await updateJobFieldsApi(token, jobId, fields)

        await fetchJobs()
    }

    const allocateJobNumbers = async (allocations: readonly { job: Job; jobNumber: string }[]) => {
        const token = await getAccessToken()
        await allocateJobNumbersApi(token, allocations)
        await fetchJobs()
    }

    const updateJob = async (jobId: string, job: JobSaveInput) => {
        const currentJob = jobs.find((item) => item.gr_jobid === jobId)
        if (!currentJob) throw new Error('The job could not be found. Refresh the page and try again.')
        const isCompleting = job.status === JOB_STATUSES.COMPLETE && currentJob.gr_status !== JOB_STATUSES.COMPLETE
        const completionKind = getJobCompletionKind(job.jobType)
        if (isCompleting) {
            await prepareScopedCompletionContext(currentJob, job.equipmentId)
        }
        if (isCompleting && completionKind === 'service') {
            const contextError = validateServiceCompletionContext(currentJob, job)
            if (contextError) throw new Error(contextError)
            setCompletionError('')
            setCompletionRequest({ kind: 'service', job: currentJob, pendingSave: job })
            return false
        }
        if (isCompleting && completionKind === 'wof') {
            if (!job.equipmentId) throw new Error('Select Equipment before completing this WOF Job.')
            setCompletionError('')
            setCompletionRequest({ kind: 'wof', job: currentJob, pendingSave: job })
            return false
        }
        if (isCompleting) {
            const contextError = validateEquipmentCompletionContext(currentJob, job)
            if (contextError) throw new Error(contextError)
            setCompletionError('')
            setCompletionRequest({ kind: 'standard', job: currentJob, pendingSave: job })
            return false
        }
        const token = await getAccessToken()
        if (currentJob._gr_sitecheck_value) {
            const completedDate = job.completedDate || (isCompleting ? new Date().toISOString() : undefined)
            const result = await updateSiteCheckJobStatus(token, {
                jobId,
                status: job.status,
                pendingSave: { ...job, completedDate },
                completedOn: completedDate,
            })
            await fetchJobs()
            if (result) {
                window.dispatchEvent(new CustomEvent('site-checks-changed'))
            }
            return true
        }
        if (job.status === JOB_STATUSES.UNCONFIRMED && currentJob.gr_status !== JOB_STATUSES.UNCONFIRMED) {
            await prepareJobForUnconfirmed(token, currentJob)
            job = { ...job, mechanicId: undefined }
        }
        if (job.status === JOB_STATUSES.UNCONFIRMED && job.mechanicId) {
            throw new Error(UNCONFIRMED_OPERATION_MESSAGE)
        }
        const completedDate = job.completedDate || (isCompleting ? new Date().toISOString() : undefined)
        const jobWithCompletion = { ...job, completedDate }
        await updateJobApi(token, jobId, jobWithCompletion)

        if (job.equipmentId && job.siteId) {
            await updateEquipmentSite(token, job.equipmentId, job.siteId)
            await fetchEquipment()
        }

        const selectedEquipment = equipmentList.find(
            (equipment) => equipment.gr_equipmentid === job.equipmentId,
        )
        const selectedMechanic = mechanics.find(
            (mechanic) => mechanic.gr_mechanicid === job.mechanicId,
        )
        const selectedSite = sites.find(
            (site) => site.gr_siteid === job.siteId,
        )
        const selectedContact = siteContacts.find(
            (siteContact) => siteContact.gr_Contact?.gr_contactid === job.contactId,
        )?.gr_Contact

        setJobs((currentJobs) => currentJobs.map((currentJob) =>
            currentJob.gr_jobid === jobId
                ? {
                    ...currentJob,
                    gr_jobnumber: job.jobNumber,
                    gr_ordernumber: job.orderNumber,
                    gr_description: job.description,
                    gr_jobtype: job.jobType,
                    gr_status: job.status,
                    gr_servicetype: job.serviceType,
                    gr_hourmeter: job.hourMeter ?? currentJob.gr_hourmeter ?? null,
                    gr_hourmeterreadingtype: job.hourMeterReadingType ?? currentJob.gr_hourmeterreadingtype ?? null,
                    gr_hourmeterrecordeddate: job.hourMeterRecordedDate ?? currentJob.gr_hourmeterrecordeddate ?? null,
                    gr_completeddate: completedDate ?? currentJob.gr_completeddate ?? null,
                    gr_currentofficeaction: job.currentOfficeAction ?? currentJob.gr_currentofficeaction ?? null,
                    gr_officeactionowner: job.officeActionOwner?.trim() || null,
                    gr_officeattentionrequired: job.officeAttentionRequired === true,
                    gr_Equipment: selectedEquipment,
                    gr_Mechanic: selectedMechanic,
                    gr_Site: selectedSite,
                    gr_Contact: selectedContact,
                }
                : currentJob,
        ))
        return true
    }

    const cancelJobCompletion = () => {
        if (isCompletingJob) return
        setCompletionRequest(null)
        setCompletionError('')
    }

    const reconcileCompletionData = async (
        equipmentId: string,
        equipmentJobs: Job[] | undefined,
        completedJob: Job | undefined,
        completedEquipment: Equipment | undefined,
        equipmentPlans: EquipmentServicePlan[] | undefined,
    ) => {
        if (!loadGlobalOperationalData && equipmentJobs) {
            const equipmentJobIds = new Set(equipmentJobs.map((job) => job.gr_jobid.toLowerCase()))
            setJobs((current) => [
                ...current.filter((job) => !equipmentJobIds.has(job.gr_jobid.toLowerCase())),
                ...equipmentJobs,
            ])
        } else if (completedJob) {
            setJobs((current) => current.some((job) => job.gr_jobid.toLowerCase() === completedJob.gr_jobid.toLowerCase())
                ? current.map((job) => job.gr_jobid.toLowerCase() === completedJob.gr_jobid.toLowerCase()
                    ? { ...job, ...completedJob }
                    : job)
                : [...current, completedJob])
        }
        if (completedEquipment) {
            setEquipmentList((current) => current.some((item) => item.gr_equipmentid.toLowerCase() === equipmentId.toLowerCase())
                ? current.map((item) => item.gr_equipmentid.toLowerCase() === equipmentId.toLowerCase()
                    ? { ...item, ...completedEquipment }
                    : item)
                : [...current, completedEquipment])
        }
        if (equipmentPlans) {
            setServicePlans((current) => [
                ...current.filter((plan) => plan._gr_equipment_value?.toLowerCase() !== equipmentId.toLowerCase()),
                ...equipmentPlans,
            ])
        }
        if (!loadGlobalOperationalData) {
            await onScopedDataChangedRef.current?.()
        }
    }

    const refreshCompletionDataAndServiceDates = async (token: string, equipmentId: string, jobId: string) => {
        const [equipmentJobs, completedJob, completedEquipment, equipmentPlans] = await Promise.all([
            fetchEquipmentJobsApi(token, equipmentId),
            fetchJobCoreApi(token, jobId),
            fetchEquipmentByIdApi(token, equipmentId),
            fetchEquipmentServicePlansForEquipment(token, [equipmentId]),
        ])
        const refreshedPlans = completedEquipment
            ? await refreshEquipmentServicePlanDueDates(token, completedEquipment, equipmentPlans, equipmentJobs)
            : equipmentPlans
        await reconcileCompletionData(
            equipmentId,
            equipmentJobs,
            completedJob,
            completedEquipment,
            refreshedPlans,
        )
    }

    const recoverCompletionData = async (token: string, equipmentId: string, jobId: string) => {
        const [jobsResult, jobResult, equipmentResult, plansResult] = await Promise.allSettled([
            fetchEquipmentJobsApi(token, equipmentId),
            fetchJobCoreApi(token, jobId),
            fetchEquipmentByIdApi(token, equipmentId),
            fetchEquipmentServicePlansForEquipment(token, [equipmentId]),
        ])
        await reconcileCompletionData(
            equipmentId,
            jobsResult.status === 'fulfilled' ? jobsResult.value : undefined,
            jobResult.status === 'fulfilled' ? jobResult.value : undefined,
            equipmentResult.status === 'fulfilled' ? equipmentResult.value : undefined,
            plansResult.status === 'fulfilled' ? plansResult.value : undefined,
        )
    }

    const completeStandardJob = async (
        hourMeter: number,
        hourMeterReadingType: HourMeterReadingType,
        hourMeterRecordedDate: string,
        completionDate: string,
    ) => {
        const request = completionRequest
        if (!request || request.kind !== 'standard') return
        const equipment = resolveCompletionEquipment(request, equipmentList)
        const latestHourMeterReading = equipment ? resolveLatestHourMeterReading(equipment, jobs) : null
        const currentHourMeter = latestHourMeterReading?.hours ?? 0
        const currentHourMeterRecordedDate = latestHourMeterReading?.date ?? null
        const validationError = validateJobCompletionDate(completionDate)
            || validateHourMeterRecordedDate(hourMeterRecordedDate)
            || validateCompletionHourMeter(String(hourMeter), currentHourMeter, hourMeterRecordedDate, currentHourMeterRecordedDate)
        if (validationError) {
            setCompletionError(validationError)
            return
        }
        if (!equipment) {
            setCompletionError(validateEquipmentCompletionContext(request.job, request.pendingSave))
            return
        }

        setIsCompletingJob(true)
        setCompletionError('')
        try {
            const token = await getAccessToken()
            const completionTimestamp = jobCompletionDateTime(completionDate)
            await updateEquipmentCurrentHourMeter(token, equipment.gr_equipmentid, hourMeter, hourMeterRecordedDate, currentHourMeterRecordedDate)
            if (request.job._gr_sitecheck_value) {
                const result = await updateSiteCheckJobStatus(token, {
                    jobId: request.job.gr_jobid,
                    status: JOB_STATUSES.COMPLETE,
                    pendingSave: request.pendingSave
                        ? { ...request.pendingSave, hourMeter, hourMeterReadingType, hourMeterRecordedDate, completedDate: completionTimestamp }
                        : undefined,
                    completedOn: completionTimestamp,
                    hourMeter,
                    hourMeterReadingType,
                    hourMeterRecordedDate,
                })
                if (result) window.dispatchEvent(new CustomEvent('site-checks-changed'))
            } else if (request.pendingSave) {
                await updateJobApi(token, request.job.gr_jobid, {
                    ...request.pendingSave,
                    status: JOB_STATUSES.COMPLETE,
                    hourMeter,
                    hourMeterReadingType,
                    hourMeterRecordedDate,
                    completedDate: completionTimestamp,
                })
            } else {
                await updateJobStatusApi(token, request.job.gr_jobid, JOB_STATUSES.COMPLETE, completionTimestamp, hourMeter, hourMeterReadingType, hourMeterRecordedDate)
            }
            await refreshCompletionDataAndServiceDates(token, equipment.gr_equipmentid, request.job.gr_jobid)
            setCompletionRequest(null)
        } catch (error) {
            try {
                const token = await getAccessToken()
                await recoverCompletionData(token, equipment.gr_equipmentid, request.job.gr_jobid)
            } catch {
                // Keep the completion dialog open with the original error when refresh is unavailable.
            }
            setCompletionError(`${error instanceof Error ? error.message : 'The Job could not be completed.'} Refresh before retrying if the hour reading was already saved.`)
        } finally {
            setIsCompletingJob(false)
        }
    }

    const completeServiceJob = async (
        hourMeter: number,
        hourMeterReadingType: HourMeterReadingType,
        hourMeterRecordedDate: string,
        completionDate: string,
    ) => {
        const request = completionRequest
        if (!request || request.kind !== 'service') return
        const equipment = resolveCompletionEquipment(request, equipmentList)
        const serviceType = resolveCompletionServiceType(request)
        const latestHourMeterReading = equipment ? resolveLatestHourMeterReading(equipment, jobs) : null
        const currentHourMeter = latestHourMeterReading?.hours ?? 0
        const currentHourMeterRecordedDate = latestHourMeterReading?.date ?? null
        const validationError = validateJobCompletionDate(completionDate)
            || validateHourMeterRecordedDate(hourMeterRecordedDate)
            || validateCompletionHourMeter(String(hourMeter), currentHourMeter, hourMeterRecordedDate, currentHourMeterRecordedDate)
        if (validationError) {
            setCompletionError(validationError)
            return
        }
        if (!equipment || !serviceType) {
            setCompletionError(validateServiceCompletionContext(request.job, request.pendingSave))
            return
        }

        setIsCompletingJob(true)
        setCompletionError('')
        try {
            const token = await getAccessToken()
            await completeServiceJobAtomically(token, {
                jobId: request.job.gr_jobid,
                equipmentId: equipment.gr_equipmentid,
                hourMeter,
                hourMeterReadingType,
                hourMeterRecordedDate,
                currentHourMeterRecordedDateHint: currentHourMeterRecordedDate,
                currentHourMeterHint: currentHourMeter,
                completedDate: jobCompletionDateTime(completionDate),
                expectedServiceType: serviceType,
                pendingSave: request.pendingSave,
            })

            await refreshCompletionDataAndServiceDates(token, equipment.gr_equipmentid, request.job.gr_jobid)
            setCompletionRequest(null)
        } catch (error) {
            try {
                const token = await getAccessToken()
                await recoverCompletionData(token, equipment.gr_equipmentid, request.job.gr_jobid)
            } catch {
                // Keep the completion dialog open with the original error when refresh is unavailable.
            }
            setCompletionError(error instanceof Error ? error.message : 'The Service Job could not be completed.')
        } finally {
            setIsCompletingJob(false)
        }
    }

    const completeWofJob = async (
        newExpiry: string,
        hourMeter: number,
        hourMeterReadingType: HourMeterReadingType,
        hourMeterRecordedDate: string,
        completionDate: string,
    ) => {
        const request = completionRequest
        if (!request || request.kind !== 'wof') return
        const equipment = resolveCompletionEquipment(request, equipmentList)
        const completionTimestamp = jobCompletionDateTime(completionDate)
        const validationError = validateJobCompletionDate(completionDate) || validateWofCompletionExpiry(
            newExpiry,
            equipment?.gr_currentwofexpiry,
            completionTimestamp,
        )
        if (validationError) {
            setCompletionError(validationError)
            return
        }
        if (!equipment) {
            setCompletionError('The linked Equipment could not be loaded. The Job was not completed.')
            return
        }
        const latestHourMeterReading = resolveLatestHourMeterReading(equipment, jobs)
        const currentHourMeter = latestHourMeterReading?.hours ?? 0
        const currentHourMeterRecordedDate = latestHourMeterReading?.date ?? null
        const hourMeterError = validateHourMeterRecordedDate(hourMeterRecordedDate)
            || validateCompletionHourMeter(String(hourMeter), currentHourMeter, hourMeterRecordedDate, currentHourMeterRecordedDate)
        if (hourMeterError) {
            setCompletionError(hourMeterError)
            return
        }

        setIsCompletingJob(true)
        setCompletionError('')
        try {
            const token = await getAccessToken()
            await runWofCompletion(
                () => updateWofExpiryForCompletion(token, {
                    jobId: request.job.gr_jobid,
                    equipmentId: equipment.gr_equipmentid,
                    newExpiry,
                    completionDate: completionTimestamp,
                }),
                () => updateEquipmentCurrentHourMeter(token, equipment.gr_equipmentid, hourMeter, hourMeterRecordedDate, currentHourMeterRecordedDate),
                () => request.pendingSave
                    ? updateJobApi(token, request.job.gr_jobid, {
                        ...request.pendingSave,
                        hourMeter,
                        hourMeterReadingType,
                        hourMeterRecordedDate,
                        completedDate: completionTimestamp,
                    })
                    : updateJobStatusApi(token, request.job.gr_jobid, JOB_STATUSES.COMPLETE, completionTimestamp, hourMeter, hourMeterReadingType, hourMeterRecordedDate),
            )
            await refreshCompletionDataAndServiceDates(token, equipment.gr_equipmentid, request.job.gr_jobid)
            setCompletionRequest(null)
        } catch (error) {
            try {
                const token = await getAccessToken()
                await recoverCompletionData(token, equipment.gr_equipmentid, request.job.gr_jobid)
            } catch {
                // Keep the completion dialog open with the original error when recovery is unavailable.
            }
            setCompletionError(`${error instanceof Error ? error.message : 'The WOF Job could not be completed.'} Refresh before retrying if the expiry or hour reading was already saved.`)
        } finally {
            setIsCompletingJob(false)
        }
    }

    const createJob = async (job: JobSaveInput) => {
        if (job.status === JOB_STATUSES.UNCONFIRMED && job.mechanicId) {
            throw new Error(UNCONFIRMED_OPERATION_MESSAGE)
        }
        const token = await getAccessToken()

        const jobId = await createJobApi(token, job)

        if (job.equipmentId && job.siteId) {
            try {
                await updateEquipmentSite(
                    token,
                    job.equipmentId,
                    job.siteId
                )
                await fetchEquipment()
            } catch (error) {
                console.error('Failed to update equipment site:', error)
            }
        }

        await fetchJobs()
        return jobId
    }

    const deleteJob = async (jobId: string) => {
        const token = await getAccessToken()
        await deleteJobApi(token, jobId)
        setJobs((currentJobs) => currentJobs.filter((job) => job.gr_jobid !== jobId))
    }

    useEffect(() => {
        if (!account) return

        let cancelled = false
        let deviceSnapshotRestored = false

        const loadInitialData = async () => {
            referenceDataRequestRef.current = null
            referenceDataValueRef.current = null
            referenceDataReadyRef.current = false
            editorReferenceDataValueRef.current = null
            setReferenceDataStatus('idle')
            setReferenceDataError('')
            if (loadGlobalOperationalData) setSites([])
            setCustomers([])
            setSiteContacts([])
            if (loadGlobalOperationalData) setServicePlans([])
            setIsLoading(loadGlobalOperationalData && !hasSharedJobsRef.current)
            setLoadError('')

            try {
                const token = await acquireDataverseAccessToken(instance, account)
                const [
                    initialJobs,
                    initialScheduleOptions,
                    initialOfficeUpdates,
                ] = await Promise.all([
                    loadGlobalOperationalData ? fetchJobsApi(token, {
                        useDeviceCache: true,
                        onDeviceSnapshot: (rows, savedAt) => {
                            deviceSnapshotRestored = true
                            if (!cancelled) {
                                setJobs(rows)
                                setIsLoading(false)
                                setJobsCacheStatus({ source: 'device', savedAt, refreshing: true })
                            }
                        },
                        onBackgroundRefresh: (rows, refreshedAt) => {
                            if (!cancelled) {
                                setJobs(rows)
                                setJobsCacheStatus({ source: 'network', savedAt: refreshedAt, refreshing: false })
                            }
                        },
                        onBackgroundRefreshError: () => {
                            if (!cancelled) setJobsCacheStatus((current) => current ? { ...current, refreshing: false } : current)
                        },
                    }) : Promise.resolve(scopedJobsRef.current),
                    hasScopedScheduleOptions
                        ? Promise.resolve(scopedScheduleOptionsRef.current)
                        : loadGlobalOperationalData
                            ? fetchJobScheduleOptionsApi(token)
                            : Promise.resolve([]),
                    hasScopedOfficeUpdates
                        ? Promise.resolve(scopedOfficeUpdatesRef.current)
                        : loadGlobalOperationalData
                            ? fetchJobOfficeUpdatesApi(token)
                            : Promise.resolve([]),
                ])

                if (cancelled) return

                if (loadGlobalOperationalData) setJobs(initialJobs)
                if (!hasScopedScheduleOptions) setScheduleOptions(initialScheduleOptions)
                if (!hasScopedOfficeUpdates) setOfficeUpdates(initialOfficeUpdates)
            } catch (error) {
                if (cancelled) return

                console.error('Failed to load Dataverse data:', error)
                if (!deviceSnapshotRestored) {
                    setLoadError(error instanceof Error
                        ? error.message
                        : 'Dataverse data could not be loaded.')
                } else {
                    setJobsCacheStatus((current) => current ? { ...current, refreshing: false } : current)
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        void loadInitialData()

        return () => {
            cancelled = true
        }
    }, [account, hasScopedOfficeUpdates, hasScopedScheduleOptions, instance, loadGlobalOperationalData, reloadKey, setEquipmentList, setJobs])

    useEffect(() => {
        if (!account || !loadGlobalOperationalData) return

        let cancelled = false
        let refreshTimer: number | undefined
        const refreshJobs = () => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(async () => {
                if (cancelled) return
                setJobsCacheStatus((current) => current ? { ...current, refreshing: true } : current)
                try {
                    const rows = await fetchJobsApi(await getAccessToken(), { forceRefresh: true })
                    if (!cancelled) {
                        setJobs(rows)
                        setJobsCacheStatus({ source: 'network', savedAt: Date.now(), refreshing: false })
                    }
                } catch {
                    if (!cancelled) setJobsCacheStatus((current) => current ? { ...current, refreshing: false } : current)
                }
            }, 2_000)
        }
        const unsubscribeChanges = subscribeToJobChanges(refreshJobs)
        const unsubscribeRecovery = subscribeToOperationalRealtimeRecovery(refreshJobs)

        return () => {
            cancelled = true
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            unsubscribeChanges()
            unsubscribeRecovery()
        }
    }, [account, getAccessToken, loadGlobalOperationalData, setJobs])

    useEffect(() => {
        if (!account) return
        let refreshTimer: number | undefined
        const refetchStaffDirectory = staffDirectoryQuery.refetch
        const unsubscribe = subscribeToStaffChanges(() => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            refreshTimer = window.setTimeout(() => {
                void refetchStaffDirectory().catch(() => undefined)
            }, 750)
        })
        return () => {
            if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
            unsubscribe()
        }
    }, [account, staffDirectoryQuery.refetch])

    return {
        jobs,
        scheduleOptions,
        servicePlans,
        officeUpdates,
        jobsCacheStatus,
        jobsRealtimeStatus,
        referenceDataStatus,
        referenceDataError,
        prepareJobReferenceData,
        loadJobQuotes,
        loadJobAssignments,
        prepareJobEditorReferenceData,
        searchEquipmentForEditor,
        searchCustomersForEditor,
        loadCustomerSitesForEditor,
        loadSiteContactsForEditor,
        loadEquipmentForEditor,
        loadEquipmentServicePlansForEditor,
        equipmentList,
        sites,
        customers,
        fetchJobs,
        fetchJobForDrawer,
        loadJobOfficeUpdatesForEditor,
        fetchJobCardDetails,
        fetchJobPhotoBody,
        fetchScheduleOptions,
        fetchEquipment,
        fetchJobOfficeUpdates,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        createJob,
        createEquipment,
        updateEquipment,
        setupEquipmentMaintenance,
        saveEquipmentMaintenanceHistory,
        deleteEquipment,
        isEquipmentSaving,
        equipmentSaveError,
        clearEquipmentSaveError: () => setEquipmentSaveError(''),
        createSite,
        createCustomer,
        mechanics,
        mechanicsLoading: staffDirectoryQuery.data === undefined
            && (staffDirectoryQuery.status === 'initial' || staffDirectoryQuery.status === 'loading'),
        mechanicsError: staffDirectoryQuery.data === undefined ? staffDirectoryQuery.error?.message ?? '' : '',
        retryMechanics: staffDirectoryQuery.refetch,
        siteContacts,
        createContactForSite,
        updateJobStatus,
        updateJobCardStatus,
        sendPrimaryJobEmail,
        queuePrimaryJobEmail,
        emailDeliveryStates,
        sendAssignmentJobEmail,
        createJobAssignment,
        updateJobAssignmentStatus,
        deleteJobAssignment,
        updateJobFields,
        allocateJobNumbers,
        updateJob,
        completionRequest,
        isCompletingJob,
        completionError,
        completeStandardJob,
        completeServiceJob,
        completeWofJob,
        cancelJobCompletion,
        deleteJob,
        createScheduleOption,
        confirmScheduleOption,
        updateScheduleOption,
        deleteScheduleOption,
        isLoading,
        loadError,
        retryInitialLoad: () => setReloadKey((current) => current + 1),

    }
}
