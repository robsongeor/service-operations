import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { createCustomer as createCustomerApi, fetchCustomers } from '../../jobs/services/customersApi'
import { fetchJobs } from '../../jobs/services/jobsApi'
import { createSite as createSiteApi, fetchSites } from '../../jobs/services/sitesApi'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Job } from '../../jobs/types/job.types'
import type { Site } from '../../jobs/types/site.types'
import {
    applyEquipmentUpdate,
    createEquipment as createEquipmentApi,
    deleteEquipment as deleteEquipmentApi,
    fetchEquipment,
    updateEquipment as updateEquipmentApi,
} from '../services/equipmentManagerApi'
import type { EquipmentUpdateInput } from '../types/equipmentManager.types'
import {
    fetchEquipmentServicePlans,
    saveEquipmentMaintenanceHistory as saveEquipmentMaintenanceHistoryApi,
    type MaintenanceHistoryInput,
} from '../servicePlans/servicePlanApi'
import type { EquipmentServicePlan } from '../servicePlans/equipmentServicePlan.types'

export function useEquipmentManager() {
    const { instance, accounts } = useMsal()
    const account = accounts[0]
    const [equipment, setEquipment] = useState<Equipment[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [jobs, setJobs] = useState<Job[]>([])
    const [servicePlans, setServicePlans] = useState<EquipmentServicePlan[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const getToken = useCallback(async () => {
        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account,
        })
        return response.accessToken
    }, [account, instance])

    const load = useCallback(async () => {
        if (!account) return
        setIsLoading(true)
        setLoadError('')
        try {
            const token = await getToken()
            const [nextEquipment, nextCustomers, nextSites, nextJobs, nextServicePlans] = await Promise.all([
                fetchEquipment(token),
                fetchCustomers(token),
                fetchSites(token),
                fetchJobs(token),
                fetchEquipmentServicePlans(token),
            ])
            setEquipment(nextEquipment)
            setCustomers(nextCustomers)
            setSites(nextSites)
            setJobs(nextJobs)
            setServicePlans(nextServicePlans)
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Equipment data could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [account, getToken])

    useEffect(() => {
        let cancelled = false
        if (!account) return
        const loadInitialData = async () => {
            setIsLoading(true)
            setLoadError('')
            try {
                const token = await getToken()
                const [nextEquipment, nextCustomers, nextSites, nextJobs, nextServicePlans] = await Promise.all([
                    fetchEquipment(token), fetchCustomers(token), fetchSites(token), fetchJobs(token), fetchEquipmentServicePlans(token),
                ])
                if (!cancelled) {
                    setEquipment(nextEquipment)
                    setCustomers(nextCustomers)
                    setSites(nextSites)
                    setJobs(nextJobs)
                    setServicePlans(nextServicePlans)
                }
            } catch (error) {
                if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Equipment data could not be loaded.')
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        void loadInitialData()
        return () => { cancelled = true }
    }, [account, getToken])

    const updateEquipment = async (record: Equipment, input: EquipmentUpdateInput) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await updateEquipmentApi(token, record.gr_equipmentid, input)
            const selectedSite = sites.find((site) => site.gr_siteid === input.siteId)
            const updated = applyEquipmentUpdate(record, input, selectedSite)
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

    const createEquipment = async (input: EquipmentUpdateInput) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            const createdResponse = await createEquipmentApi(token, input)
            const selectedSite = sites.find((site) => site.gr_siteid === input.siteId)
            const created: Equipment = {
                ...createdResponse,
                gr_fleet: input.fleet.trim() || null,
                gr_make: input.make.trim() || null,
                gr_model: input.model.trim() || null,
                gr_serial: input.serial.trim() || null,
                gr_Site: selectedSite,
            }
            setEquipment((current) => [...current, created])
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
            gr_Customer: customer ?? customerOverride,
        }
        setSites((current) => [...current, created])
        return created
    }

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
            const updatedPlans = await saveEquipmentMaintenanceHistoryApi(token, record.gr_equipmentid, existingPlans, input)
            setEquipment((current) => current.map((item) =>
                item.gr_equipmentid === record.gr_equipmentid
                    ? { ...item, gr_currenthourmeter: input.currentHourMeter }
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
                equipment: { ...record, gr_currenthourmeter: input.currentHourMeter },
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

    return {
        equipment, customers, sites, jobs, servicePlans, isLoading, isSaving, loadError, saveError,
        reload: load,
        clearSaveError: () => setSaveError(''),
        createCustomer,
        createSite,
        createEquipment,
        updateEquipment,
        saveEquipmentMaintenanceHistory,
        deleteEquipment,
    }
}
