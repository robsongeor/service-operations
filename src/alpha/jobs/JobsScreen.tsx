import { useEffect, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import JobForm from './components/JobForm'
import JobsTable from './components/JobsTable'
import { emailJobToMechanic } from './services/jobEmail'

export default function JobsScreen() {
    const {
        jobs,
        equipmentList,
        mechanics,
        sites,
        siteContacts,
        createJob: createJobInDataverse,
        updateJobStatus,
        updateJobFields,
        createContactForSite,
        createEquipment,
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

    const [newEquipmentFleet, setNewEquipmentFleet] = useState('')
    const [newEquipmentSerial, setNewEquipmentSerial] = useState('')
    const [newEquipmentMake, setNewEquipmentMake] = useState('')
    const [newEquipmentModel, setNewEquipmentModel] = useState('')

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

    const [visibleStatuses, setVisibleStatuses] = useState<number[]>([
        122830001, // Unallocated
        122830000, // Allocated
        122830002, // Waiting
        122830003, // Complete
    ])

    const toggleStatus = (status: number) => {
        setVisibleStatuses((prev) =>
            prev.includes(status)
                ? prev.filter((s) => s !== status)
                : [...prev, status]
        )
    }

    const filteredJobs = jobs.filter((job) =>
        visibleStatuses.includes(job.gr_status)
    )


    return (
        <div>
            <h1>Jobs</h1>
            <JobForm
                onAddNewEquipment={() => {
                    setSelectedEquipmentId('__new__')
                }}
                newEquipmentFleet={newEquipmentFleet}
                newEquipmentSerial={newEquipmentSerial}
                newEquipmentMake={newEquipmentMake}
                newEquipmentModel={newEquipmentModel}

                onNewEquipmentFleetChange={setNewEquipmentFleet}
                onNewEquipmentSerialChange={setNewEquipmentSerial}
                onNewEquipmentMakeChange={setNewEquipmentMake}
                onNewEquipmentModelChange={setNewEquipmentModel}

                onSaveNewEquipment={async () => {
                    const newId = await createEquipment({
                        fleet: newEquipmentFleet,
                        serial: newEquipmentSerial,
                        make: newEquipmentMake,
                        model: newEquipmentModel,
                    })

                    setSelectedEquipmentId(newId)
                }}

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
                jobs={filteredJobs}
                visibleStatuses={visibleStatuses}
                onToggleStatus={toggleStatus}
                onStatusChange={updateJobStatus}
                onJobFieldsChange={updateJobFields}
                onEmailJob={emailJobToMechanic}
                mechanics={mechanics}
            />
        </div>
    )
}