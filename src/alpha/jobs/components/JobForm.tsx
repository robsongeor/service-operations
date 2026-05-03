import type { Equipment } from '../types/equipment.types'
import type { Mechanic } from '../types/mechanic.types'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'

type Props = {
    jobNumber: string
    orderNumber: string
    description: string
    equipmentSearch: string
    equipmentList: Equipment[]
    selectedEquipmentId: string

    mechanics: Mechanic[]
    selectedMechanicId: string
    onMechanicChange: (id: string) => void

    sites: Site[]
    selectedSiteId: string
    onSiteChange: (id: string) => void

    siteSearch: string
    onSiteSearchChange: (value: string) => void
    onSelectSite: (id: string, label: string) => void

    siteContacts: SiteContact[]
    selectedContactId: string
    onContactChange: (id: string) => void

    newContactName: string
    newContactPhone: string
    newContactEmail: string

    onSaveNewContact: () => void

    onNewContactNameChange: (v: string) => void
    onNewContactPhoneChange: (v: string) => void
    onNewContactEmailChange: (v: string) => void

    onJobNumberChange: (v: string) => void
    onOrderNumberChange: (v: string) => void
    onDescriptionChange: (v: string) => void
    onEquipmentSearchChange: (v: string) => void
    onSelectEquipment: (id: string, label: string) => void
    onSubmit: () => void
}

export default function JobForm(props: Props) {
    const filteredEquipment = props.equipmentList.filter((eq) => {
        const search = props.equipmentSearch.toLowerCase()

        return (
            eq.gr_fleet?.toLowerCase().includes(search) ||
            eq.gr_serial?.toLowerCase().includes(search)
        )
    })

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
                value={props.jobNumber}
                onChange={(e) => props.onJobNumberChange(e.target.value)}
            />

            <input
                placeholder="Order number"
                value={props.orderNumber}
                onChange={(e) => props.onOrderNumberChange(e.target.value)}
            />

            <input
                placeholder="Description"
                value={props.description}
                onChange={(e) => props.onDescriptionChange(e.target.value)}
            />

            <input
                placeholder="Search equipment"
                value={props.equipmentSearch}
                onChange={(e) => props.onEquipmentSearchChange(e.target.value)}
            />

            {props.equipmentSearch && (
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
                </div>
            )}

            <select
                value={props.selectedMechanicId}
                onChange={(e) => props.onMechanicChange(e.target.value)}
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
                        value={props.newContactName}
                        onChange={(e) => props.onNewContactNameChange(e.target.value)}
                    />

                    <input
                        placeholder="Contact phone"
                        value={props.newContactPhone}
                        onChange={(e) => props.onNewContactPhoneChange(e.target.value)}
                    />

                    <input
                        placeholder="Contact email"
                        value={props.newContactEmail}
                        onChange={(e) => props.onNewContactEmailChange(e.target.value)}
                    />

                    <button type="button" onClick={props.onSaveNewContact}>
                        Save new contact
                    </button>
                </div>
            )}

            <button onClick={props.onSubmit}>Create Job</button>
        </div >
    )
}