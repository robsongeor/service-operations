import { useCallback, useState } from 'react'
import type { Customer } from '../types/customer.types'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'
import type { JobType } from '../types/jobType.types'
import type { JobStatus } from '../types/jobStatus.types'
import type { ServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types'

export type JobEditorDraft = {
    jobNumber: string
    orderNumber: string
    description: string
    jobType: JobType | ''
    mechanicId: string
    status: JobStatus
    equipmentId: string
    customerId: string
    siteId: string
    contactId: string
    serviceType: ServiceType
}

type Options = {
    initialDraft: JobEditorDraft
    initialCustomerSearch?: string
    customers: Customer[]
    sites: Site[]
    siteContacts: SiteContact[]
}

export function useJobEditor({
    initialDraft,
    initialCustomerSearch = '',
    customers,
    sites,
    siteContacts,
}: Options) {
    const [draft, setDraft] = useState<JobEditorDraft>(initialDraft)
    const [customerSearch, setCustomerSearch] = useState(initialCustomerSearch)
    const [customerSearchOpen, setCustomerSearchOpen] = useState(false)

    const filteredCustomers = customers
        .filter((customer) =>
            customer.gr_name.toLowerCase().includes(customerSearch.trim().toLowerCase()),
        )
        .slice(0, 8)

    const filteredSites = sites.filter(
        (site) => site.gr_Customer?.gr_customerid === draft.customerId,
    )

    const filteredContacts = siteContacts.filter(
        (siteContact) => siteContact.gr_Site?.gr_siteid === draft.siteId,
    )

    const getOnlyContactId = (siteId: string) => {
        const contactsForSite = siteContacts.filter(
            (siteContact) => siteContact.gr_Site?.gr_siteid === siteId,
        )

        return contactsForSite.length === 1
            ? contactsForSite[0].gr_Contact?.gr_contactid ?? ''
            : ''
    }

    const selectCustomer = (customerId: string) => {
        const sitesForCustomer = sites.filter(
            (site) => site.gr_Customer?.gr_customerid === customerId,
        )
        const onlySiteId = sitesForCustomer.length === 1
            ? sitesForCustomer[0].gr_siteid
            : ''

        setDraft((current) => ({
            ...current,
            customerId,
            siteId: onlySiteId,
            contactId: onlySiteId ? getOnlyContactId(onlySiteId) : '',
        }))
    }

    const selectSite = (siteId: string) => {
        setDraft((current) => ({
            ...current,
            siteId,
            contactId: siteId ? getOnlyContactId(siteId) : '',
        }))
    }

    const resetDraft = useCallback((nextDraft: JobEditorDraft, nextCustomerSearch = '') => {
        setDraft(nextDraft)
        setCustomerSearch(nextCustomerSearch)
        setCustomerSearchOpen(false)
    }, [])

    return {
        draft,
        setDraft,
        customerSearch,
        setCustomerSearch,
        customerSearchOpen,
        setCustomerSearchOpen,
        filteredCustomers,
        filteredSites,
        filteredContacts,
        selectCustomer,
        selectSite,
        resetDraft,
    }
}
