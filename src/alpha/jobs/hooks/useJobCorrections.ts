import { useCallback, useEffect, useState } from 'react'
import type { Customer } from '../types/customer.types'
import type { Equipment } from '../types/equipment.types'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'
import type { JobSaveInput } from '../types/jobSave.types'
import { fetchJobForCorrection, saveJobCorrections, JobCorrectionConflictError, JobCorrectionRefreshError, type CorrectableJob } from '../services/jobCorrectionsApi'
import { searchCustomers } from '../services/customersApi'
import { searchEquipment } from '../services/equipmentApi'
import { fetchCustomerSites } from '../services/sitesApi'
import { fetchSiteContactsForSite } from '../services/siteContactsApi'
import { invalidateJobsCache } from '../services/jobsApi'

function mergeBy<T>(current: T[], incoming: T[], key: keyof T) {
    return [...new Map([...current, ...incoming].map((item) => [item[key], item])).values()]
}

/** Loads just the selected Job and its lookup choices, never operational children or whole directories. */
export function useJobCorrections(jobId: string, getAccessToken: () => Promise<string>, onSaved: (job: CorrectableJob) => void) {
    const [job, setJob] = useState<CorrectableJob | null>(null)
    const [loadError, setLoadError] = useState('')
    const [attempt, setAttempt] = useState(0)
    const [reloadReason, setReloadReason] = useState('')
    const [equipment, setEquipment] = useState<Equipment[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [sites, setSites] = useState<Site[]>([])
    const [contacts, setContacts] = useState<SiteContact[]>([])
    useEffect(() => {
        const controller = new AbortController()
        void getAccessToken().then((token) => fetchJobForCorrection(token, jobId, controller.signal)).then((loaded) => {
            if (controller.signal.aborted) return
            setJob(loaded)
            setEquipment(loaded.gr_Equipment ? [loaded.gr_Equipment] : [])
            setCustomers(loaded.gr_Site?.gr_Customer ? [loaded.gr_Site.gr_Customer] : [])
            setSites(loaded.gr_Site ? [loaded.gr_Site] : [])
            setContacts(loaded.gr_Contact && loaded.gr_Site ? [{ gr_sitecontactid: `historical-${loaded.gr_Contact.gr_contactid}`, gr_Site: loaded.gr_Site, gr_Contact: loaded.gr_Contact }] : [])
        }).catch(() => {
            if (!controller.signal.aborted) setLoadError('The latest Job details could not be loaded. Check your access and try again.')
        })
        return () => controller.abort()
    }, [attempt, getAccessToken, jobId])

    const reload = () => {
        setJob(null)
        setLoadError('')
        setReloadReason('')
        setAttempt((value) => value + 1)
    }
    const findCustomers = useCallback(async (query: string, signal?: AbortSignal) => {
        const rows = await searchCustomers(await getAccessToken(), query, signal)
        if (!signal?.aborted) setCustomers((current) => mergeBy(current, rows, 'gr_customerid'))
        return rows
    }, [getAccessToken])
    const findEquipment = useCallback(async (query: string, context: { customerId?: string; siteId?: string }, signal?: AbortSignal) => {
        const rows = await searchEquipment(await getAccessToken(), query, context, signal)
        if (!signal?.aborted) setEquipment((current) => mergeBy(current, rows, 'gr_equipmentid'))
        return rows
    }, [getAccessToken])
    const loadSites = useCallback(async (customerId: string, signal?: AbortSignal) => {
        const rows = await fetchCustomerSites(await getAccessToken(), customerId, signal)
        if (!signal?.aborted) setSites((current) => mergeBy(current, rows, 'gr_siteid'))
        return rows
    }, [getAccessToken])
    const loadContacts = useCallback(async (siteId: string, signal?: AbortSignal) => {
        const rows = await fetchSiteContactsForSite(await getAccessToken(), siteId, signal)
        if (!signal?.aborted) setContacts((current) => [...new Map([...current, ...rows].map((row) => [
            `${row.gr_Site?.gr_siteid}:${row.gr_Contact?.gr_contactid}`, row,
        ])).values()])
        return rows
    }, [getAccessToken])
    const save = async (id: string, input: JobSaveInput) => {
        if (!job || job.gr_jobid !== id || reloadReason) throw new Error('Reload the latest Job details before saving.')
        const token = await getAccessToken()
        try {
            // Explicit projection: the shared editor's coordinator fields never reach the corrections API.
            const saved = await saveJobCorrections(token, job, {
                description: input.description, orderNumber: input.orderNumber,
                equipmentId: input.equipmentId || '', mechanicId: input.mechanicId || '', externalSupplierDetails: input.externalSupplierDetails || '', customerId: input.customerId || '',
                siteId: input.siteId || '', contactId: input.contactId || '',
            })
            invalidateJobsCache(token)
            onSaved(saved)
        } catch (error) {
            if (error instanceof JobCorrectionConflictError || error instanceof JobCorrectionRefreshError) {
                invalidateJobsCache(token)
                setReloadReason(error.message)
            }
            throw error
        }
    }
    return { job, loadError, reloadReason, reload, equipment, customers, sites, contacts, findCustomers, findEquipment, loadSites, loadContacts, save }
}
