import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { Job } from '../types/job.types'
import type { Equipment } from '../types/equipment.types'
import {
    fetchJobs as fetchJobsApi,
    createJob as createJobApi,
    updateJobStatus as updateJobStatusApi,
    updateJobFields as updateJobFieldsApi,
} from '../services/jobsApi'

import {
    fetchEquipment as fetchEquipmentApi,
    createEquipment as createEquipmentApi,
    updateEquipmentSite
} from '../services/equipmentApi'

import type { Mechanic } from '../types/mechanic.types'

import type { Customer } from '../types/customer.types'
import {
    createCustomer as createCustomerApi,
    fetchCustomers as fetchCustomersApi,
} from '../services/customersApi'

import type { Site } from '../types/site.types'
import {
    createSite as createSiteApi,
    fetchSites as fetchSitesApi,
} from '../services/sitesApi'

import type { SiteContact } from '../types/siteContact.types'
import { fetchSiteContacts as fetchSiteContactsApi } from '../services/siteContactsApi'

import {
    createContact as createContactApi,
    createSiteContact as createSiteContactApi,
} from '../services/contactsApi'



export function useJobs() {
    const { instance, accounts } = useMsal()

    const [jobs, setJobs] = useState<Job[]>([])
    const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [siteContacts, setSiteContacts] = useState<SiteContact[]>([])

    const getAccessToken = async () => {
        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account: accounts[0],
        })

        return response.accessToken
    }

    const createEquipment = async (equipment: {
        fleet: string
        serial: string
        make?: string
        model?: string
    }) => {
        const token = await getAccessToken()

        const equipmentId = await createEquipmentApi(token, equipment)

        await fetchEquipment()

        return equipmentId
    }

    const createCustomer = async (customer: {
        name: string
    }) => {
        const token = await getAccessToken()

        const customerId = await createCustomerApi(token, customer)

        await fetchCustomers()

        return customerId
    }

    const createSite = async (site: {
        customerId: string
        name: string
        address?: string
    }) => {
        const token = await getAccessToken()
        const siteId = await createSiteApi(token, site)

        await fetchSites()

        return siteId
    }

    const createContactForSite = async (contact: {
        siteId: string
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

        await createSiteContactApi(token, contact.siteId, contactId)

        await fetchSiteContacts()

        return contactId
    }

    const fetchSiteContacts = async () => {
        const token = await getAccessToken()
        const siteContacts = await fetchSiteContactsApi(token)
        setSiteContacts(siteContacts)
    }

    const fetchSites = async () => {
        const token = await getAccessToken()
        const sites = await fetchSitesApi(token)
        setSites(sites)
    }

    const fetchCustomers = async () => {
        const token = await getAccessToken()
        const customers = await fetchCustomersApi(token)
        setCustomers(customers)
    }

    const fetchMechanics = async () => {
        const token = await getAccessToken()

        const result = await fetch(
            `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_mechanics?$select=gr_mechanicid,gr_name`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            },
        )

        const data = await result.json()
        setMechanics(data.value ?? [])
    }

    const fetchJobs = async () => {
        const token = await getAccessToken()
        const jobs = await fetchJobsApi(token)
        setJobs(jobs)
    }

    const fetchEquipment = async () => {
        const token = await getAccessToken()
        const equipment = await fetchEquipmentApi(token)
        setEquipmentList(equipment)
    }

    const updateJobStatus = async (jobId: string, status: number) => {
        const token = await getAccessToken()

        await updateJobStatusApi(token, jobId, status)

        await fetchJobs()
    }

    const updateJobFields = async (
        jobId: string,
        fields: {
            gr_jobnumber?: string
            gr_description?: string
            gr_ordernumber?: string
        }
    ) => {
        const token = await getAccessToken()

        await updateJobFieldsApi(token, jobId, fields)

        await fetchJobs()
    }

    const createJob = async (job: {
        jobNumber: string
        orderNumber: string
        description: string
        equipmentId?: string
        mechanicId?: string
        siteId?: string
        contactId?: string
    }) => {
        const token = await getAccessToken()

        await createJobApi(token, job)

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
    }

    useEffect(() => {
        if (accounts.length > 0) {
            fetchMechanics()
            fetchJobs()
            fetchEquipment()
            fetchSites()
            fetchCustomers()
            fetchSiteContacts()
        }
    }, [accounts])

    return {
        jobs,
        equipmentList,
        sites,
        customers,
        fetchJobs,
        fetchEquipment,
        createJob,
        createEquipment,
        createSite,
        createCustomer,
        mechanics,
        siteContacts,
        createContactForSite,
        updateJobStatus,
        updateJobFields,

    }
}
