import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { fetchEquipment } from '../../jobs/services/equipmentApi'
import { fetchCustomers, createCustomer as createCustomerApi } from '../../jobs/services/customersApi'
import { fetchSites, createSite as createSiteApi } from '../../jobs/services/sitesApi'
import { fetchJobs } from '../../jobs/services/jobsApi'
import { createJobScheduleOption, deleteJobScheduleOption, fetchJobScheduleOptions, updateJobScheduleOption } from '../../jobs/services/jobScheduleApi'
import { SCHEDULE_TYPE } from '../../jobs/types/jobSchedule.types'
import { createEquipment as createEquipmentApi } from '../../equipment/services/equipmentManagerApi'
import type { EquipmentUpdateInput } from '../../equipment/types/equipmentManager.types'
import type { Customer } from '../../jobs/types/customer.types'
import type { Site } from '../../jobs/types/site.types'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types'
import { JOB_TYPES } from '../../jobs/types/jobType.types'
import { SERVICE_TYPES } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { CreateWofInput, ServiceProvider, TechnicianQualification, UpdateWofInput, WofInspection } from '../types/wof.types'
import { createWof as createWofApi, fetchTechnicianQualifications, fetchWofInspections, fetchWofProviders, updateWof as updateWofApi } from '../services/wofApi'

export function useWof() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [equipment, setEquipment] = useState<Awaited<ReturnType<typeof fetchEquipment>>>([])
    const [inspections, setInspections] = useState<WofInspection[]>([])
    const [qualifications, setQualifications] = useState<TechnicianQualification[]>([])
    const [providers, setProviders] = useState<ServiceProvider[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [jobs, setJobs] = useState<Awaited<ReturnType<typeof fetchJobs>>>([])
    const [scheduleOptions, setScheduleOptions] = useState<Awaited<ReturnType<typeof fetchJobScheduleOptions>>>([])
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
            const [equipmentRows, inspectionRows, qualificationRows, providerRows, customerRows, siteRows, jobRows, scheduleRows] = await Promise.all([
                fetchEquipment(accessToken), fetchWofInspections(accessToken), fetchTechnicianQualifications(accessToken), fetchWofProviders(accessToken),
                fetchCustomers(accessToken), fetchSites(accessToken), fetchJobs(accessToken),
                fetchJobScheduleOptions(accessToken),
            ])
            setEquipment(equipmentRows); setInspections(inspectionRows); setQualifications(qualificationRows); setProviders(providerRows)
            setCustomers(customerRows); setSites(siteRows); setJobs(jobRows)
            setScheduleOptions(scheduleRows)
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

    const createEquipment = async (input: EquipmentUpdateInput, resolvedSite?: Site) => {
        const response = await createEquipmentApi(await token(), input)
        const created = { ...response, gr_fleet: input.fleet.trim() || null, gr_make: input.make.trim() || null, gr_model: input.model.trim() || null, gr_serial: input.serial.trim() || null, gr_registrationnumber: input.registrationNumber.trim() || null, gr_wofrequired: input.wofRequired, gr_currentwofexpiry: input.currentWofExpiry || null, gr_Site: resolvedSite ?? sites.find((site) => site.gr_siteid === input.siteId) }
        setEquipment((current) => [...current, created])
        return created
    }

    return { equipment, inspections, qualifications, providers, customers, sites, jobs, scheduleOptions, loading, error, reload: load, createWof, updateWof, createCustomer, createSite, createEquipment }
}
