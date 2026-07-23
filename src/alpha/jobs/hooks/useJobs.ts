import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import type { Job } from '../types/job.types'
import type { Equipment } from '../types/equipment.types'
import {
    fetchJobs as fetchJobsApi,
    createJob as createJobApi,
    updateJobStatus as updateJobStatusApi,
    updateJobCardStatus as updateJobCardStatusApi,
    updateJobFields as updateJobFieldsApi,
    updateJobOfficeAttention as updateJobOfficeAttentionApi,
    updateJob as updateJobApi,
    deleteJob as deleteJobApi,
} from '../services/jobsApi'
import type { JobSaveInput } from '../types/jobSave.types'
import { JOB_STATUSES, UNCONFIRMED_OPERATION_MESSAGE, jobIsOperational, type JobStatus } from '../types/jobStatus.types'
import { JOB_CARD_STATUSES, type JobCardStatus } from '../types/jobCardStatus.types'
import type { JobAssignmentInput } from '../types/jobAssignment.types'
import {
    createJobAssignment as createJobAssignmentApi,
    deleteJobAssignment as deleteJobAssignmentApi,
    fetchJobAssignments as fetchJobAssignmentsApi,
    updateJobAssignmentStatus as updateJobAssignmentStatusApi,
} from '../services/jobAssignmentsApi'
import type { JobAssignment } from '../types/jobAssignment.types'
import { createEmailDispatch, waitForEmailDispatch } from '../services/emailDispatchApi'
import { buildAssignmentJobEmail, buildPrimaryJobEmail } from '../services/jobEmail'
import { assertJobHasEmailableJobNumber } from '../services/jobEmailRules'
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
import { createJobOfficeUpdate as createJobOfficeUpdateApi, fetchJobOfficeUpdates as fetchJobOfficeUpdatesApi } from '../services/jobOfficeUpdatesApi'
import type { JobOfficeUpdate } from '../types/officeAction.types'

import {
    createContact as createContactApi,
    createSiteContact as createSiteContactApi,
} from '../services/contactsApi'
import { fetchQuotes as fetchQuotesApi } from '../../quotes/services/quotesApi'
import type { Quote } from '../../quotes/types/quote.types'
import { fetchEquipmentServicePlans } from '../../equipment/servicePlans/servicePlanApi'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import {
    getJobCompletionKind,
    resolveCompletionEquipment,
    resolveCompletionServiceType,
    validateCompletionHourMeter,
    validateServiceCompletionContext,
    type JobCompletionRequest,
} from '../completion/jobCompletion'
import { completeServiceJobAtomically } from '../completion/serviceCompletionApi'



export function useJobs() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()

    const [jobs, setJobs] = useState<Job[]>([])
    const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [siteContacts, setSiteContacts] = useState<SiteContact[]>([])
    const [scheduleOptions, setScheduleOptions] = useState<JobScheduleOption[]>([])
    const [jobQuotes, setJobQuotes] = useState<Quote[]>([])
    const [jobAssignments, setJobAssignments] = useState<JobAssignment[]>([])
    const [servicePlans, setServicePlans] = useState<EquipmentServicePlan[]>([])
    const [officeUpdates, setOfficeUpdates] = useState<JobOfficeUpdate[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [reloadKey, setReloadKey] = useState(0)
    const [completionRequest, setCompletionRequest] = useState<JobCompletionRequest | null>(null)
    const [isCompletingJob, setIsCompletingJob] = useState(false)
    const [completionError, setCompletionError] = useState('')

    const getAccessToken = async () => {
        if (!account) throw new Error('No active Microsoft account is available. Sign in again and retry.')
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

    const assertJobOperational = async (token: string, jobId: string) => {
        let job = jobs.find((candidate) => candidate.gr_jobid.toLowerCase() === jobId.toLowerCase())
        if (!job) {
            const refreshedJobs = await fetchJobsApi(token)
            setJobs(refreshedJobs)
            job = refreshedJobs.find((candidate) => candidate.gr_jobid.toLowerCase() === jobId.toLowerCase())
        }
        if (!job) throw new Error('The job could not be found. Refresh the page and try again.')
        if (!jobIsOperational(job.gr_status)) throw new Error(UNCONFIRMED_OPERATION_MESSAGE)
        return job
    }

    const prepareJobForUnconfirmed = async (token: string, job: Job) => {
        const options = scheduleOptions.filter((option) => option._gr_job_value?.toLowerCase() === job.gr_jobid.toLowerCase())
        const assignments = jobAssignments.filter((assignment) => assignment._gr_job_value?.toLowerCase() === job.gr_jobid.toLowerCase())
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
        setJobAssignments((current) => current.filter((assignment) => assignment._gr_job_value?.toLowerCase() !== job.gr_jobid.toLowerCase()))
    }

    const createScheduleOption = async (option: JobScheduleOptionInput) => {
        const token = await getAccessToken()
        await assertJobOperational(token, option.jobId)

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
        await assertJobOperational(token, jobId)
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
        await assertJobOperational(token, option.jobId)
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

    const fetchJobOfficeUpdates = async () => {
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
        if (isCompleting && getJobCompletionKind(currentJob.gr_jobtype) === 'service') {
            const contextError = validateServiceCompletionContext(currentJob)
            if (contextError) throw new Error(contextError)
            setCompletionError('')
            setCompletionRequest({ kind: 'service', job: currentJob })
            return false
        }
        const token = await getAccessToken()
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

    const fetchJobAssignments = async () => {
        const token = await getAccessToken()
        const assignments = await fetchJobAssignmentsApi(token)
        setJobAssignments(assignments)
    }

    const createJobAssignment = async (assignment: JobAssignmentInput) => {
        const token = await getAccessToken()
        await assertJobOperational(token, assignment.jobId)
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

    const sendPrimaryJobEmail = async (job: Job) => {
        assertJobHasEmailableJobNumber(job)
        const token = await getAccessToken()
        const email = buildPrimaryJobEmail(job)
        const dispatchId = await createEmailDispatch(token, {
            jobId: job.gr_jobid,
            ...email,
        })
        await waitForEmailDispatch(token, dispatchId)
        await updateJobCardStatusApi(token, job.gr_jobid, JOB_CARD_STATUSES.SENT)
        await fetchJobs()
    }

    const sendAssignmentJobEmail = async (job: Job, assignment: JobAssignment) => {
        assertJobHasEmailableJobNumber(job)
        const token = await getAccessToken()
        const email = buildAssignmentJobEmail(job, assignment)
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
            'gr_Mechanic@odata.bind'?: string | null
        }
    ) => {
        const token = await getAccessToken()
        if (fields['gr_Mechanic@odata.bind']) await assertJobOperational(token, jobId)

        await updateJobFieldsApi(token, jobId, fields)

        await fetchJobs()
    }

    const updateJob = async (jobId: string, job: JobSaveInput) => {
        const currentJob = jobs.find((item) => item.gr_jobid === jobId)
        if (!currentJob) throw new Error('The job could not be found. Refresh the page and try again.')
        const isCompleting = job.status === JOB_STATUSES.COMPLETE && currentJob.gr_status !== JOB_STATUSES.COMPLETE
        if (isCompleting && getJobCompletionKind(job.jobType) === 'service') {
            const contextError = validateServiceCompletionContext(currentJob, job)
            if (contextError) throw new Error(contextError)
            setCompletionError('')
            setCompletionRequest({ kind: 'service', job: currentJob, pendingSave: job })
            return false
        }
        const token = await getAccessToken()
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

    const completeServiceJob = async (hourMeter: number) => {
        const request = completionRequest
        if (!request || request.kind !== 'service') return
        const equipment = resolveCompletionEquipment(request, equipmentList)
        const serviceType = resolveCompletionServiceType(request)
        const currentHourMeter = equipment?.gr_currenthourmeter ?? 0
        const validationError = validateCompletionHourMeter(String(hourMeter), currentHourMeter)
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
                expectedServiceType: serviceType,
                pendingSave: request.pendingSave,
            })

            const [nextJobs, nextEquipment, nextPlans] = await Promise.all([
                fetchJobsApi(token),
                fetchEquipmentApi(token),
                fetchEquipmentServicePlans(token),
            ])
            setJobs(nextJobs)
            setEquipmentList(nextEquipment)
            setServicePlans(nextPlans)
            setCompletionRequest(null)
        } catch (error) {
            try {
                const token = await getAccessToken()
                const [jobsResult, equipmentResult, plansResult] = await Promise.allSettled([
                    fetchJobsApi(token),
                    fetchEquipmentApi(token),
                    fetchEquipmentServicePlans(token),
                ])
                if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value)
                if (equipmentResult.status === 'fulfilled') setEquipmentList(equipmentResult.value)
                if (plansResult.status === 'fulfilled') setServicePlans(plansResult.value)
            } catch {
                // Keep the completion dialog open with the original error when refresh is unavailable.
            }
            setCompletionError(error instanceof Error ? error.message : 'The Service Job could not be completed.')
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
                    `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_mechanics?$select=gr_mechanicid,gr_name,gr_phone,gr_email,gr_camnumber,gr_rego,gr_region`,
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
                    initialServicePlans,
                    initialOfficeUpdates,
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
                    fetchEquipmentServicePlans(token),
                    fetchJobOfficeUpdatesApi(token),
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
                setServicePlans(initialServicePlans)
                setOfficeUpdates(initialOfficeUpdates)
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
        servicePlans,
        officeUpdates,
        equipmentList,
        sites,
        customers,
        fetchJobs,
        fetchScheduleOptions,
        fetchEquipment,
        fetchJobOfficeUpdates,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        createJob,
        createEquipment,
        createSite,
        createCustomer,
        mechanics,
        siteContacts,
        createContactForSite,
        updateJobStatus,
        updateJobCardStatus,
        sendPrimaryJobEmail,
        sendAssignmentJobEmail,
        createJobAssignment,
        updateJobAssignmentStatus,
        deleteJobAssignment,
        updateJobFields,
        updateJob,
        completionRequest,
        isCompletingJob,
        completionError,
        completeServiceJob,
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
