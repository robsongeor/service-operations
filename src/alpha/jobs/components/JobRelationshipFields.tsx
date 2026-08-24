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
import { equipmentIdentifierSearchValues, parseAlternateFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'

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

type Panel = '' | 'equipment' | 'customer' | 'site' | 'contact'

const normalizeSearch = (value?: string | null) => value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? ''
const equipmentLabel = (item: Equipment) => ({
    identifier: item.gr_fleet || (item.gr_serial ? `Serial ${item.gr_serial}` : 'Equipment'),
    model: [item.gr_make, item.gr_model, parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).length
        ? `Also ${parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).join(' · ')}`
        : ''].filter(Boolean).join(' · '),
    location: [item.gr_Site?.gr_Customer?.gr_name, item.gr_Site?.gr_name].filter(Boolean).join(' · '),
})

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
    const initialEquipment = {
        fleet: initialEquipmentDraft?.fleet?.trim() ?? '',
        alternateFleet: initialEquipmentDraft?.alternateFleet?.trim() ?? '',
        serial: initialEquipmentDraft?.serial?.trim() ?? '',
        make: initialEquipmentDraft?.make?.trim() ?? '',
        model: initialEquipmentDraft?.model?.trim() ?? '',
    }
    const hasExactInitialFleetMatch = Boolean(initialEquipment.fleet) && equipmentList.some((item) =>
        normalizeSearch(item.gr_fleet) === normalizeSearch(initialEquipment.fleet))
    const hasExactInitialSerialMatch = Boolean(initialEquipment.serial) && equipmentList.some((item) =>
        normalizeSearch(item.gr_serial) === normalizeSearch(initialEquipment.serial))
    const initialEquipmentSearch = hasExactInitialFleetMatch
        ? initialEquipment.fleet
        : hasExactInitialSerialMatch ? initialEquipment.serial : initialEquipment.fleet || initialEquipment.serial
    const hasExactInitialEquipmentMatch = hasExactInitialFleetMatch || hasExactInitialSerialMatch
    const shouldOpenInitialEquipmentCreate = !draft.equipmentId
        && Boolean(initialEquipmentSearch)
        && !hasExactInitialEquipmentMatch
    const [panel, setPanel] = useState<Panel>(shouldOpenInitialEquipmentCreate ? 'equipment' : '')
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const [createdCustomerId, setCreatedCustomerId] = useState('')
    const [equipment, setEquipment] = useState(initialEquipment)
    const [customer, setCustomer] = useState({ name: '', siteName: '', address: '' })
    const [site, setSite] = useState({ name: '', address: '' })
    const [customerAddressSelection, setCustomerAddressSelection] = useState<VerifiedAddressSuggestion | null>(null)
    const [siteAddressSelection, setSiteAddressSelection] = useState<VerifiedAddressSuggestion | null>(null)
    const [contact, setContact] = useState({ name: '', phone: '', email: '' })
    const selectedEquipment = equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)
    const [equipmentSearch, setEquipmentSearch] = useState(() => selectedEquipment
        ? equipmentLabel(selectedEquipment).identifier
        : initialEquipmentSearch)
    const [equipmentSearchOpen, setEquipmentSearchOpen] = useState(false)
    const [equipmentActiveIndex, setEquipmentActiveIndex] = useState(0)
    const [remoteEquipmentResults, setRemoteEquipmentResults] = useState<Equipment[]>([])
    const [remoteCustomerResults, setRemoteCustomerResults] = useState<Customer[]>([])
    const [equipmentSearchStatus, setEquipmentSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [customerSearchStatus, setCustomerSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [siteLoadStatus, setSiteLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [siteLoadError, setSiteLoadError] = useState('')
    const [siteLoadAttempt, setSiteLoadAttempt] = useState(0)
    const [contactLoadStatus, setContactLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [contactLoadError, setContactLoadError] = useState('')
    const [contactLoadAttempt, setContactLoadAttempt] = useState(0)
    const equipmentRemoteQueryActive = equipmentSearch.trim().length >= 2
    const customerRemoteQueryActive = customerSearch.trim().length >= 2
    const visibleEquipmentSearchStatus = equipmentRemoteQueryActive ? equipmentSearchStatus : 'idle'
    const visibleCustomerSearchStatus = customerRemoteQueryActive ? customerSearchStatus : 'idle'
    const [showLegacyEquipmentSelect] = useState(false)
    const equipmentConflictsWithCustomer = (customerId: string) => {
        const equipmentCustomerId = selectedEquipment?.gr_Site?.gr_Customer?.gr_customerid
        return Boolean(equipmentCustomerId && equipmentCustomerId !== customerId)
    }
    const equipmentConflictsWithSite = (siteId: string) => {
        const equipmentSiteId = selectedEquipment?.gr_Site?.gr_siteid
        return Boolean(equipmentSiteId && equipmentSiteId !== siteId)
    }
    const equipmentResults = useMemo(() => {
        const query = normalizeSearch(equipmentSearch)
        const records = new Map(equipmentList.map((item) => [item.gr_equipmentid.toLowerCase(), item]))
        if (equipmentRemoteQueryActive) remoteEquipmentResults.forEach((item) => records.set(item.gr_equipmentid.toLowerCase(), item))
        return [...records.values()].map((item) => {
            const identifiers = equipmentIdentifierSearchValues(item).map(normalizeSearch)
            const details = [item.gr_make, item.gr_model, item.gr_Site?.gr_Customer?.gr_name, item.gr_Site?.gr_name, item.gr_Site?.gr_address].map(normalizeSearch)
            if (!query) {
                const score = item.gr_Site?.gr_siteid === draft.siteId ? 0 : item.gr_Site?.gr_Customer?.gr_customerid === draft.customerId ? 1 : 2
                return { item, score }
            }
            return { item, score: identifiers.some((value) => value.includes(query)) ? 0 : details.some((value) => value.includes(query)) ? 1 : 2 }
        }).filter(({ score }) => !query || score < 2).sort((a, b) => a.score - b.score || equipmentLabel(a.item).identifier.localeCompare(equipmentLabel(b.item).identifier)).slice(0, 5).map(({ item }) => item)
    }, [draft.customerId, draft.siteId, equipmentList, equipmentRemoteQueryActive, equipmentSearch, remoteEquipmentResults])

    const customerResults = useMemo(() => {
        const records = new Map(filteredCustomers.map((item) => [item.gr_customerid.toLowerCase(), item]))
        if (customerRemoteQueryActive) remoteCustomerResults.forEach((item) => records.set(item.gr_customerid.toLowerCase(), item))
        return [...records.values()].slice(0, 8)
    }, [customerRemoteQueryActive, filteredCustomers, remoteCustomerResults])

    useEffect(() => {
        if (!equipmentSearchOpen || !onSearchEquipment) return
        const query = equipmentSearch.trim()
        if (query.length < 2) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setEquipmentSearchStatus('loading')
            void onSearchEquipment(query, { customerId: draft.customerId || undefined, siteId: draft.siteId || undefined }, controller.signal)
                .then((rows) => {
                    if (!controller.signal.aborted) {
                        setRemoteEquipmentResults(rows)
                        setEquipmentSearchStatus('idle')
                    }
                })
                .catch((error) => {
                    if (!controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) setEquipmentSearchStatus('error')
                })
        }, 250)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [draft.customerId, draft.siteId, equipmentSearch, equipmentSearchOpen, onSearchEquipment])

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
            setEquipmentSearch(equipmentLabel(selectedEquipment).identifier)
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
        setEquipmentSearch(equipmentLabel(item).identifier)
        setEquipmentSearchOpen(false)
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
        setEquipmentSearch('')
        setEquipmentSearchOpen(false)
    }

    const openNewEquipmentPanel = () => {
        setEquipment((current) => ({ ...current, fleet: equipmentSearch.trim() }))
        setEquipmentSearchOpen(false)
        openPanel('equipment')
    }

    const createEquipment = async () => {
        if (!equipment.fleet.trim() && !equipment.alternateFleet.trim() && !equipment.serial.trim()) {
            setCreateError('Enter a primary fleet, alternate fleet, or serial number.')
            return
        }
        try {
            setIsCreating(true)
            setCreateError('')
            const equipmentId = await onCreateEquipment({
                fleet: equipment.fleet.trim(),
                alternateFleet: equipment.alternateFleet.trim() || undefined,
                serial: equipment.serial.trim(),
                make: equipment.make.trim() || undefined,
                model: equipment.model.trim() || undefined,
            })
            setDraft((current) => ({ ...current, equipmentId }))
            setEquipmentSearch(equipment.fleet.trim() || equipment.alternateFleet.trim() || (equipment.serial.trim() ? `Serial ${equipment.serial.trim()}` : 'Equipment'))
            setEquipment({ fleet: '', alternateFleet: '', serial: '', make: '', model: '' })
            setPanel('')
        } catch (error) {
            console.error(error)
            setCreateError('Equipment could not be created.')
        } finally { setIsCreating(false) }
    }

    const createCustomerAndSite = async () => {
        if (!customer.name.trim()) return setCreateError('Enter a customer name.')
        if (!customerAddressSelection || customerAddressSelection.formattedAddress !== customer.address) return setCreateError('Select a verified address from the Geoapify suggestions.')
        const siteName = customer.siteName.trim() || deriveSiteNameFromAddress(customer.address)
        if (!siteName) return setCreateError('Enter a Site Name, or an Address that can be used to generate one.')
        try {
            setIsCreating(true)
            setCreateError('')
            const customerId = createdCustomerId || await onCreateCustomer({ name: customer.name.trim() })
            if (!createdCustomerId) setCreatedCustomerId(customerId)
            const siteId = await onCreateSite({
                customerId, name: siteName,
                address: customer.address.trim() || undefined,
            })
            if (equipmentConflictsWithCustomer(customerId) || equipmentConflictsWithSite(siteId)) clearEquipment()
            setDraft((current) => ({ ...current, customerId, siteId, contactId: '' }))
            setCustomerSearch(customer.name.trim())
            setCustomer({ name: '', siteName: '', address: '' })
            setCustomerAddressSelection(null)
            setCreatedCustomerId('')
            setPanel('')
        } catch (error) {
            console.error(error)
            setCreateError(createdCustomerId
                ? 'The customer exists, but the site could not be created. Try again.'
                : 'The customer or site could not be created.')
        } finally { setIsCreating(false) }
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

        <label className="job-edit-field job-edit-field-wide job-edit-combobox">
            <span>Equipment</span>
            {selectedEquipment ? <div className="job-equipment-selected"><div><strong>{equipmentLabel(selectedEquipment).identifier}</strong>{equipmentLabel(selectedEquipment).model && <small>{equipmentLabel(selectedEquipment).model}</small>}{equipmentLabel(selectedEquipment).location && <small>{equipmentLabel(selectedEquipment).location}</small>}</div><button type="button" aria-label="Change selected equipment" onClick={clearEquipment}>Change</button></div> : <><input role="combobox" aria-expanded={equipmentSearchOpen} aria-controls="job-editor-equipment-results" autoComplete="off" placeholder="Search primary or alternate fleet, serial, make or model..." value={equipmentSearch} onFocus={() => setEquipmentSearchOpen(true)} onChange={(event) => { setEquipmentSearch(event.target.value); setEquipmentSearchOpen(true); setEquipmentActiveIndex(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setEquipmentActiveIndex((current) => Math.min(current + 1, equipmentResults.length - 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setEquipmentActiveIndex((current) => Math.max(current - 1, 0)) } if (event.key === 'Enter' && equipmentResults[equipmentActiveIndex]) { event.preventDefault(); selectEquipment(equipmentResults[equipmentActiveIndex]) } if (event.key === 'Escape') setEquipmentSearchOpen(false) }} />{equipmentSearchOpen && <div className="job-edit-results job-equipment-results" id="job-editor-equipment-results" role="listbox"><button type="button" className="job-edit-add-result" onClick={clearEquipment}>No Equipment</button><button type="button" className="job-edit-add-result" onClick={openNewEquipmentPanel}>+ Add new equipment</button>{equipmentResults.map((item, index) => { const label = equipmentLabel(item); return <button key={item.gr_equipmentid} type="button" role="option" aria-selected={index === equipmentActiveIndex} className={index === equipmentActiveIndex ? 'active' : ''} onMouseEnter={() => setEquipmentActiveIndex(index)} onClick={() => selectEquipment(item)}><strong>{label.identifier}</strong>{label.model && <small>{label.model}</small>}{label.location && <small>{label.location}</small>}</button> })}{visibleEquipmentSearchStatus === 'loading' && <span>Searching Equipment…</span>}{visibleEquipmentSearchStatus === 'error' && <span>Equipment search is temporarily unavailable.</span>}{visibleEquipmentSearchStatus !== 'loading' && equipmentSearch.trim() && equipmentResults.length === 0 && <span>No Equipment found for &quot;{equipmentSearch.trim()}&quot;</span>}</div>}</>}
            {showLegacyEquipmentSelect && <select value={draft.equipmentId} onChange={(event) => {
                if (event.target.value === '__new__') return openPanel('equipment')

                const equipmentId = event.target.value
                const selectedEquipment = equipmentList.find(
                    (item) => item.gr_equipmentid === equipmentId,
                )
                setDraft((current) => ({ ...current, equipmentId }))

                const equipmentSite = selectedEquipment?.gr_Site
                const equipmentCustomer = equipmentSite?.gr_Customer

                if (equipmentSite && equipmentCustomer) {
                    setCustomerSearch(equipmentCustomer.gr_name)
                    setCustomerSearchOpen(false)
                    selectCustomer(equipmentCustomer.gr_customerid)
                    selectSite(equipmentSite.gr_siteid)
                }
            }}>
                <option value="">No equipment</option>
                <option value="__new__">+ Add new equipment</option>
                {equipmentList.map((item) => <option key={item.gr_equipmentid} value={item.gr_equipmentid}>
                    {item.gr_fleet || 'No fleet'} — {item.gr_make} {item.gr_model} — {item.gr_serial}
                </option>)}
            </select>}
            {draft.equipmentId && equipmentDependencyStatus === 'loading' && <small role="status">Refreshing selected Equipment details…</small>}
            {draft.equipmentId && equipmentDependencyStatus === 'error' && <small className="job-edit-field-error" role="alert">
                Selected Equipment details are temporarily unavailable. {equipmentDependencyError} {onRetryEquipmentDependencies && <button type="button" onClick={onRetryEquipmentDependencies}>Try again</button>}
            </small>}
        </label>
        {panel === 'equipment' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New equipment</h4><p>{initialEquipmentSearch ? 'Prefilled from the invoice. Confirm the details before creating and selecting this equipment.' : 'Create and select equipment for this job.'}</p></div>
            <label className="job-edit-field"><span>Fleet number</span><input autoFocus value={equipment.fleet} onChange={(e) => setEquipment({ ...equipment, fleet: e.target.value })} /></label>
            <label className="job-edit-field"><span>Alternate fleet number</span><input value={equipment.alternateFleet} onChange={(e) => setEquipment({ ...equipment, alternateFleet: e.target.value })} /></label>
            <label className="job-edit-field"><span>Serial number</span><input value={equipment.serial} onChange={(e) => setEquipment({ ...equipment, serial: e.target.value })} /></label>
            <label className="job-edit-field"><span>Make</span><input value={equipment.make} onChange={(e) => setEquipment({ ...equipment, make: e.target.value })} /></label>
            <label className="job-edit-field"><span>Model</span><input value={equipment.model} onChange={(e) => setEquipment({ ...equipment, model: e.target.value })} /></label>
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            {actions(createEquipment, 'Create equipment')}
        </div>}

        <label className="job-edit-field job-edit-field-wide job-edit-combobox">
            <span>Customer</span>
            <input role="combobox" aria-expanded={customerSearchOpen} aria-controls="job-editor-customer-results" autoComplete="off" placeholder="Search customers" value={customerSearch}
                onFocus={() => setCustomerSearchOpen(true)} onChange={(event) => {
                    setCustomerSearch(event.target.value)
                    setCustomerSearchOpen(true)
                    setDraft((current) => ({ ...current, customerId: '', siteId: '', contactId: '' }))
                }} />
            {customerSearchOpen && <div className="job-edit-results" id="job-editor-customer-results" role="listbox">
                <button type="button" className="job-edit-add-result" onClick={() => {
                    setCustomer({ ...customer, name: customerSearch })
                    setCustomerSearchOpen(false)
                    openPanel('customer')
                }}>+ Add new customer</button>
                {customerResults.map((item) => <button key={item.gr_customerid} type="button" role="option" aria-selected={item.gr_customerid === draft.customerId} onClick={() => {
                    setCustomerSearch(item.gr_name)
                    setCustomerSearchOpen(false)
                    if (equipmentConflictsWithCustomer(item.gr_customerid)) clearEquipment()
                    selectCustomer(item.gr_customerid)
                }}>{item.gr_name}</button>)}
                {visibleCustomerSearchStatus === 'loading' && <span>Searching customers…</span>}
                {visibleCustomerSearchStatus === 'error' && <span>Customer search is temporarily unavailable.</span>}
                {visibleCustomerSearchStatus !== 'loading' && customerResults.length === 0 && <span>No customers found</span>}
            </div>}
        </label>
        {panel === 'customer' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New customer and site</h4><p>Create both records together and select them for this job.</p></div>
            <label className="job-edit-field"><span>Customer name</span><input autoFocus value={customer.name} onChange={(e) => { setCustomer({ ...customer, name: e.target.value }); setCreatedCustomerId('') }} /></label>
            <label className="job-edit-field"><span>Site name</span><input value={customer.siteName} onChange={(e) => setCustomer({ ...customer, siteName: e.target.value })} /></label>
            <VerifiedAddressField value={customer.address} onChange={(address, selection) => { const previousDerived = deriveSiteNameFromAddress(customer.address); const nextDerived = selection?.siteName || deriveSiteNameFromAddress(address); setCustomerAddressSelection(selection); setCreateError(''); setCustomer({ ...customer, address, siteName: !customer.siteName.trim() || customer.siteName === previousDerived ? nextDerived : customer.siteName }) }} />
            {customer.siteName && customer.siteName === deriveSiteNameFromAddress(customer.address) && <p>Site Name generated from address.</p>}
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            {actions(createCustomerAndSite, 'Create customer and site', !customerAddressSelection || customerAddressSelection.formattedAddress !== customer.address)}
        </div>}

        <label className="job-edit-field job-edit-field-wide"><span>Site</span>
            <select value={draft.siteId} disabled={!draft.customerId} onChange={(event) => {
                if (event.target.value === '__new__') return openPanel('site')
                if (equipmentConflictsWithSite(event.target.value)) clearEquipment()
                selectSite(event.target.value)
            }}>
                <option value="">{draft.customerId ? 'Select site' : 'Select a customer first'}</option>
                {draft.customerId && <option value="__new__">+ Add new site</option>}
                {filteredSites.map((item) => <option key={item.gr_siteid} value={item.gr_siteid}>{item.gr_name} — {item.gr_address}</option>)}
            </select>
            {draft.customerId && siteLoadStatus === 'loading' && <small role="status">Loading Sites for this Customer…</small>}
            {draft.customerId && siteLoadStatus === 'error' && <small className="job-edit-field-error" role="alert">
                Sites are temporarily unavailable. {siteLoadError} <button type="button" onClick={() => setSiteLoadAttempt((current) => current + 1)}>Try again</button>
            </small>}
        </label>
        {panel === 'site' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New site</h4><p>Create a site for {customerSearch} and select it for this job.</p></div>
            <label className="job-edit-field"><span>Site name</span><input autoFocus value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} /></label>
            <VerifiedAddressField value={site.address} onChange={(address, selection) => { const previousDerived = deriveSiteNameFromAddress(site.address); const nextDerived = selection?.siteName || deriveSiteNameFromAddress(address); setSiteAddressSelection(selection); setCreateError(''); setSite({ ...site, address, name: !site.name.trim() || site.name === previousDerived ? nextDerived : site.name }) }} />
            {site.name && site.name === deriveSiteNameFromAddress(site.address) && <p>Site Name generated from address.</p>}
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            {actions(createSite, 'Create site', !siteAddressSelection || siteAddressSelection.formattedAddress !== site.address)}
        </div>}

        <label className="job-edit-field job-edit-field-wide"><span>Contact</span>
            <select value={draft.contactId} disabled={!draft.siteId} onChange={(event) => {
                if (event.target.value === '__new__') return openPanel('contact')
                setDraft((current) => ({ ...current, contactId: event.target.value }))
            }}>
                <option value="">{draft.siteId ? 'No contact' : 'Select a site first'}</option>
                {draft.siteId && <option value="__new__">+ Add new contact</option>}
                {filteredContacts.map((item) => <option key={item.gr_sitecontactid} value={item.gr_Contact?.gr_contactid ?? ''}>
                    {item.gr_Contact?.gr_name}{item.gr_Contact?.gr_phone ? ` — ${item.gr_Contact.gr_phone}` : ''}
                </option>)}
            </select>
            {draft.siteId && contactLoadStatus === 'loading' && <small role="status">Loading Contacts for this Site…</small>}
            {draft.siteId && contactLoadStatus === 'error' && <small className="job-edit-field-error" role="alert">
                Site Contacts are temporarily unavailable. {contactLoadError} <button type="button" onClick={() => setContactLoadAttempt((current) => current + 1)}>Try again</button>
            </small>}
        </label>
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
