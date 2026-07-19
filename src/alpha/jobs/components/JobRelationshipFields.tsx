import { useMemo, useState } from 'react'
import type { Equipment } from '../types/equipment.types'
import type { useJobEditor } from '../hooks/useJobEditor'

type Props = {
    editor: ReturnType<typeof useJobEditor>
    equipmentList: Equipment[]
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: { customerId: string; name: string; address?: string }) => Promise<string>
    onCreateContact: (contact: { siteId: string; name: string; phone?: string; email?: string }) => Promise<string>
    onCreateEquipment: (equipment: { fleet: string; serial: string; make?: string; model?: string }) => Promise<string>
}

type Panel = '' | 'equipment' | 'customer' | 'site' | 'contact'

const normalizeSearch = (value?: string | null) => value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? ''
const equipmentLabel = (item: Equipment) => ({
    identifier: item.gr_fleet || (item.gr_serial ? `Serial ${item.gr_serial}` : 'Equipment'),
    model: [item.gr_make, item.gr_model].filter(Boolean).join(' '),
    location: [item.gr_Site?.gr_Customer?.gr_name, item.gr_Site?.gr_name].filter(Boolean).join(' · '),
})

export default function JobRelationshipFields({
    editor,
    equipmentList,
    onCreateCustomer,
    onCreateSite,
    onCreateContact,
    onCreateEquipment,
}: Props) {
    const {
        draft, setDraft, customerSearch, setCustomerSearch,
        customerSearchOpen, setCustomerSearchOpen, filteredCustomers,
        filteredSites, filteredContacts, selectCustomer, selectSite,
    } = editor
    const [panel, setPanel] = useState<Panel>('')
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const [createdCustomerId, setCreatedCustomerId] = useState('')
    const [equipment, setEquipment] = useState({ fleet: '', serial: '', make: '', model: '' })
    const [customer, setCustomer] = useState({ name: '', siteName: '', address: '' })
    const [site, setSite] = useState({ name: '', address: '' })
    const [contact, setContact] = useState({ name: '', phone: '', email: '' })
    const selectedEquipment = equipmentList.find((item) => item.gr_equipmentid === draft.equipmentId)
    const [equipmentSearch, setEquipmentSearch] = useState(() => selectedEquipment ? equipmentLabel(selectedEquipment).identifier : '')
    const [equipmentSearchOpen, setEquipmentSearchOpen] = useState(false)
    const [equipmentActiveIndex, setEquipmentActiveIndex] = useState(0)
    const [showLegacyEquipmentSelect] = useState(false)
    const equipmentResults = useMemo(() => {
        const query = normalizeSearch(equipmentSearch)
        return equipmentList.map((item) => {
            const identifiers = [item.gr_fleet, item.gr_serial].map(normalizeSearch)
            const details = [item.gr_make, item.gr_model, item.gr_Site?.gr_Customer?.gr_name, item.gr_Site?.gr_name, item.gr_Site?.gr_address].map(normalizeSearch)
            if (!query) {
                const score = item.gr_Site?.gr_siteid === draft.siteId ? 0 : item.gr_Site?.gr_Customer?.gr_customerid === draft.customerId ? 1 : 2
                return { item, score }
            }
            return { item, score: identifiers.some((value) => value.includes(query)) ? 0 : details.some((value) => value.includes(query)) ? 1 : 2 }
        }).filter(({ score }) => !query || score < 2).sort((a, b) => a.score - b.score || equipmentLabel(a.item).identifier.localeCompare(equipmentLabel(b.item).identifier)).slice(0, 5).map(({ item }) => item)
    }, [draft.customerId, draft.siteId, equipmentList, equipmentSearch])

    const openPanel = (nextPanel: Panel) => {
        setPanel(nextPanel)
        setCreateError('')
    }

    const selectEquipment = (item: Equipment) => {
        setDraft((current) => ({ ...current, equipmentId: item.gr_equipmentid }))
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

    const createEquipment = async () => {
        if (!equipment.fleet.trim() && !equipment.serial.trim()) {
            setCreateError('Enter a fleet or serial number.')
            return
        }
        try {
            setIsCreating(true)
            setCreateError('')
            const equipmentId = await onCreateEquipment({
                fleet: equipment.fleet.trim(), serial: equipment.serial.trim(),
                make: equipment.make.trim() || undefined,
                model: equipment.model.trim() || undefined,
            })
            setDraft((current) => ({ ...current, equipmentId }))
            setEquipment({ fleet: '', serial: '', make: '', model: '' })
            setPanel('')
        } catch (error) {
            console.error(error)
            setCreateError('Equipment could not be created.')
        } finally { setIsCreating(false) }
    }

    const createCustomerAndSite = async () => {
        if (!customer.name.trim()) return setCreateError('Enter a customer name.')
        if (!customer.siteName.trim()) return setCreateError('Enter a site name.')
        try {
            setIsCreating(true)
            setCreateError('')
            const customerId = createdCustomerId || await onCreateCustomer({ name: customer.name.trim() })
            if (!createdCustomerId) setCreatedCustomerId(customerId)
            const siteId = await onCreateSite({
                customerId, name: customer.siteName.trim(),
                address: customer.address.trim() || undefined,
            })
            setDraft((current) => ({ ...current, customerId, siteId, contactId: '' }))
            setCustomerSearch(customer.name.trim())
            setCustomer({ name: '', siteName: '', address: '' })
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
        if (!site.name.trim()) return setCreateError('Enter a site name.')
        try {
            setIsCreating(true)
            setCreateError('')
            const siteId = await onCreateSite({
                customerId: draft.customerId, name: site.name.trim(),
                address: site.address.trim() || undefined,
            })
            setDraft((current) => ({ ...current, siteId, contactId: '' }))
            setSite({ name: '', address: '' })
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

    const actions = (create: () => void, label: string) => (
        <div className="job-edit-create-actions">
            <button type="button" onClick={() => setPanel('')} disabled={isCreating}>Cancel</button>
            <button type="button" className="primary" onClick={create} disabled={isCreating}>
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
            {selectedEquipment ? <div className="job-equipment-selected"><div><strong>{equipmentLabel(selectedEquipment).identifier}</strong>{equipmentLabel(selectedEquipment).model && <small>{equipmentLabel(selectedEquipment).model}</small>}{equipmentLabel(selectedEquipment).location && <small>{equipmentLabel(selectedEquipment).location}</small>}</div><button type="button" aria-label="Change selected equipment" onClick={clearEquipment}>Change</button></div> : <><input role="combobox" aria-expanded={equipmentSearchOpen} aria-controls="job-editor-equipment-results" autoComplete="off" placeholder="Search fleet, serial, make or model..." value={equipmentSearch} onFocus={() => setEquipmentSearchOpen(true)} onChange={(event) => { setEquipmentSearch(event.target.value); setEquipmentSearchOpen(true); setEquipmentActiveIndex(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setEquipmentActiveIndex((current) => Math.min(current + 1, equipmentResults.length - 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setEquipmentActiveIndex((current) => Math.max(current - 1, 0)) } if (event.key === 'Enter' && equipmentResults[equipmentActiveIndex]) { event.preventDefault(); selectEquipment(equipmentResults[equipmentActiveIndex]) } if (event.key === 'Escape') setEquipmentSearchOpen(false) }} />{equipmentSearchOpen && <div className="job-edit-results job-equipment-results" id="job-editor-equipment-results" role="listbox"><button type="button" className="job-edit-add-result" onClick={clearEquipment}>No Equipment</button><button type="button" className="job-edit-add-result" onClick={() => { setEquipmentSearchOpen(false); openPanel('equipment') }}>+ Add new equipment</button>{equipmentResults.map((item, index) => { const label = equipmentLabel(item); return <button key={item.gr_equipmentid} type="button" role="option" aria-selected={index === equipmentActiveIndex} className={index === equipmentActiveIndex ? 'active' : ''} onMouseEnter={() => setEquipmentActiveIndex(index)} onClick={() => selectEquipment(item)}><strong>{label.identifier}</strong>{label.model && <small>{label.model}</small>}{label.location && <small>{label.location}</small>}</button> })}{equipmentSearch.trim() && equipmentResults.length === 0 && <span>No Equipment found for &quot;{equipmentSearch.trim()}&quot;</span>}</div>}</>}
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
        </label>
        {panel === 'equipment' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New equipment</h4><p>Create and select equipment for this job.</p></div>
            <label className="job-edit-field"><span>Fleet number</span><input autoFocus value={equipment.fleet} onChange={(e) => setEquipment({ ...equipment, fleet: e.target.value })} /></label>
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
                    setDraft((current) => ({ ...current, equipmentId: '', customerId: '', siteId: '', contactId: '' }))
                    setEquipmentSearch('')
                }} />
            {customerSearchOpen && <div className="job-edit-results" id="job-editor-customer-results" role="listbox">
                <button type="button" className="job-edit-add-result" onClick={() => {
                    setCustomer({ ...customer, name: customerSearch })
                    setCustomerSearchOpen(false)
                    openPanel('customer')
                }}>+ Add new customer</button>
                {filteredCustomers.map((item) => <button key={item.gr_customerid} type="button" role="option" aria-selected={item.gr_customerid === draft.customerId} onClick={() => {
                    setCustomerSearch(item.gr_name)
                    setCustomerSearchOpen(false)
                    if (selectedEquipment?.gr_Site?.gr_Customer?.gr_customerid !== item.gr_customerid) clearEquipment()
                    selectCustomer(item.gr_customerid)
                }}>{item.gr_name}</button>)}
                {filteredCustomers.length === 0 && <span>No customers found</span>}
            </div>}
        </label>
        {panel === 'customer' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New customer and site</h4><p>Create both records together and select them for this job.</p></div>
            <label className="job-edit-field"><span>Customer name</span><input autoFocus value={customer.name} onChange={(e) => { setCustomer({ ...customer, name: e.target.value }); setCreatedCustomerId('') }} /></label>
            <label className="job-edit-field"><span>Site name</span><input value={customer.siteName} onChange={(e) => setCustomer({ ...customer, siteName: e.target.value })} /></label>
            <label className="job-edit-field"><span>Site address</span><input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></label>
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            {actions(createCustomerAndSite, 'Create customer and site')}
        </div>}

        <label className="job-edit-field job-edit-field-wide"><span>Site</span>
            <select value={draft.siteId} disabled={!draft.customerId} onChange={(event) => {
                if (event.target.value === '__new__') return openPanel('site')
                if (selectedEquipment?.gr_Site?.gr_siteid !== event.target.value) clearEquipment()
                selectSite(event.target.value)
            }}>
                <option value="">{draft.customerId ? 'Select site' : 'Select a customer first'}</option>
                {draft.customerId && <option value="__new__">+ Add new site</option>}
                {filteredSites.map((item) => <option key={item.gr_siteid} value={item.gr_siteid}>{item.gr_name} — {item.gr_address}</option>)}
            </select>
        </label>
        {panel === 'site' && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New site</h4><p>Create a site for {customerSearch} and select it for this job.</p></div>
            <label className="job-edit-field"><span>Site name</span><input autoFocus value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} /></label>
            <label className="job-edit-field"><span>Site address</span><input value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} /></label>
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            {actions(createSite, 'Create site')}
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
