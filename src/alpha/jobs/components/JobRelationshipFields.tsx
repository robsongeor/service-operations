import { useEffect, useState } from 'react'
import type { Equipment } from '../types/equipment.types'
import type { Customer } from '../types/customer.types'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'
import { SERVICE_TYPES } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { isServiceTypeEnabled } from '../../equipment/servicePlans/maintenanceConfiguration'
import type { useJobEditor } from '../hooks/useJobEditor'
import JobSiteCreatePanel, { type JobSiteCreateInput } from './JobSiteCreatePanel'
import JobCustomerField from './JobCustomerField'
import JobEquipmentField from './JobEquipmentField'
import JobSiteContactFields from './JobSiteContactFields'
import JobEquipmentLocation from './JobEquipmentLocation'
import { isPersistedEquipmentId } from '../../equipment/services/equipmentLocationWorkflow'
import type { JobCreationLocationErrors } from '../domain/jobCreationLocation'
import JobLocationSummary from './JobLocationSummary'
import JobEquipmentAndLocationFields from './JobEquipmentAndLocationFields'
import type { JobEquipmentFieldProps } from './JobEquipmentField'

export type JobRelationshipLookupProps = {
    onSearchEquipment?: (query: string, context: { customerId?: string; siteId?: string }, signal?: AbortSignal) => Promise<Equipment[]>
    onSearchCustomers?: (query: string, signal?: AbortSignal) => Promise<Customer[]>
    onLoadCustomerSites?: (customerId: string, signal?: AbortSignal) => Promise<Site[]>
    onLoadSiteContacts?: (siteId: string, signal?: AbortSignal) => Promise<SiteContact[]>
    onLoadEquipment?: (equipmentId: string, signal?: AbortSignal) => Promise<Equipment | undefined>
    onLoadEquipmentServicePlans?: (equipmentId: string, signal?: AbortSignal) => Promise<unknown>
}

type Props = JobRelationshipLookupProps & {
    locationRequired?: boolean
    locationErrors?: JobCreationLocationErrors
    manageEquipmentLocation?: boolean
    correctionsOnly?: boolean
    allowCorrectionMasterCreation?: boolean
    hideHeading?: boolean
    useLocationSummary?: boolean
    deferLocationUntilEquipmentChoice?: boolean
    unknownEquipmentOption?: JobEquipmentFieldProps['unknownEquipmentOption']
    onLocationPendingChange?: (pending: boolean) => void
    onLocationSavingChange?: (saving: boolean) => void
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
const ignoreLocationState = () => undefined

export default function JobRelationshipFields({
    locationRequired = false,
    locationErrors,
    manageEquipmentLocation = false,
    correctionsOnly = false,
    allowCorrectionMasterCreation = false,
    hideHeading = false,
    useLocationSummary = false,
    deferLocationUntilEquipmentChoice = false,
    unknownEquipmentOption,
    onLocationPendingChange = ignoreLocationState,
    onLocationSavingChange = ignoreLocationState,
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
        filteredSites, filteredContacts, selectCustomer, selectSite,
    } = editor
    const [panel, setPanel] = useState<Panel>('')
    const [editingLocation, setEditingLocation] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const [contact, setContact] = useState({ name: '', phone: '', email: '' })
    const selectedEquipment = equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)
    const selectedSite = filteredSites.find((site) => site.gr_siteid === draft.siteId) ?? selectedEquipment?.gr_Site
    const selectedCustomer = customers.find((customer) => customer.gr_customerid === draft.customerId) ?? selectedSite?.gr_Customer
    const showLocationSummary = useLocationSummary && !editingLocation && Boolean(draft.customerId || draft.siteId)
    const hasEquipmentLocation = manageEquipmentLocation && selectedEquipment && isPersistedEquipmentId(selectedEquipment.gr_equipmentid)
    const showRelationshipFields = !deferLocationUntilEquipmentChoice || Boolean(draft.equipmentId) || Boolean(unknownEquipmentOption?.selected)
    const [siteLoadStatus, setSiteLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [siteLoadError, setSiteLoadError] = useState('')
    const [siteLoadAttempt, setSiteLoadAttempt] = useState(0)
    const [contactLoadStatus, setContactLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [contactLoadError, setContactLoadError] = useState('')
    const [contactLoadAttempt, setContactLoadAttempt] = useState(0)
    const equipmentConflictsWithCustomer = (customerId: string) => {
        const equipmentCustomerId = selectedEquipment?.gr_Site?.gr_Customer?.gr_customerid
        return Boolean(equipmentCustomerId && equipmentCustomerId !== customerId)
    }
    const equipmentConflictsWithSite = (siteId: string) => {
        const equipmentSiteId = selectedEquipment?.gr_Site?.gr_siteid
        return Boolean(equipmentSiteId && equipmentSiteId !== siteId)
    }
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
            if (!customerId || !onLoadCustomerSites || hasEquipmentLocation) {
                setSiteLoadStatus('idle')
                setSiteLoadError('')
                return
            }
            setSiteLoadStatus('loading')
            setSiteLoadError('')
            void onLoadCustomerSites(customerId, controller.signal).then((rows) => {
                if (controller.signal.aborted) return
                setSiteLoadStatus('ready')
                if (!correctionsOnly && rows.length === 1) {
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
    }, [correctionsOnly, draft.customerId, hasEquipmentLocation, onLoadCustomerSites, setDraft, siteLoadAttempt])

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
                if (!correctionsOnly && rows.length === 1) {
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
    }, [correctionsOnly, contactLoadAttempt, draft.siteId, onLoadSiteContacts, setDraft])

    const openPanel = (nextPanel: Panel) => {
        setPanel(nextPanel)
        setCreateError('')
    }

    const selectEquipment = (item: Equipment) => {
        setEditingLocation(false)
        setDraft((current) => ({
            ...current,
            equipmentId: item.gr_equipmentid,
            serviceType: correctionsOnly || isServiceTypeEnabled(item, current.serviceType) ? current.serviceType : SERVICE_TYPES.NONE,
        }))
        const site = item.gr_Site
        const customer = site?.gr_Customer
        if (site && customer) {
            setCustomerSearch(customer.gr_name)
            selectCustomer(customer.gr_customerid)
            selectSite(site.gr_siteid)
        }
    }

    const clearEquipment = () => {
        setEditingLocation(true)
        setDraft((current) => ({ ...current, equipmentId: '' }))
    }

    const createCustomerAndSiteRecords = async (input: { customerName: string; siteName: string; address: string }) => {
        const customerId = await onCreateCustomer({ name: input.customerName })
        let siteId: string
        try {
            siteId = await onCreateSite({ customerId, name: input.siteName, address: input.address })
        } catch (error) {
            console.error(error)
            throw new Error('The customer was created, but the site could not be created. Add the site or try again.', { cause: error })
        }
        return {
            customer: { gr_customerid: customerId, gr_name: input.customerName },
            site: { gr_siteid: siteId, gr_name: input.siteName, gr_address: input.address,
                gr_Customer: { gr_customerid: customerId, gr_name: input.customerName } },
        }
    }

    const createCustomerAndSite = async (input: { customerName: string; siteName: string; address: string }) => {
        const created = await createCustomerAndSiteRecords(input)
        const customerId = created.customer.gr_customerid
        const siteId = created.site.gr_siteid
        if (equipmentConflictsWithCustomer(customerId) || equipmentConflictsWithSite(siteId)) clearEquipment()
        setDraft((current) => ({ ...current, customerId, siteId, contactId: '' }))
        setCustomerSearch(input.customerName)
    }

    const createSite = async (input: JobSiteCreateInput) => {
        if (!draft.customerId) throw new Error('Select a customer first.')
        const siteId = await onCreateSite({ customerId: draft.customerId, ...input })
        if (equipmentConflictsWithSite(siteId)) clearEquipment()
        setDraft((current) => ({ ...current, siteId, contactId: '' }))
        setPanel('')
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
        {hideHeading ? <JobEquipmentField
            showSelectedLocation={!hasEquipmentLocation}
            value={draft.equipmentId}
            equipmentList={equipmentList}
            customerId={draft.customerId}
            siteId={draft.siteId}
            initialEquipmentDraft={initialEquipmentDraft}
            dependencyStatus={equipmentDependencyStatus}
            dependencyError={equipmentDependencyError}
            onRetryDependencies={onRetryEquipmentDependencies}
            onCreateEquipment={correctionsOnly && !allowCorrectionMasterCreation ? undefined : onCreateEquipment}
            onSearchEquipment={onSearchEquipment}
            onChange={(item) => item ? selectEquipment(item) : clearEquipment()}
            unknownEquipmentOption={unknownEquipmentOption}
        /> : <JobEquipmentAndLocationFields
            description="Selecting Equipment fills its Customer, Site and address."
            showSelectedLocation={!hasEquipmentLocation}
            value={draft.equipmentId}
            equipmentList={equipmentList}
            customerId={draft.customerId}
            siteId={draft.siteId}
            initialEquipmentDraft={initialEquipmentDraft}
            dependencyStatus={equipmentDependencyStatus}
            dependencyError={equipmentDependencyError}
            onRetryDependencies={onRetryEquipmentDependencies}
            onCreateEquipment={correctionsOnly && !allowCorrectionMasterCreation ? undefined : onCreateEquipment}
            onSearchEquipment={onSearchEquipment}
            onChange={(item) => item ? selectEquipment(item) : clearEquipment()}
            unknownEquipmentOption={unknownEquipmentOption}
        />}

        {showRelationshipFields && (hasEquipmentLocation ? <JobEquipmentLocation key={selectedEquipment.gr_equipmentid}
            equipment={selectedEquipment}
            onPendingChange={onLocationPendingChange}
            onSavingChange={onLocationSavingChange}
            onLocationChange={(row) => {
                const site = row.gr_Site
                const customer = site?.gr_Customer
                setCustomerSearch(customer?.gr_name ?? '')
                setDraft((current) => current.equipmentId !== row.gr_equipmentid ? current : ({
                    ...current, customerId: customer?.gr_customerid ?? '', siteId: site?.gr_siteid ?? '',
                    contactId: current.siteId === site?.gr_siteid ? current.contactId : '',
                }))
            }} /> : showLocationSummary ? <section className="job-equipment-location job-edit-field-wide" aria-label="Job location">
            <JobLocationSummary customer={selectedCustomer?.gr_name ?? customerSearch} site={selectedSite?.gr_name ?? ''} address={selectedSite?.gr_address ?? ''} onEdit={() => setEditingLocation(true)} />
        </section> : <div className="job-edit-field-wide">
            <JobCustomerField
                id="job-editor-customer"
                required={locationRequired}
                error={locationErrors?.customer}
                query={customerSearch}
                selectedId={draft.customerId}
                customers={customers}
                onSearchCustomers={onSearchCustomers}
                onQueryChange={setCustomerSearch}
                onClearSelection={() => setDraft((current) => ({ ...current, customerId: '', siteId: '', contactId: '' }))}
                onSelect={(selected) => {
                    const customerId = selected.gr_customerid
                    setCustomerSearch(selected.gr_name)
                    if (!correctionsOnly && equipmentConflictsWithCustomer(customerId)) clearEquipment()
                    selectCustomer(customerId)
                }}
                onCreateCustomerAndSite={correctionsOnly && !allowCorrectionMasterCreation ? undefined : createCustomerAndSite}
            />
        </div>)}

        {showRelationshipFields && !showLocationSummary && <JobSiteContactFields
            showSite={!hasEquipmentLocation}
            locationRequired={locationRequired}
            siteError={locationErrors?.site}
            addressError={locationErrors?.address}
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
                if (!correctionsOnly && equipmentConflictsWithSite(siteId)) clearEquipment()
                selectSite(siteId)
            }}
            onContactChange={(contactId) => setDraft((current) => ({ ...current, contactId }))}
            onAddSite={correctionsOnly ? undefined : () => openPanel('site')}
            onAddContact={correctionsOnly ? undefined : () => openPanel('contact')}
            onRetrySites={() => setSiteLoadAttempt((current) => current + 1)}
            onRetryContacts={() => setContactLoadAttempt((current) => current + 1)}
        />}
        {correctionsOnly && !showLocationSummary && !hasEquipmentLocation && draft.siteId && <label className="job-edit-field job-edit-field-wide"><span>Site address</span><input readOnly value={filteredSites.find((site) => site.gr_siteid === draft.siteId)?.gr_address ?? ''} /><small>The address comes from the selected Site. Correcting this Job does not edit the shared Site record or move Equipment.</small></label>}
        {panel === 'site' && <JobSiteCreatePanel key={draft.customerId} customerName={customerSearch}
            description="Create and select this Site for the job." onCreate={createSite} onCancel={() => setPanel('')} />}

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
