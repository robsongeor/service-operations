import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { Job } from '../types/job.types'
import type { Equipment } from '../types/equipment.types'
import {
    fetchJobs as fetchJobsApi,
    createJob as createJobApi,
    updateJobStatus as updateJobStatusApi,
    updateJobCardStatus as updateJobCardStatusApi,
    updateJobFields as updateJobFieldsApi,
    updateJob as updateJobApi,
    deleteJob as deleteJobApi,
} from '../services/jobsApi'
import type { JobSaveInput } from '../types/jobSave.types'
import type { JobStatus } from '../types/jobStatus.types'
import type { JobCardStatus } from '../types/jobCardStatus.types'
import type { JobAssignmentInput } from '../types/jobAssignment.types'
import {
    createJobAssignment as createJobAssignmentApi,
    deleteJobAssignment as deleteJobAssignmentApi,
    fetchJobAssignments as fetchJobAssignmentsApi,
    updateJobAssignmentStatus as updateJobAssignmentStatusApi,
} from '../services/jobAssignmentsApi'
import type { JobAssignment } from '../types/jobAssignment.types'
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
import { fetchQuotes as fetchQuotesApi } from '../../quotes/services/quotesApi'
import type { Quote } from '../../quotes/types/quote.types'



export function useJobs() {
    const { instance, accounts } = useMsal()
    const account = accounts[0]

    const [jobs, setJobs] = useState<Job[]>([])
    const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [siteContacts, setSiteContacts] = useState<SiteContact[]>([])
    const [scheduleOptions, setScheduleOptions] = useState<JobScheduleOption[]>([])
    const [jobQuotes, setJobQuotes] = useState<Quote[]>([])
    const [jobAssignments, setJobAssignments] = useState<JobAssignment[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [reloadKey, setReloadKey] = useState(0)

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

    const fetchScheduleOptions = async () => {
        const token = await getAccessToken()
        const options = await fetchJobScheduleOptionsApi(token)
        setScheduleOptions(options)
    }

    const createScheduleOption = async (option: JobScheduleOptionInput) => {
        const token = await getAccessToken()

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
        await updateJobScheduleOptionApi(token, optionId, option)
        await fetchScheduleOptions()
    }

    const deleteScheduleOption = async (optionId: string) => {
        const token = await getAccessToken()
        await deleteJobScheduleOptionApi(token, optionId)
        setScheduleOptions((currentOptions) => currentOptions.filter(
            (option) => option.gr_jobscheduleoptionid !== optionId,
        ))
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

    const fetchJobAssignments = async () => {
        const token = await getAccessToken()
        const assignments = await fetchJobAssignmentsApi(token)
        setJobAssignments(assignments)
    }

    const createJobAssignment = async (assignment: JobAssignmentInput) => {
        const token = await getAccessToken()
        await createJobAssignmentApi(token, assignment)
        await fetchJobAssignments()
    }

    const updateJobAssignmentStatus = async (
        assignmentId: string,
        status: JobCardStatus,
    ) => {
        const token = await getAccessToken()
        await updateJobAssignmentStatusApi(token, assignmentId, status)
        await fetchJobAssignments()
    }

    const deleteJobAssignment = async (assignmentId: string) => {
        const token = await getAccessToken()
        await deleteJobAssignmentApi(token, assignmentId)
        setJobAssignments((current) => current.filter(
            (assignment) => assignment.gr_jobassignmentid !== assignmentId,
        ))
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

        const loadInitialData = async () => {
            setIsLoading(true)
            setLoadError('')

            try {
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
                ).then(async (result) => {
                    if (!result.ok) {
                        throw new Error(`Failed to fetch mechanics: ${await result.text()}`)
                    }
                    return result.json()
                })

                const [
                    initialJobs,
                    initialEquipment,
                    initialSites,
                    initialCustomers,
                    initialSiteContacts,
                    initialScheduleOptions,
                    initialQuotes,
                    initialAssignments,
                    mechanicsData,
                ] = await Promise.all([
                    fetchJobsApi(token),
                    fetchEquipmentApi(token),
                    fetchSitesApi(token),
                    fetchCustomersApi(token),
                    fetchSiteContactsApi(token),
                    fetchJobScheduleOptionsApi(token),
                    fetchQuotesApi(token),
                    fetchJobAssignmentsApi(token),
                    mechanicsRequest,
                ])

                if (cancelled) return

                setJobs(initialJobs)
                setEquipmentList(initialEquipment)
                setSites(initialSites)
                setCustomers(initialCustomers)
                setSiteContacts(initialSiteContacts)
                setScheduleOptions(initialScheduleOptions)
                setJobQuotes(initialQuotes)
                setJobAssignments(initialAssignments)
                setMechanics(mechanicsData.value ?? [])
            } catch (error) {
                if (cancelled) return

                console.error('Failed to load Dataverse data:', error)
                setLoadError(error instanceof Error
                    ? error.message
                    : 'Dataverse data could not be loaded.')
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        void loadInitialData()

        return () => {
            cancelled = true
        }
    }, [account, instance, reloadKey])

    return {
        jobs,
        scheduleOptions,
        jobQuotes,
        jobAssignments,
        equipmentList,
        sites,
        customers,
        fetchJobs,
        fetchScheduleOptions,
        fetchEquipment,
        createJob,
        createEquipment,
        createSite,
        createCustomer,
        mechanics,
        siteContacts,
        createContactForSite,
        updateJobStatus,
        updateJobCardStatus,
        createJobAssignment,
        updateJobAssignmentStatus,
        deleteJobAssignment,
        updateJobFields,
        updateJob,
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
