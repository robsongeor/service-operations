import type { Equipment } from '../types/equipment.types'
import type { Mechanic } from '../types/mechanic.types'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'

type Props = {


    jobForm: {
        jobNumber: string
        orderNumber: string
        description: string
        selectedMechanicId: string
        onJobNumberChange: (v: string) => void
        onOrderNumberChange: (v: string) => void
        onDescriptionChange: (v: string) => void
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
    equipmentSearch: string
    equipmentList: Equipment[]
    selectedEquipmentId: string
    sites: Site[]
    selectedSiteId: string
    siteSearch: string
    onSiteSearchChange: (value: string) => void
    onSelectSite: (id: string, label: string) => void
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
        .filter((eq) => {
            const search = props.equipmentSearch.toLowerCase()

            return (
                eq.gr_fleet?.toLowerCase().includes(search) ||
                eq.gr_serial?.toLowerCase().includes(search)
            )
        })
        .slice(0, 5)

    const filteredSiteContacts = props.siteContacts.filter(
        (sc) => sc.gr_Site?.gr_siteid === props.selectedSiteId,
    )

    const filteredSites = props.sites.filter((site) => {
        const search = props.siteSearch.toLowerCase()

        return (
            site.gr_name.toLowerCase().includes(search) ||
            site.gr_Customer?.gr_name.toLowerCase().includes(search)
        )
    })

    return (
        <div>
            <input
                placeholder="Job number"
                value={props.jobForm.jobNumber}
                onChange={(e) => props.jobForm.onJobNumberChange(e.target.value)}
            />

            <input
                placeholder="Order number"
                value={props.jobForm.orderNumber}
                onChange={(e) => props.jobForm.onOrderNumberChange(e.target.value)}
            />

            <input
                placeholder="Description"
                value={props.jobForm.description}
                onChange={(e) => props.jobForm.onDescriptionChange(e.target.value)}
            />

            <input
                placeholder="Search equipment"
                value={props.equipmentSearch}
                onChange={(e) => props.onEquipmentSearchChange(e.target.value)}
            />

            {props.equipmentSearch.trim().length > 0 && (
                <div>
                    {filteredEquipment.map((eq) => (
                        <button
                            key={eq.gr_equipmentid}
                            type="button"
                            onClick={() =>
                                props.onSelectEquipment(
                                    eq.gr_equipmentid,
                                    `${eq.gr_fleet} - ${eq.gr_serial}`,
                                )
                            }
                        >
                            {eq.gr_fleet} - {eq.gr_make} {eq.gr_model} - {eq.gr_serial}
                        </button>
                    ))}

                    <button
                        type="button"
                        onClick={props.onAddNewEquipment}
                    >
                        ➕ Add new equipment
                    </button>
                </div>
            )}

            {props.selectedEquipmentId === '__new__' && (
                <div>
                    <input
                        placeholder="Fleet number"
                        value={props.equipmentForm.fleet}
                        onChange={(e) => props.equipmentForm.onFleetChange(e.target.value)}
                    />

                    <input
                        placeholder="Serial number"
                        value={props.equipmentForm.serial}
                        onChange={(e) => props.equipmentForm.onSerialChange(e.target.value)}
                    />

                    <input
                        placeholder="Make"
                        value={props.equipmentForm.make}
                        onChange={(e) => props.equipmentForm.onMakeChange(e.target.value)}
                    />

                    <input
                        placeholder="Model"
                        value={props.equipmentForm.model}
                        onChange={(e) => props.equipmentForm.onModelChange(e.target.value)}
                    />

                    <button type="button" onClick={props.onSaveNewEquipment}>
                        Save new equipment
                    </button>
                </div>
            )}

            <select
                value={props.jobForm.selectedMechanicId}
                onChange={(e) => props.jobForm.onMechanicChange(e.target.value)}
            >
                <option value="">Select mechanic (optional)</option>

                {props.mechanics.map((mechanic) => (
                    <option key={mechanic.gr_mechanicid} value={mechanic.gr_mechanicid}>
                        {mechanic.gr_name}
                    </option>
                ))}
            </select>

            <input
                placeholder="Search site"
                value={props.siteSearch}
                onChange={(e) => props.onSiteSearchChange(e.target.value)}
            />

            {props.siteSearch && (
                <div>
                    {filteredSites.map((site) => (
                        <button
                            key={site.gr_siteid}
                            onClick={() =>
                                props.onSelectSite(
                                    site.gr_siteid,
                                    `${site.gr_Customer?.gr_name ?? 'Unknown customer'} - ${site.gr_name}`,
                                )
                            }
                        >
                            {site.gr_Customer?.gr_name} - {site.gr_name}
                        </button>
                    ))}
                </div>
            )
            }

            <select
                value={props.selectedContactId}
                onChange={(e) => props.onContactChange(e.target.value)}
                disabled={!props.selectedSiteId}
            >
                <option value="">
                    {props.selectedSiteId ? 'Select contact (optional)' : 'Select a site first'}
                </option>

                {filteredSiteContacts.map((sc) => (
                    <option
                        key={sc.gr_sitecontactid}
                        value={sc.gr_Contact?.gr_contactid ?? ''}
                    >
                        {sc.gr_Contact?.gr_name}
                    </option>

                ))}

                <option value="__new__">➕ Add new contact</option>
            </select>

            {props.selectedContactId === '__new__' && (
                <div>
                    <input
                        placeholder="Contact name"
                        value={props.contactForm.name}
                        onChange={(e) => props.contactForm.onNameChange(e.target.value)}
                    />

                    <input
                        placeholder="Contact phone"
                        value={props.contactForm.phone}
                        onChange={(e) => props.contactForm.onPhoneChange(e.target.value)}
                    />

                    <input
                        placeholder="Contact email"
                        value={props.contactForm.email}
                        onChange={(e) => props.contactForm.onEmailChange(e.target.value)}
                    />

                    <button type="button" onClick={props.contactForm.onSave}>
                        Save new contact
                    </button>
                </div>
            )}

            <button onClick={props.onSubmit}>Create Job</button>
        </div >
    )
}