import { useEffect, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import JobForm from './components/JobForm'
import JobsTable from './components/JobsTable'

export default function JobsScreen() {
    const {
        jobs,
        equipmentList,
        mechanics,
        sites,
        siteContacts,
        createJob: createJobInDataverse,
        updateJobStatus,
        createContactForSite,
    } = useJobs()

    const [jobNumber, setJobNumber] = useState('')
    const [orderNumber, setOrderNumber] = useState('')
    const [description, setDescription] = useState('')

    const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
    const [equipmentSearch, setEquipmentSearch] = useState('')
    const [mechanic, setMechanic] = useState('')

    const [selectedSiteId, setSelectedSiteId] = useState('')

    const [selectedContactId, setSelectedContactId] = useState('')
    const [siteSearch, setSiteSearch] = useState('')

    const [newContactName, setNewContactName] = useState('')
    const [newContactPhone, setNewContactPhone] = useState('')
    const [newContactEmail, setNewContactEmail] = useState('')

    const saveNewContact = async () => {
        if (!selectedSiteId) {
            alert('Please select a site first')
            return
        }

        if (!newContactName) {
            alert('Please enter a contact name')
            return
        }

        try {
            const contactId = await createContactForSite({
                siteId: selectedSiteId,
                name: newContactName,
                phone: newContactPhone,
                email: newContactEmail,
            })

            setSelectedContactId(contactId)

            setNewContactName('')
            setNewContactPhone('')
            setNewContactEmail('')
        } catch (err) {
            console.error(err)
            alert('Failed to create contact')
        }
    }

    const createJob = async () => {
        if (!description.trim()) {
            alert('Please enter a job description')
            return
        }

        try {
            await createJobInDataverse({
                jobNumber,
                orderNumber,
                description,
                equipmentId: selectedEquipmentId || undefined,
                mechanicId: mechanic || undefined,
                siteId: selectedSiteId || undefined,
                contactId: selectedContactId || undefined,
            })

            setJobNumber('')
            setOrderNumber('')
            setDescription('')
            setSelectedEquipmentId('')
            setEquipmentSearch('')
            setMechanic('')
            setSelectedSiteId('')
            setSiteSearch('')
            setSelectedContactId('')
            setNewContactName('')
            setNewContactPhone('')
            setNewContactEmail('')
        } catch (err) {
            console.error(err)
            alert('Failed to create job')
        }
    }

    useEffect(() => {
        if (!selectedSiteId) return

        const contactsForSite = siteContacts.filter(
            (sc) => sc.gr_Site?.gr_siteid === selectedSiteId,
        )

        if (contactsForSite.length === 1) {
            const contactId = contactsForSite[0].gr_Contact?.gr_contactid

            if (contactId) {
                setSelectedContactId(contactId)
            }
        }
    }, [selectedSiteId, siteContacts])

    return (
        <div>
            <h1>Jobs</h1>
            <JobForm
                onSaveNewContact={saveNewContact}
                newContactName={newContactName}
                newContactPhone={newContactPhone}
                newContactEmail={newContactEmail}
                onNewContactNameChange={setNewContactName}
                onNewContactPhoneChange={setNewContactPhone}
                onNewContactEmailChange={setNewContactEmail}
                siteSearch={siteSearch}
                onSiteSearchChange={(value) => {
                    setSiteSearch(value)
                    setSelectedSiteId('')
                    setSelectedContactId('')
                }}
                onSelectSite={(id, label) => {
                    setSelectedSiteId(id)
                    setSiteSearch(label)
                    setSelectedContactId('')
                }}
                siteContacts={siteContacts}
                selectedContactId={selectedContactId}
                onContactChange={setSelectedContactId}
                sites={sites}
                selectedSiteId={selectedSiteId}
                onSiteChange={setSelectedSiteId}
                mechanics={mechanics}
                selectedMechanicId={mechanic}
                onMechanicChange={setMechanic}
                jobNumber={jobNumber}
                orderNumber={orderNumber}
                description={description}
                equipmentSearch={equipmentSearch}
                equipmentList={equipmentList}
                selectedEquipmentId={selectedEquipmentId}
                onJobNumberChange={setJobNumber}
                onOrderNumberChange={setOrderNumber}
                onDescriptionChange={setDescription}
                onEquipmentSearchChange={(value) => {
                    setEquipmentSearch(value)
                    setSelectedEquipmentId('')
                }}
                onSelectEquipment={(id, label) => {
                    setSelectedEquipmentId(id)
                    setEquipmentSearch(label)

                    const equipment = equipmentList.find((eq) => eq.gr_equipmentid === id)

                    if (equipment?.gr_Site?.gr_siteid) {
                        setSelectedSiteId(equipment.gr_Site.gr_siteid)
                        setSiteSearch(
                            `${equipment.gr_Site.gr_Customer?.gr_name ?? 'Unknown customer'} - ${equipment.gr_Site.gr_name}`,
                        )
                        setSelectedContactId('')
                    }
                }}
                onSubmit={createJob}
            />
            <JobsTable
                jobs={jobs}
                onStatusChange={updateJobStatus}
            />
        </div>
    )
}