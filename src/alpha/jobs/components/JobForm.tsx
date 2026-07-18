import type { Equipment } from '../types/equipment.types'
import type { Mechanic } from '../types/mechanic.types'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'
import type { Customer } from '../types/customer.types'
import { JOB_TYPE_OPTIONS, type JobType } from '../types/jobType.types'
import './JobForm.css'

type Props = {
    jobForm: {
        jobNumber: string
        orderNumber: string
        description: string
        jobType: JobType
        selectedMechanicId: string
        onJobNumberChange: (v: string) => void
        onOrderNumberChange: (v: string) => void
        onDescriptionChange: (v: string) => void
        onJobTypeChange: (jobType: JobType) => void
        onMechanicChange: (id: string) => void
    }
    contactForm: {
        name: string
        phone: string
        email: string
        onNameChange: (v: string) => void
        onPhoneChange: (v: string) => void
        onEmailChange: (v: string) => void
        onSave: () => void
    }
    equipmentForm: {
        fleet: string
        serial: string
        make: string
        model: string
        onFleetChange: (v: string) => void
        onSerialChange: (v: string) => void
        onMakeChange: (v: string) => void
        onModelChange: (v: string) => void
    }
    siteForm: {
        customerId: string
        customerName: string
        name: string
        address: string
        onCustomerChange: (id: string) => void
        onCustomerNameChange: (v: string) => void
        onNameChange: (v: string) => void
        onAddressChange: (v: string) => void
    }
    equipmentSearch: string
    equipmentList: Equipment[]
    selectedEquipmentId: string
    sites: Site[]
    customers: Customer[]
    selectedSiteId: string
    siteSearch: string
    onSiteSearchChange: (value: string) => void
    onSelectSite: (id: string, label: string) => void
    onAddNewSite: () => void
    onSaveNewSite: () => void
    siteContacts: SiteContact[]
    selectedContactId: string
    onContactChange: (id: string) => void
    mechanics: Mechanic[]
    onEquipmentSearchChange: (v: string) => void
    onSelectEquipment: (id: string, label: string) => void
    onSubmit: () => void
    onAddNewEquipment: () => void
    onSaveNewEquipment: () => void
}

export default function JobForm(props: Props) {
    const filteredEquipment = props.equipmentList
        .filter((equipment) => {
            const search = props.equipmentSearch.toLowerCase()
            return (
                equipment.gr_fleet?.toLowerCase().includes(search) ||
                equipment.gr_serial?.toLowerCase().includes(search)
            )
        })
        .slice(0, 5)

    const filteredSiteContacts = props.siteContacts.filter(
        (siteContact) => siteContact.gr_Site?.gr_siteid === props.selectedSiteId,
    )

    const filteredSites = props.sites.filter((site) => {
        const search = props.siteSearch.toLowerCase()
        return (
            site.gr_name.toLowerCase().includes(search) ||
            site.gr_Customer?.gr_name.toLowerCase().includes(search)
        )
    })

    return (
        <div className="job-form-card">
            <div className="job-form-header">
                <div>
                    <p className="job-form-eyebrow">New work order</p>
                    <h2>Create job</h2>
                </div>
                <span className="job-form-required">* Required</span>
            </div>

            <section className="job-form-section">
                <div className="job-form-section-heading">
                    <span>1</span>
                    <div>
                        <h3>Job details</h3>
                        <p>Identify and describe the work.</p>
                    </div>
                </div>

                <div className="job-form-grid job-form-grid-three">
                    <label className="job-form-field">
                        <span>Job type *</span>
                        <select
                            value={props.jobForm.jobType}
                            onChange={(event) =>
                                props.jobForm.onJobTypeChange(Number(event.target.value) as JobType)
                            }
                        >
                            {JOB_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="job-form-field">
                        <span>Job number</span>
                        <input
                            placeholder="e.g. 143687"
                            value={props.jobForm.jobNumber}
                            onChange={(event) => props.jobForm.onJobNumberChange(event.target.value)}
                        />
                    </label>

                    <label className="job-form-field">
                        <span>Order number</span>
                        <input
                            placeholder="Optional"
                            value={props.jobForm.orderNumber}
                            onChange={(event) => props.jobForm.onOrderNumberChange(event.target.value)}
                        />
                    </label>

                    <label className="job-form-field">
                        <span>Mechanic</span>
                        <select
                            value={props.jobForm.selectedMechanicId}
                            onChange={(event) => props.jobForm.onMechanicChange(event.target.value)}
                        >
                            <option value="">Unassigned</option>
                            {props.mechanics.map((mechanic) => (
                                <option key={mechanic.gr_mechanicid} value={mechanic.gr_mechanicid}>
                                    {mechanic.gr_name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="job-form-field job-form-field-wide">
                        <span>Description *</span>
                        <textarea
                            rows={3}
                            placeholder="Describe the fault, request, or work required"
                            value={props.jobForm.description}
                            onChange={(event) => props.jobForm.onDescriptionChange(event.target.value)}
                        />
                    </label>
                </div>
            </section>

            <section className="job-form-section">
                <div className="job-form-section-heading">
                    <span>2</span>
                    <div>
                        <h3>Equipment</h3>
                        <p>Optional for site-wide, charger, pickup, or delivery jobs.</p>
                    </div>
                </div>

                <label className="job-form-field">
                    <span>Equipment search</span>
                    <input
                        placeholder="Search by fleet or serial number"
                        value={props.equipmentSearch}
                        onChange={(event) => props.onEquipmentSearchChange(event.target.value)}
                    />
                </label>

                {props.equipmentSearch.trim().length > 0 && (
                    <div className="job-form-results">
                        {filteredEquipment.map((equipment) => (
                            <button
                                key={equipment.gr_equipmentid}
                                type="button"
                                onClick={() =>
                                    props.onSelectEquipment(
                                        equipment.gr_equipmentid,
                                        `${equipment.gr_fleet} - ${equipment.gr_serial}`,
                                    )
                                }
                            >
                                <strong>{equipment.gr_fleet || 'No fleet number'}</strong>
                                <span>{equipment.gr_make} {equipment.gr_model} · {equipment.gr_serial}</span>
                            </button>
                        ))}
                        <button type="button" className="job-form-add-result" onClick={props.onAddNewEquipment}>
                            + Add new equipment
                        </button>
                    </div>
                )}

                {props.selectedEquipmentId === '__new__' && (
                    <div className="job-form-subpanel">
                        <h4>New equipment</h4>
                        <div className="job-form-grid job-form-grid-two">
                            <label className="job-form-field"><span>Fleet number</span><input value={props.equipmentForm.fleet} onChange={(event) => props.equipmentForm.onFleetChange(event.target.value)} /></label>
                            <label className="job-form-field"><span>Serial number</span><input value={props.equipmentForm.serial} onChange={(event) => props.equipmentForm.onSerialChange(event.target.value)} /></label>
                            <label className="job-form-field"><span>Make</span><input value={props.equipmentForm.make} onChange={(event) => props.equipmentForm.onMakeChange(event.target.value)} /></label>
                            <label className="job-form-field"><span>Model</span><input value={props.equipmentForm.model} onChange={(event) => props.equipmentForm.onModelChange(event.target.value)} /></label>
                        </div>
                        <button type="button" className="job-form-secondary-button" onClick={props.onSaveNewEquipment}>Save equipment</button>
                    </div>
                )}
            </section>

            <section className="job-form-section">
                <div className="job-form-section-heading">
                    <span>3</span>
                    <div>
                        <h3>Location and contact</h3>
                        <p>Select where the work is taking place and who to contact.</p>
                    </div>
                </div>

                <label className="job-form-field">
                    <span>Site</span>
                    <input
                        placeholder="Search by customer or site name"
                        value={props.siteSearch}
                        onChange={(event) => props.onSiteSearchChange(event.target.value)}
                    />
                </label>

                {props.siteSearch && (
                    <div className="job-form-results">
                        {filteredSites.map((site) => (
                            <button
                                key={site.gr_siteid}
                                type="button"
                                onClick={() =>
                                    props.onSelectSite(
                                        site.gr_siteid,
                                        `${site.gr_Customer?.gr_name ?? 'Unknown customer'} - ${site.gr_name}`,
                                    )
                                }
                            >
                                <strong>{site.gr_Customer?.gr_name ?? 'Unknown customer'}</strong>
                                <span>{site.gr_name} · {site.gr_address}</span>
                            </button>
                        ))}
                        <button type="button" className="job-form-add-result" onClick={props.onAddNewSite}>+ Add new site</button>
                    </div>
                )}

                {props.selectedSiteId === '__new__' && (
                    <div className="job-form-subpanel">
                        <h4>New site</h4>
                        <div className="job-form-grid job-form-grid-two">
                            <label className="job-form-field">
                                <span>Customer *</span>
                                <select value={props.siteForm.customerId} onChange={(event) => props.siteForm.onCustomerChange(event.target.value)}>
                                    <option value="">Select customer</option>
                                    {props.customers.map((customer) => (
                                        <option key={customer.gr_customerid} value={customer.gr_customerid}>{customer.gr_name}</option>
                                    ))}
                                    <option value="__new__">+ Add new customer</option>
                                </select>
                            </label>
                            {props.siteForm.customerId === '__new__' && (
                                <label className="job-form-field">
                                    <span>New customer name *</span>
                                    <input value={props.siteForm.customerName} onChange={(event) => props.siteForm.onCustomerNameChange(event.target.value)} />
                                </label>
                            )}
                            <label className="job-form-field"><span>Site name *</span><input value={props.siteForm.name} onChange={(event) => props.siteForm.onNameChange(event.target.value)} /></label>
                            <label className="job-form-field"><span>Site address</span><input value={props.siteForm.address} onChange={(event) => props.siteForm.onAddressChange(event.target.value)} /></label>
                        </div>
                        <button type="button" className="job-form-secondary-button" onClick={props.onSaveNewSite}>Save site</button>
                    </div>
                )}

                <label className="job-form-field">
                    <span>Contact</span>
                    <select
                        value={props.selectedContactId}
                        onChange={(event) => props.onContactChange(event.target.value)}
                        disabled={!props.selectedSiteId || props.selectedSiteId === '__new__'}
                    >
                        <option value="">
                            {props.selectedSiteId && props.selectedSiteId !== '__new__' ? 'Select contact (optional)' : 'Save or select a site first'}
                        </option>
                        {filteredSiteContacts.map((siteContact) => (
                            <option key={siteContact.gr_sitecontactid} value={siteContact.gr_Contact?.gr_contactid ?? ''}>
                                {siteContact.gr_Contact?.gr_name}
                            </option>
                        ))}
                        <option value="__new__">+ Add new contact</option>
                    </select>
                </label>

                {props.selectedContactId === '__new__' && (
                    <div className="job-form-subpanel">
                        <h4>New contact</h4>
                        <div className="job-form-grid job-form-grid-three">
                            <label className="job-form-field"><span>Name *</span><input value={props.contactForm.name} onChange={(event) => props.contactForm.onNameChange(event.target.value)} /></label>
                            <label className="job-form-field"><span>Phone</span><input type="tel" value={props.contactForm.phone} onChange={(event) => props.contactForm.onPhoneChange(event.target.value)} /></label>
                            <label className="job-form-field"><span>Email</span><input type="email" value={props.contactForm.email} onChange={(event) => props.contactForm.onEmailChange(event.target.value)} /></label>
                        </div>
                        <button type="button" className="job-form-secondary-button" onClick={props.contactForm.onSave}>Save contact</button>
                    </div>
                )}
            </section>

            <div className="job-form-actions">
                <p>Job type and description are required.</p>
                <button type="button" className="job-form-primary-button" onClick={props.onSubmit}>Create job</button>
            </div>
        </div>
    )
}
