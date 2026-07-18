import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { Job } from '../types/job.types'
import type { Equipment } from '../types/equipment.types'
import {
    fetchJobs as fetchJobsApi,
    createJob as createJobApi,
    updateJobStatus as updateJobStatusApi,
    updateJobFields as updateJobFieldsApi,
    updateJob as updateJobApi,
    deleteJob as deleteJobApi,
} from '../services/jobsApi'
import type { JobSaveInput } from '../types/jobSave.types'
import type { JobStatus } from '../types/jobStatus.types'

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
    const account = accounts[0]

    const [jobs, setJobs] = useState<Job[]>([])
    const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [siteContacts, setSiteContacts] = useState<SiteContact[]>([])

    const getAccessToken = async () => {
        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account,
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

    const updateJobStatus = async (jobId: string, status: JobStatus) => {
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

    const updateJob = async (jobId: string, job: JobSaveInput) => {
        const token = await getAccessToken()

        await updateJobApi(token, jobId, job)

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
                    gr_Equipment: selectedEquipment,
                    gr_Mechanic: selectedMechanic,
                    gr_Site: selectedSite,
                    gr_Contact: selectedContact,
                }
                : currentJob,
        ))
    }

    const createJob = async (job: JobSaveInput) => {
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

    const deleteJob = async (jobId: string) => {
        const token = await getAccessToken()
        await deleteJobApi(token, jobId)
        setJobs((currentJobs) => currentJobs.filter((job) => job.gr_jobid !== jobId))
    }

    useEffect(() => {
        if (!account) return

        let cancelled = false

        const loadInitialData = async () => {
            const response = await instance.acquireTokenSilent({
                scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
                account,
            })
            const token = response.accessToken
            const mechanicsRequest = fetch(
                `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_mechanics?$select=gr_mechanicid,gr_name,gr_phone,gr_email`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                },
            ).then((result) => result.json())

            const [
                initialJobs,
                initialEquipment,
                initialSites,
                initialCustomers,
                initialSiteContacts,
                mechanicsData,
            ] = await Promise.all([
                fetchJobsApi(token),
                fetchEquipmentApi(token),
                fetchSitesApi(token),
                fetchCustomersApi(token),
                fetchSiteContactsApi(token),
                mechanicsRequest,
            ])

            if (cancelled) return

            setJobs(initialJobs)
            setEquipmentList(initialEquipment)
            setSites(initialSites)
            setCustomers(initialCustomers)
            setSiteContacts(initialSiteContacts)
            setMechanics(mechanicsData.value ?? [])
        }

        void loadInitialData()

        return () => {
            cancelled = true
        }
    }, [account, instance])

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
        updateJob,
        deleteJob,

    }
}
