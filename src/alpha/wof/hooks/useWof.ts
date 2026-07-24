import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { fetchEquipment } from '../../jobs/services/equipmentApi'
import { fetchCustomers, createCustomer as createCustomerApi } from '../../jobs/services/customersApi'
import { fetchSites, createSite as createSiteApi } from '../../jobs/services/sitesApi'
import { fetchJobs } from '../../jobs/services/jobsApi'
import { createEquipment as createJobEquipmentApi } from '../../jobs/services/equipmentApi'
import { createContact as createContactApi, createSiteContact as createSiteContactApi } from '../../jobs/services/contactsApi'
import { fetchSiteContacts } from '../../jobs/services/siteContactsApi'
import { createJobScheduleOption, deleteJobScheduleOption, fetchJobScheduleOptions, updateJobScheduleOption } from '../../jobs/services/jobScheduleApi'
import { SCHEDULE_TYPE } from '../../jobs/types/jobSchedule.types'
import { applyEquipmentUpdate, createEquipment as createEquipmentApi, deleteEquipment as deleteEquipmentApi, updateEquipment as updateEquipmentApi } from '../../equipment/services/equipmentManagerApi'
import { normalizeEquipmentInput, type EquipmentUpdateInput } from '../../equipment/types/equipmentManager.types'
import { fetchEquipmentServicePlans, saveEquipmentMaintenanceHistory as saveEquipmentMaintenanceHistoryApi, syncEquipmentServiceProgramme, type MaintenanceHistoryInput } from '../../equipment/servicePlans/servicePlanApi'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { Customer } from '../../jobs/types/customer.types'
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

export function useWof() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [equipment, setEquipment] = useState<Awaited<ReturnType<typeof fetchEquipment>>>([])
    const [inspections, setInspections] = useState<WofInspection[]>([])
    const [qualifications, setQualifications] = useState<TechnicianQualification[]>([])
    const [providers, setProviders] = useState<ServiceProvider[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [siteContacts, setSiteContacts] = useState<SiteContact[]>([])
    const [jobs, setJobs] = useState<Awaited<ReturnType<typeof fetchJobs>>>([])
    const [scheduleOptions, setScheduleOptions] = useState<Awaited<ReturnType<typeof fetchJobScheduleOptions>>>([])
    const [servicePlans, setServicePlans] = useState<EquipmentServicePlan[]>([])
    const [isEquipmentSaving, setIsEquipmentSaving] = useState(false)
    const [equipmentSaveError, setEquipmentSaveError] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const token = useCallback(async () => (await instance.acquireTokenSilent({
        scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`], account: account!,
    })).accessToken, [account, instance])

    const load = useCallback(async () => {
        if (!account) { setLoading(false); return }
        setLoading(true); setError('')
        try {
            const accessToken = await token()
            const mechanicsRequest = fetch(`${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_mechanics?$select=gr_mechanicid,gr_name,gr_phone,gr_email,gr_camnumber,gr_rego,gr_region`, {
                headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            }).then(async (response) => {
                if (!response.ok) throw new Error(`Failed to fetch mechanics: ${await response.text()}`)
                return response.json() as Promise<{ value?: Mechanic[] }>
            })
            const [equipmentRows, inspectionRows, qualificationRows, providerRows, customerRows, siteRows, jobRows, scheduleRows, planRows, contactRows, mechanicRows] = await Promise.all([
                fetchEquipment(accessToken), fetchWofInspections(accessToken), fetchTechnicianQualifications(accessToken), fetchWofProviders(accessToken),
                fetchCustomers(accessToken), fetchSites(accessToken), fetchJobs(accessToken),
                fetchJobScheduleOptions(accessToken), fetchEquipmentServicePlans(accessToken), fetchSiteContacts(accessToken), mechanicsRequest,
            ])
            setEquipment(equipmentRows); setInspections(inspectionRows); setQualifications(qualificationRows); setProviders(providerRows)
            setCustomers(customerRows); setSites(siteRows); setJobs(jobRows)
            setScheduleOptions(scheduleRows)
            setServicePlans(planRows)
            setSiteContacts(contactRows)
            setMechanics(mechanicRows.value ?? [])
        } catch (caught) { setError(caught instanceof Error ? caught.message : 'WOF data could not be loaded.') }
        finally { setLoading(false) }
    }, [account, token])

    useEffect(() => {
        const timer = window.setTimeout(() => { void load() }, 0)
        return () => window.clearTimeout(timer)
    }, [load])

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
        await load()
    }

    const createWofJob = async (equipmentRecord: typeof equipment[number], job: JobSaveInput) => {
        const jobId = await createWofJobFromJobDrawer(await token(), equipmentRecord, job)
        await load()
        return jobId
    }

    const createWofScheduleOption = async (input: Parameters<typeof createJobScheduleOption>[1]) => {
        await createJobScheduleOption(await token(), input)
        await load()
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
        await load()
    }

    const loadWofInspection = async (inspectionId: string) =>
        fetchWofInspection(await token(), inspectionId)

    const refreshWorkflowData = async () => {
        const accessToken = await token()
        const [inspectionRows, jobRows, scheduleRows] = await Promise.all([
            fetchWofInspections(accessToken),
            fetchJobs(accessToken),
            fetchJobScheduleOptions(accessToken),
        ])
        setInspections(inspectionRows)
        setJobs(jobRows)
        setScheduleOptions(scheduleRows)
    }

    const loadEquipment = async (equipmentId: string) => {
        const rows = await fetchEquipment(await token())
        setEquipment(rows)
        const record = rows.find((item) => item.gr_equipmentid === equipmentId)
        if (!record) throw new Error('The selected Equipment record could not be found.')
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
            const recordPlans = servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === record.gr_equipmentid.toLowerCase())
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
            const updatedEquipment = { ...record, gr_currenthourmeter: input.currentHourMeter }
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
        await load()
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
        setSiteContacts(await fetchSiteContacts(accessToken))
        return contactId
    }

    const createJobEquipment = async (input: { fleet: string; serial: string; make?: string; model?: string }) => {
        const equipmentId = await createJobEquipmentApi(await token(), input)
        await load()
        return equipmentId
    }

    const createEquipment = async (input: EquipmentUpdateInput, resolvedSite?: Site) => {
        const normalized = normalizeEquipmentInput(input)
        const response = await createEquipmentApi(await token(), normalized)
        const created = { ...response, gr_fleet: normalized.fleet || null, gr_make: normalized.make || null, gr_model: normalized.model || null, gr_serial: normalized.serial || null, gr_registrationnumber: normalized.registrationNumber || null, gr_wofrequired: normalized.wofRequired, gr_currentwofexpiry: normalized.currentWofExpiry || null, gr_regoexpiry: normalized.regoExpiry || null, gr_Site: resolvedSite ?? sites.find((site) => site.gr_siteid === normalized.siteId) }
        setEquipment((current) => current.some((item) => item.gr_equipmentid === created.gr_equipmentid)
            ? current.map((item) => item.gr_equipmentid === created.gr_equipmentid ? created : item)
            : [...current, created])
        return created
    }

    return { equipment, inspections, qualifications, providers, customers, sites, mechanics, siteContacts, jobs, scheduleOptions, servicePlans, loading, error, isEquipmentSaving, equipmentSaveError, reload: load, refreshWorkflowData, loadWofInspection, loadEquipment, createWof, createWofJob, createWofScheduleOption, updateWof, deleteWof, createCustomer, createSite, createContact, createJobEquipment, createEquipment, updateEquipment, saveEquipmentMaintenanceHistory, deleteEquipment, clearEquipmentSaveError: () => setEquipmentSaveError('') }
}
