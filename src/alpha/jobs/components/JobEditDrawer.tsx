import { useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import type { Equipment } from '../types/equipment.types'
import type { Site } from '../types/site.types'
import type { Customer } from '../types/customer.types'
import type { SiteContact } from '../types/siteContact.types'
import { JOB_TYPES, JOB_TYPE_OPTIONS, type JobType } from '../types/jobType.types'
import type { JobUpdate } from '../services/jobsApi'
import './JobEditDrawer.css'

type Props = {
    job: Job
    mechanics: Mechanic[]
    equipmentList: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: {
        customerId: string
        name: string
        address?: string
    }) => Promise<string>
    onCreateContact: (contact: {
        siteId: string
        name: string
        phone?: string
        email?: string
    }) => Promise<string>
    onCreateEquipment: (equipment: {
        fleet: string
        serial: string
        make?: string
        model?: string
    }) => Promise<string>
    onSave: (jobId: string, job: JobUpdate) => Promise<void>
    onClose: () => void
}

const statusOptions = [
    { label: 'Unallocated', value: 122830001 },
    { label: 'Allocated', value: 122830000 },
    { label: 'Waiting for parts', value: 122830002 },
    { label: 'Complete', value: 122830003 },
]

export default function JobEditDrawer({
    job,
    mechanics,
    equipmentList,
    sites,
    customers,
    siteContacts,
    onCreateCustomer,
    onCreateSite,
    onCreateContact,
    onCreateEquipment,
    onSave,
    onClose,
}: Props) {
    const [draft, setDraft] = useState({
        jobNumber: job.gr_jobnumber,
        orderNumber: job.gr_ordernumber,
        description: job.gr_description,
        jobType: job.gr_jobtype ?? JOB_TYPES.BREAKDOWN,
        mechanicId: job.gr_Mechanic?.gr_mechanicid ?? '',
        status: job.gr_status,
        equipmentId: job.gr_Equipment?.gr_equipmentid ?? '',
        customerId: job.gr_Site?.gr_Customer?.gr_customerid ?? '',
        siteId: job.gr_Site?.gr_siteid ?? '',
        contactId: job.gr_Contact?.gr_contactid ?? '',
    })
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [customerSearch, setCustomerSearch] = useState(
        job.gr_Site?.gr_Customer?.gr_name ?? '',
    )
    const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
    const [showNewCustomer, setShowNewCustomer] = useState(false)
    const [newCustomerName, setNewCustomerName] = useState('')
    const [newCustomerSiteName, setNewCustomerSiteName] = useState('')
    const [newCustomerSiteAddress, setNewCustomerSiteAddress] = useState('')
    const [createdCustomerId, setCreatedCustomerId] = useState('')
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
    const [customerCreateError, setCustomerCreateError] = useState('')
    const [showNewSite, setShowNewSite] = useState(false)
    const [newSiteName, setNewSiteName] = useState('')
    const [newSiteAddress, setNewSiteAddress] = useState('')
    const [isCreatingSite, setIsCreatingSite] = useState(false)
    const [siteCreateError, setSiteCreateError] = useState('')
    const [showNewContact, setShowNewContact] = useState(false)
    const [newContactName, setNewContactName] = useState('')
    const [newContactPhone, setNewContactPhone] = useState('')
    const [newContactEmail, setNewContactEmail] = useState('')
    const [isCreatingContact, setIsCreatingContact] = useState(false)
    const [contactCreateError, setContactCreateError] = useState('')
    const [showNewEquipment, setShowNewEquipment] = useState(false)
    const [newEquipmentFleet, setNewEquipmentFleet] = useState('')
    const [newEquipmentSerial, setNewEquipmentSerial] = useState('')
    const [newEquipmentMake, setNewEquipmentMake] = useState('')
    const [newEquipmentModel, setNewEquipmentModel] = useState('')
    const [isCreatingEquipment, setIsCreatingEquipment] = useState(false)
    const [equipmentCreateError, setEquipmentCreateError] = useState('')

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

    const createNewCustomerAndSite = async () => {
        const customerName = newCustomerName.trim()
        const siteName = newCustomerSiteName.trim()

        if (!customerName) {
            setCustomerCreateError('Enter a customer name.')
            return
        }

        if (!siteName) {
            setCustomerCreateError('Enter a site name.')
            return
        }

        try {
            setIsCreatingCustomer(true)
            setCustomerCreateError('')

            const customerId = createdCustomerId || await onCreateCustomer({
                name: customerName,
            })

            if (!createdCustomerId) {
                setCreatedCustomerId(customerId)
            }

            const siteId = await onCreateSite({
                customerId,
                name: siteName,
                address: newCustomerSiteAddress.trim() || undefined,
            })

            setDraft((current) => ({
                ...current,
                customerId,
                siteId,
                contactId: '',
            }))
            setCustomerSearch(customerName)
            setNewCustomerName('')
            setNewCustomerSiteName('')
            setNewCustomerSiteAddress('')
            setCreatedCustomerId('')
            setShowNewCustomer(false)
        } catch (error) {
            console.error(error)
            setCustomerCreateError(
                createdCustomerId
                    ? 'The customer exists, but the site could not be created. Try again.'
                    : 'The customer or site could not be created.',
            )
        } finally {
            setIsCreatingCustomer(false)
        }
    }

    const createNewSite = async () => {
        const name = newSiteName.trim()

        if (!draft.customerId) {
            setSiteCreateError('Select a customer first.')
            return
        }

        if (!name) {
            setSiteCreateError('Enter a site name.')
            return
        }

        try {
            setIsCreatingSite(true)
            setSiteCreateError('')

            const siteId = await onCreateSite({
                customerId: draft.customerId,
                name,
                address: newSiteAddress.trim() || undefined,
            })

            setDraft((current) => ({
                ...current,
                siteId,
                contactId: '',
            }))
            setNewSiteName('')
            setNewSiteAddress('')
            setShowNewSite(false)
        } catch (error) {
            console.error(error)
            setSiteCreateError('Site could not be created.')
        } finally {
            setIsCreatingSite(false)
        }
    }

    const createNewContact = async () => {
        const name = newContactName.trim()

        if (!draft.siteId) {
            setContactCreateError('Select a site first.')
            return
        }

        if (!name) {
            setContactCreateError('Enter a contact name.')
            return
        }

        try {
            setIsCreatingContact(true)
            setContactCreateError('')

            const contactId = await onCreateContact({
                siteId: draft.siteId,
                name,
                phone: newContactPhone.trim() || undefined,
                email: newContactEmail.trim() || undefined,
            })

            setDraft((current) => ({
                ...current,
                contactId,
            }))
            setNewContactName('')
            setNewContactPhone('')
            setNewContactEmail('')
            setShowNewContact(false)
        } catch (error) {
            console.error(error)
            setContactCreateError('Contact could not be created.')
        } finally {
            setIsCreatingContact(false)
        }
    }

    const createNewEquipment = async () => {
        const fleet = newEquipmentFleet.trim()
        const serial = newEquipmentSerial.trim()

        if (!fleet && !serial) {
            setEquipmentCreateError('Enter a fleet or serial number.')
            return
        }

        try {
            setIsCreatingEquipment(true)
            setEquipmentCreateError('')

            const equipmentId = await onCreateEquipment({
                fleet,
                serial,
                make: newEquipmentMake.trim() || undefined,
                model: newEquipmentModel.trim() || undefined,
            })

            setDraft((current) => ({
                ...current,
                equipmentId,
            }))
            setNewEquipmentFleet('')
            setNewEquipmentSerial('')
            setNewEquipmentMake('')
            setNewEquipmentModel('')
            setShowNewEquipment(false)
        } catch (error) {
            console.error(error)
            setEquipmentCreateError('Equipment could not be created.')
        } finally {
            setIsCreatingEquipment(false)
        }
    }

    const saveChanges = async () => {
        if (!draft.description.trim()) {
            setSaveError('Enter a job description before saving.')
            return
        }

        if (draft.customerId && !draft.siteId) {
            setSaveError('Select a site for the chosen customer before saving.')
            return
        }

        try {
            setIsSaving(true)
            setSaveError('')
            await onSave(job.gr_jobid, {
                jobNumber: draft.jobNumber.trim(),
                orderNumber: draft.orderNumber.trim(),
                description: draft.description.trim(),
                jobType: draft.jobType,
                status: draft.status,
                equipmentId: draft.equipmentId,
                mechanicId: draft.mechanicId,
                siteId: draft.siteId,
                contactId: draft.contactId,
            })
            onClose()
        } catch (error) {
            console.error(error)
            setSaveError('Changes could not be saved. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div
            className="job-edit-backdrop"
            role="presentation"
            onMouseDown={() => {
                if (!isSaving) onClose()
            }}
        >
            <aside
                className="job-edit-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="job-edit-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="job-edit-header">
                    <div>
                        <p>Edit job</p>
                        <h2 id="job-edit-title">{job.gr_jobnumber || 'Unnumbered job'}</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close edit job drawer">×</button>
                </header>

                <div className="job-edit-body">
                    <div className="job-edit-grid">
                        <label className="job-edit-field">
                            <span>Job type</span>
                            <select
                                value={draft.jobType}
                                onChange={(event) => setDraft((current) => ({
                                    ...current,
                                    jobType: Number(event.target.value) as JobType,
                                }))}
                            >
                                {JOB_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="job-edit-field">
                            <span>Status</span>
                            <select
                                value={draft.status}
                                onChange={(event) => setDraft((current) => ({
                                    ...current,
                                    status: Number(event.target.value),
                                }))}
                            >
                                {statusOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="job-edit-field">
                            <span>Job number</span>
                            <input
                                value={draft.jobNumber}
                                onChange={(event) => setDraft((current) => ({
                                    ...current,
                                    jobNumber: event.target.value,
                                }))}
                            />
                        </label>

                        <label className="job-edit-field">
                            <span>Order number</span>
                            <input
                                value={draft.orderNumber}
                                onChange={(event) => setDraft((current) => ({
                                    ...current,
                                    orderNumber: event.target.value,
                                }))}
                            />
                        </label>

                        <label className="job-edit-field job-edit-field-wide">
                            <span>Description</span>
                            <textarea
                                rows={5}
                                value={draft.description}
                                onChange={(event) => setDraft((current) => ({
                                    ...current,
                                    description: event.target.value,
                                }))}
                            />
                        </label>

                        <label className="job-edit-field job-edit-field-wide">
                            <span>Mechanic</span>
                            <select
                                value={draft.mechanicId}
                                onChange={(event) => setDraft((current) => ({
                                    ...current,
                                    mechanicId: event.target.value,
                                }))}
                            >
                                <option value="">Unassigned</option>
                                {mechanics.map((mechanic) => (
                                    <option key={mechanic.gr_mechanicid} value={mechanic.gr_mechanicid}>
                                        {mechanic.gr_name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="job-edit-divider job-edit-field-wide">
                            <h3>Equipment and location</h3>
                            <p>Change which records this job references.</p>
                        </div>

                        <label className="job-edit-field job-edit-field-wide">
                            <span>Equipment</span>
                            <select
                                value={draft.equipmentId}
                                onChange={(event) => {
                                    if (event.target.value === '__new__') {
                                        setShowNewEquipment(true)
                                        setEquipmentCreateError('')
                                        return
                                    }

                                    setDraft((current) => ({
                                        ...current,
                                        equipmentId: event.target.value,
                                    }))
                                }}
                            >
                                <option value="">No equipment</option>
                                <option value="__new__">+ Add new equipment</option>
                                {equipmentList.map((equipment) => (
                                    <option key={equipment.gr_equipmentid} value={equipment.gr_equipmentid}>
                                        {equipment.gr_fleet || 'No fleet'} — {equipment.gr_make} {equipment.gr_model} — {equipment.gr_serial}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {showNewEquipment && (
                            <div className="job-edit-create-panel job-edit-field-wide">
                                <div>
                                    <h4>New equipment</h4>
                                    <p>Create and select equipment for this job.</p>
                                </div>
                                <label className="job-edit-field">
                                    <span>Fleet number</span>
                                    <input
                                        autoFocus
                                        value={newEquipmentFleet}
                                        onChange={(event) => setNewEquipmentFleet(event.target.value)}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Serial number</span>
                                    <input
                                        value={newEquipmentSerial}
                                        onChange={(event) => setNewEquipmentSerial(event.target.value)}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Make</span>
                                    <input
                                        value={newEquipmentMake}
                                        onChange={(event) => setNewEquipmentMake(event.target.value)}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Model</span>
                                    <input
                                        value={newEquipmentModel}
                                        onChange={(event) => setNewEquipmentModel(event.target.value)}
                                    />
                                </label>
                                {equipmentCreateError && (
                                    <p className="job-edit-error" role="alert">{equipmentCreateError}</p>
                                )}
                                <div className="job-edit-create-actions">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewEquipment(false)}
                                        disabled={isCreatingEquipment}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="primary"
                                        onClick={createNewEquipment}
                                        disabled={isCreatingEquipment}
                                    >
                                        {isCreatingEquipment ? 'Creating...' : 'Create equipment'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <label className="job-edit-field job-edit-field-wide job-edit-combobox">
                            <span>Customer</span>
                            <input
                                role="combobox"
                                aria-expanded={customerSearchOpen}
                                aria-controls="job-edit-customer-results"
                                autoComplete="off"
                                placeholder="Search customers"
                                value={customerSearch}
                                onFocus={() => setCustomerSearchOpen(true)}
                                onChange={(event) => {
                                    setCustomerSearch(event.target.value)
                                    setCustomerSearchOpen(true)
                                    setDraft((current) => ({
                                        ...current,
                                        customerId: '',
                                        siteId: '',
                                        contactId: '',
                                    }))
                                }}
                            />

                            {customerSearchOpen && (
                                <div className="job-edit-results" id="job-edit-customer-results" role="listbox">
                                    <button
                                        type="button"
                                        className="job-edit-add-result"
                                        onClick={() => {
                                            setNewCustomerName(customerSearch)
                                            setCustomerSearchOpen(false)
                                            setShowNewCustomer(true)
                                            setCustomerCreateError('')
                                        }}
                                    >
                                        + Add new customer
                                    </button>
                                    {filteredCustomers.map((customer) => (
                                        <button
                                            key={customer.gr_customerid}
                                            type="button"
                                            role="option"
                                            aria-selected={customer.gr_customerid === draft.customerId}
                                            onClick={() => {
                                                setCustomerSearch(customer.gr_name)
                                                setCustomerSearchOpen(false)
                                                selectCustomer(customer.gr_customerid)
                                            }}
                                        >
                                            {customer.gr_name}
                                        </button>
                                    ))}
                                    {filteredCustomers.length === 0 && (
                                        <span>No customers found</span>
                                    )}
                                </div>
                            )}
                        </label>

                        {showNewCustomer && (
                            <div className="job-edit-create-panel job-edit-field-wide">
                                <div>
                                    <h4>New customer and site</h4>
                                    <p>Create both records together and select them for this job.</p>
                                </div>
                                <label className="job-edit-field">
                                    <span>Customer name</span>
                                    <input
                                        autoFocus
                                        value={newCustomerName}
                                        onChange={(event) => {
                                            setNewCustomerName(event.target.value)
                                            setCreatedCustomerId('')
                                        }}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Site name</span>
                                    <input
                                        value={newCustomerSiteName}
                                        onChange={(event) => setNewCustomerSiteName(event.target.value)}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Site address</span>
                                    <input
                                        value={newCustomerSiteAddress}
                                        onChange={(event) => setNewCustomerSiteAddress(event.target.value)}
                                    />
                                </label>
                                {customerCreateError && (
                                    <p className="job-edit-error" role="alert">{customerCreateError}</p>
                                )}
                                <div className="job-edit-create-actions">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewCustomer(false)}
                                        disabled={isCreatingCustomer}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="primary"
                                        onClick={createNewCustomerAndSite}
                                        disabled={isCreatingCustomer}
                                    >
                                        {isCreatingCustomer ? 'Creating...' : 'Create customer and site'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <label className="job-edit-field job-edit-field-wide">
                            <span>Site</span>
                            <select
                                value={draft.siteId}
                                disabled={!draft.customerId}
                                onChange={(event) => {
                                    if (event.target.value === '__new__') {
                                        setShowNewSite(true)
                                        setSiteCreateError('')
                                        return
                                    }

                                    selectSite(event.target.value)
                                }}
                            >
                                <option value="">
                                    {draft.customerId ? 'Select site' : 'Select a customer first'}
                                </option>
                                {draft.customerId && (
                                    <option value="__new__">+ Add new site</option>
                                )}
                                {filteredSites.map((site) => (
                                    <option key={site.gr_siteid} value={site.gr_siteid}>
                                        {site.gr_name} — {site.gr_address}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {showNewSite && (
                            <div className="job-edit-create-panel job-edit-field-wide">
                                <div>
                                    <h4>New site</h4>
                                    <p>Create a site for {customerSearch} and select it for this job.</p>
                                </div>
                                <label className="job-edit-field">
                                    <span>Site name</span>
                                    <input
                                        autoFocus
                                        value={newSiteName}
                                        onChange={(event) => setNewSiteName(event.target.value)}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Site address</span>
                                    <input
                                        value={newSiteAddress}
                                        onChange={(event) => setNewSiteAddress(event.target.value)}
                                    />
                                </label>
                                {siteCreateError && (
                                    <p className="job-edit-error" role="alert">{siteCreateError}</p>
                                )}
                                <div className="job-edit-create-actions">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewSite(false)}
                                        disabled={isCreatingSite}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="primary"
                                        onClick={createNewSite}
                                        disabled={isCreatingSite}
                                    >
                                        {isCreatingSite ? 'Creating...' : 'Create site'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <label className="job-edit-field job-edit-field-wide">
                            <span>Contact</span>
                            <select
                                value={draft.contactId}
                                disabled={!draft.siteId}
                                onChange={(event) => {
                                    if (event.target.value === '__new__') {
                                        setShowNewContact(true)
                                        setContactCreateError('')
                                        return
                                    }

                                    setDraft((current) => ({
                                        ...current,
                                        contactId: event.target.value,
                                    }))
                                }}
                            >
                                <option value="">
                                    {draft.siteId ? 'No contact' : 'Select a site first'}
                                </option>
                                {draft.siteId && (
                                    <option value="__new__">+ Add new contact</option>
                                )}
                                {filteredContacts.map((siteContact) => (
                                    <option
                                        key={siteContact.gr_sitecontactid}
                                        value={siteContact.gr_Contact?.gr_contactid ?? ''}
                                    >
                                        {siteContact.gr_Contact?.gr_name}
                                        {siteContact.gr_Contact?.gr_phone
                                            ? ` — ${siteContact.gr_Contact.gr_phone}`
                                            : ''}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {showNewContact && (
                            <div className="job-edit-create-panel job-edit-field-wide">
                                <div>
                                    <h4>New contact</h4>
                                    <p>Create and select a contact for the chosen site.</p>
                                </div>
                                <label className="job-edit-field">
                                    <span>Contact name</span>
                                    <input
                                        autoFocus
                                        value={newContactName}
                                        onChange={(event) => setNewContactName(event.target.value)}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Phone</span>
                                    <input
                                        type="tel"
                                        value={newContactPhone}
                                        onChange={(event) => setNewContactPhone(event.target.value)}
                                    />
                                </label>
                                <label className="job-edit-field">
                                    <span>Email</span>
                                    <input
                                        type="email"
                                        value={newContactEmail}
                                        onChange={(event) => setNewContactEmail(event.target.value)}
                                    />
                                </label>
                                {contactCreateError && (
                                    <p className="job-edit-error" role="alert">{contactCreateError}</p>
                                )}
                                <div className="job-edit-create-actions">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewContact(false)}
                                        disabled={isCreatingContact}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="primary"
                                        onClick={createNewContact}
                                        disabled={isCreatingContact}
                                    >
                                        {isCreatingContact ? 'Creating...' : 'Create contact'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <footer className="job-edit-footer">
                    {saveError
                        ? <span className="job-edit-save-error" role="alert">{saveError}</span>
                        : <span>Save to update this job in Dataverse.</span>}
                    <div className="job-edit-footer-actions">
                        <button type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
                        <button
                            type="button"
                            className="primary"
                            onClick={saveChanges}
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </footer>
            </aside>
        </div>
    )
}
