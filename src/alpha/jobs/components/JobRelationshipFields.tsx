import { useEffect, useMemo, useState } from 'react'
import type { Equipment } from '../types/equipment.types'
import type { Customer } from '../types/customer.types'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'
import { SERVICE_TYPES } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { isServiceTypeEnabled } from '../../equipment/servicePlans/maintenanceConfiguration'
import type { useJobEditor } from '../hooks/useJobEditor'
import { deriveSiteNameFromAddress } from '../../shared/siteName'
import VerifiedAddressField from './VerifiedAddressField'
import type { VerifiedAddressSuggestion } from '../services/addressSearchApi'
import CustomerRelationshipPicker from '../../shared/customer-relationship/CustomerRelationshipPicker'
import JobEquipmentField from './JobEquipmentField'
import JobSiteContactFields from './JobSiteContactFields'

export type JobRelationshipLookupProps = {
    onSearchEquipment?: (query: string, context: { customerId?: string; siteId?: string }, signal?: AbortSignal) => Promise<Equipment[]>
    onSearchCustomers?: (query: string, signal?: AbortSignal) => Promise<Customer[]>
    onLoadCustomerSites?: (customerId: string, signal?: AbortSignal) => Promise<Site[]>
    onLoadSiteContacts?: (siteId: string, signal?: AbortSignal) => Promise<SiteContact[]>
    onLoadEquipment?: (equipmentId: string, signal?: AbortSignal) => Promise<Equipment | undefined>
    onLoadEquipmentServicePlans?: (equipmentId: string, signal?: AbortSignal) => Promise<unknown>
}

type Props = JobRelationshipLookupProps & {
    editor: ReturnType<typeof useJobEditor>
    equipmentList: Equipment[]
    customers: Customer[]
    initialEquipmentDraft?: { fleet?: string; alternateFleet?: string; serial?: string; make?: string; model?: string }
    equipmentDependencyStatus?: 'idle' | 'loading' | 'ready' | 'error'
    equipmentDependencyError?: string
    onRetryEquipmentDependencies?: () => void
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: { customerId: string; name: string; address?: string }) => Promise<string>
    onCreateContact: (contact: { siteId: string; name: string; phone?: string; email?: string }) => Promise<string>
    onCreateEquipment: (equipment: { fleet: string; alternateFleet?: string; serial: string; make?: string; model?: string }) => Promise<string>
}

type Panel = '' | 'site' | 'contact'

export default function JobRelationshipFields({
    editor,
    equipmentList,
    customers,
    initialEquipmentDraft,
    equipmentDependencyStatus = 'idle',
    equipmentDependencyError = '',
    onRetryEquipmentDependencies,
    onCreateCustomer,
    onCreateSite,
    onCreateContact,
    onCreateEquipment,
    onSearchEquipment,
    onSearchCustomers,
    onLoadCustomerSites,
    onLoadSiteContacts,
}: Props) {
    const {
        draft, setDraft, customerSearch, setCustomerSearch,
        customerSearchOpen, setCustomerSearchOpen, filteredCustomers,
        filteredSites, filteredContacts, selectCustomer, selectSite,
    } = editor
    const [panel, setPanel] = useState<Panel>('')
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const [site, setSite] = useState({ name: '', address: '' })
    const [siteAddressSelection, setSiteAddressSelection] = useState<VerifiedAddressSuggestion | null>(null)
    const [contact, setContact] = useState({ name: '', phone: '', email: '' })
    const selectedEquipment = equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)
    const [remoteCustomerResults, setRemoteCustomerResults] = useState<Customer[]>([])
    const [customerSearchStatus, setCustomerSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [siteLoadStatus, setSiteLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [siteLoadError, setSiteLoadError] = useState('')
    const [siteLoadAttempt, setSiteLoadAttempt] = useState(0)
    const [contactLoadStatus, setContactLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [contactLoadError, setContactLoadError] = useState('')
    const [contactLoadAttempt, setContactLoadAttempt] = useState(0)
    const customerRemoteQueryActive = customerSearch.trim().length >= 2
    const visibleCustomerSearchStatus = customerRemoteQueryActive ? customerSearchStatus : 'idle'
    const equipmentConflictsWithCustomer = (customerId: string) => {
        const equipmentCustomerId = selectedEquipment?.gr_Site?.gr_Customer?.gr_customerid
        return Boolean(equipmentCustomerId && equipmentCustomerId !== customerId)
    }
    const equipmentConflictsWithSite = (siteId: string) => {
        const equipmentSiteId = selectedEquipment?.gr_Site?.gr_siteid
        return Boolean(equipmentSiteId && equipmentSiteId !== siteId)
    }
    const customerResults = useMemo(() => {
        const records = new Map(filteredCustomers.map((item) => [item.gr_customerid.toLowerCase(), item]))
        if (customerRemoteQueryActive) remoteCustomerResults.forEach((item) => records.set(item.gr_customerid.toLowerCase(), item))
        return [...records.values()].slice(0, 8)
    }, [customerRemoteQueryActive, filteredCustomers, remoteCustomerResults])

    useEffect(() => {
        if (!customerSearchOpen || !onSearchCustomers) return
        const query = customerSearch.trim()
        if (query.length < 2) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setCustomerSearchStatus('loading')
            void onSearchCustomers(query, controller.signal)
                .then((rows) => {
                    if (!controller.signal.aborted) {
                        setRemoteCustomerResults(rows)
                        setCustomerSearchStatus('idle')
                    }
                })
                .catch((error) => {
                    if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) setCustomerSearchStatus('error')
                })
        }, 250)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [customerSearch, customerSearchOpen, onSearchCustomers])

    useEffect(() => {
        if (!selectedEquipment || selectedEquipment.gr_equipmentid !== draft.equipmentId) return
        const timer = window.setTimeout(() => {
            const selectedCustomer = selectedEquipment.gr_Site?.gr_Customer
            if (selectedCustomer && selectedCustomer.gr_customerid === draft.customerId) {
                setCustomerSearch(selectedCustomer.gr_name)
            }
        }, 0)
        return () => window.clearTimeout(timer)
    }, [draft.customerId, draft.equipmentId, selectedEquipment, setCustomerSearch])

    useEffect(() => {
        if (!draft.customerId || customerSearch.trim()) return
        const selectedCustomer = customers.find((item) => item.gr_customerid === draft.customerId)
        if (selectedCustomer) setCustomerSearch(selectedCustomer.gr_name)
    }, [customerSearch, customers, draft.customerId, setCustomerSearch])

    useEffect(() => {
        const customerId = draft.customerId
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            if (!customerId || !onLoadCustomerSites) {
                setSiteLoadStatus('idle')
                setSiteLoadError('')
                return
            }
            setSiteLoadStatus('loading')
            setSiteLoadError('')
            void onLoadCustomerSites(customerId, controller.signal).then((rows) => {
                if (controller.signal.aborted) return
                setSiteLoadStatus('ready')
                if (rows.length === 1) {
                    setDraft((current) => current.customerId === customerId && !current.siteId
                        ? { ...current, siteId: rows[0].gr_siteid }
                        : current)
                }
            }).catch((error) => {
                if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
                setSiteLoadStatus('error')
                setSiteLoadError(error instanceof Error ? error.message : 'Sites could not be loaded.')
            })
        }, 0)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [draft.customerId, onLoadCustomerSites, setDraft, siteLoadAttempt])

    useEffect(() => {
        const siteId = draft.siteId
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            if (!siteId || !onLoadSiteContacts) {
                setContactLoadStatus('idle')
                setContactLoadError('')
                return
            }
            setContactLoadStatus('loading')
            setContactLoadError('')
            void onLoadSiteContacts(siteId, controller.signal).then((rows) => {
                if (controller.signal.aborted) return
                setContactLoadStatus('ready')
                if (rows.length === 1) {
                    const contactId = rows[0].gr_Contact?.gr_contactid ?? ''
                    setDraft((current) => current.siteId === siteId && !current.contactId
                        ? { ...current, contactId }
                        : current)
                }
            }).catch((error) => {
                if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
                setContactLoadStatus('error')
                setContactLoadError(error instanceof Error ? error.message : 'Site Contacts could not be loaded.')
            })
        }, 0)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [contactLoadAttempt, draft.siteId, onLoadSiteContacts, setDraft])

    const openPanel = (nextPanel: Panel) => {
        setPanel(nextPanel)
        setCreateError('')
    }

    const selectEquipment = (item: Equipment) => {
        setDraft((current) => ({
            ...current,
            equipmentId: item.gr_equipmentid,
            serviceType: isServiceTypeEnabled(item, current.serviceType) ? current.serviceType : SERVICE_TYPES.NONE,
        }))
        const site = item.gr_Site
        const customer = site?.gr_Customer
        if (site && customer) {
            setCustomerSearch(customer.gr_name)
            setCustomerSearchOpen(false)
            selectCustomer(customer.gr_customerid)
            selectSite(site.gr_siteid)
        }
    }

    const clearEquipment = () => {
        setDraft((current) => ({ ...current, equipmentId: '' }))
    }

    const createCustomerAndSite = async (input: { customerName: string; siteName: string; address: string }) => {
        const customerId = await onCreateCustomer({ name: input.customerName })
        let siteId = ''
        try {
            siteId = await onCreateSite({ customerId, name: input.siteName, address: input.address })
        } catch (error) {
            console.error(error)
            throw new Error('The customer was created, but the site could not be created. Add the site or try again.', { cause: error })
        }
        if (equipmentConflictsWithCustomer(customerId) || equipmentConflictsWithSite(siteId)) clearEquipment()
        setDraft((current) => ({ ...current, customerId, siteId, contactId: '' }))
        setCustomerSearch(input.customerName)
    }

    const createSite = async () => {
        if (!draft.customerId) return setCreateError('Select a customer first.')
        if (!siteAddressSelection || siteAddressSelection.formattedAddress !== site.address) return setCreateError('Select a verified address from the Geoapify suggestions.')
        const siteName = site.name.trim() || deriveSiteNameFromAddress(site.address)
        if (!siteName) return setCreateError('Enter a Site Name, or an Address that can be used to generate one.')
        try {
            setIsCreating(true)
            setCreateError('')
            const siteId = await onCreateSite({
                customerId: draft.customerId, name: siteName,
                address: site.address.trim() || undefined,
            })
            if (equipmentConflictsWithSite(siteId)) clearEquipment()
            setDraft((current) => ({ ...current, siteId, contactId: '' }))
            setSite({ name: '', address: '' })
            setSiteAddressSelection(null)
            setPanel('')
        } catch (error) {
            console.error(error)
            setCreateError('Site could not be created.')
        } finally { setIsCreating(false) }
    }

    const createContact = async () => {
        if (!draft.siteId) return setCreateError('Select a site first.')
        if (!contact.name.trim()) return setCreateError('Enter a contact name.')
        try {
            setIsCreating(true)
            setCreateError('')
            const contactId = await onCreateContact({
                siteId: draft.siteId, name: contact.name.trim(),
                phone: contact.phone.trim() || undefined,
                email: contact.email.trim() || undefined,
            })
            setDraft((current) => ({ ...current, contactId }))
            setContact({ name: '', phone: '', email: '' })
            setPanel('')
        } catch (error) {
            console.error(error)
            setCreateError('Contact could not be created.')
        } finally { setIsCreating(false) }
    }

    const actions = (create: () => void, label: string, disabled = false) => (
        <div className="job-edit-create-actions">
            <button type="button" onClick={() => setPanel('')} disabled={isCreating}>Cancel</button>
            <button type="button" className="primary" onClick={create} disabled={isCreating || disabled}>
                {isCreating ? 'Creating...' : label}
            </button>
        </div>
    )

    return <>
        <div className="job-edit-divider job-edit-field-wide">
            <h3>Equipment and location</h3>
            <p>Change which records this job references.</p>
        </div>

        <JobEquipmentField
            value={draft.equipmentId}
            equipmentList={equipmentList}
            customerId={draft.customerId}
            siteId={draft.siteId}
            initialEquipmentDraft={initialEquipmentDraft}
            dependencyStatus={equipmentDependencyStatus}
            dependencyError={equipmentDependencyError}
            onRetryDependencies={onRetryEquipmentDependencies}
            onCreateEquipment={onCreateEquipment}
            onSearchEquipment={onSearchEquipment}
            onChange={(item) => item ? selectEquipment(item) : clearEquipment()}
        />

        <div className="job-edit-field-wide">
            <CustomerRelationshipPicker
                id="job-editor-customer"
                query={customerSearch}
                selectedId={draft.customerId}
                options={customerResults.map((item) => ({ id: item.gr_customerid, label: item.gr_name }))}
                onQueryChange={setCustomerSearch}
                onOpenChange={setCustomerSearchOpen}
                onClearSelection={() => setDraft((current) => ({ ...current, customerId: '', siteId: '', contactId: '' }))}
                onSelect={(customerId) => {
                    const selected = customerResults.find((item) => item.gr_customerid === customerId)
                    if (!selected) return
                    setCustomerSearch(selected.gr_name)
                    if (equipmentConflictsWithCustomer(customerId)) clearEquipment()
                    selectCustomer(customerId)
                }}
                onCreateCustomerAndSite={createCustomerAndSite}
                searchStatus={visibleCustomerSearchStatus}
            />
        </div>

        <JobSiteContactFields
            customerId={draft.customerId}
            siteId={draft.siteId}
            contactId={draft.contactId}
            sites={filteredSites}
            contacts={filteredContacts}
            siteLoadStatus={siteLoadStatus}
            siteLoadError={siteLoadError}
            contactLoadStatus={contactLoadStatus}
            contactLoadError={contactLoadError}
            onSiteChange={(siteId) => {
                if (equipmentConflictsWithSite(siteId)) clearEquipment()
                selectSite(siteId)
            }}
            onContactChange={(contactId) => setDraft((current) => ({ ...current, contactId }))}
            onAddSite={() => openPanel('site')}
            onAddContact={() => openPanel('contact')}
            onRetrySites={() => setSiteLoadAttempt((current) => current + 1)}
            onRetryContacts={() => setContactLoadAttempt((current) => current + 1)}
        />
        {panel === 'site' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New site</h4><p>Create a site for {customerSearch} and select it for this job.</p></div>
            <label className="job-edit-field"><span>Site name</span><input autoFocus value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} /></label>
            <VerifiedAddressField value={site.address} onChange={(address, selection) => { const previousDerived = deriveSiteNameFromAddress(site.address); const nextDerived = selection?.siteName || deriveSiteNameFromAddress(address); setSiteAddressSelection(selection); setCreateError(''); setSite({ ...site, address, name: !site.name.trim() || site.name === previousDerived ? nextDerived : site.name }) }} />
            {site.name && site.name === deriveSiteNameFromAddress(site.address) && <p>Site Name generated from address.</p>}
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            {actions(createSite, 'Create site', !siteAddressSelection || siteAddressSelection.formattedAddress !== site.address)}
        </div>}

        {panel === 'contact' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New contact</h4><p>Create and select a contact for the chosen site.</p></div>
            <label className="job-edit-field"><span>Contact name</span><input autoFocus value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
            <label className="job-edit-field"><span>Phone</span><input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
            <label className="job-edit-field"><span>Email</span><input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            {actions(createContact, 'Create contact')}
        </div>}
    </>
}
