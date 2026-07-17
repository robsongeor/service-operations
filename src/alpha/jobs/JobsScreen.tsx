import { useEffect, useState } from 'react'
import { useJobs } from './hooks/useJobs'
import JobForm from './components/JobForm'
import JobsTable from './components/JobsTable'
import { emailJobToMechanic } from './services/jobEmail'
import { JOB_TYPES, type JobType } from './types/jobType.types'

export default function JobsScreen() {
    const {
        jobs,
        equipmentList,
        mechanics,
        sites,
        customers,
        siteContacts,
        createJob: createJobInDataverse,
        updateJobStatus,
        updateJobFields,
        createContactForSite,
        createEquipment,
        createSite,
        createCustomer,
    } = useJobs()

    const [jobNumber, setJobNumber] = useState('')
    const [orderNumber, setOrderNumber] = useState('')
    const [description, setDescription] = useState('')
    const [jobType, setJobType] = useState<JobType>(JOB_TYPES.BREAKDOWN)

    const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
    const [equipmentSearch, setEquipmentSearch] = useState('')
    const [mechanic, setMechanic] = useState('')

    const [selectedSiteId, setSelectedSiteId] = useState('')
    const [selectedCustomerId, setSelectedCustomerId] = useState('')
    const [newCustomerName, setNewCustomerName] = useState('')

    const [selectedContactId, setSelectedContactId] = useState('')
    const [siteSearch, setSiteSearch] = useState('')
    const [newSiteName, setNewSiteName] = useState('')
    const [newSiteAddress, setNewSiteAddress] = useState('')

    const [newContactName, setNewContactName] = useState('')
    const [newContactPhone, setNewContactPhone] = useState('')
    const [newContactEmail, setNewContactEmail] = useState('')

    const [newEquipmentFleet, setNewEquipmentFleet] = useState('')
    const [newEquipmentSerial, setNewEquipmentSerial] = useState('')
    const [newEquipmentMake, setNewEquipmentMake] = useState('')
    const [newEquipmentModel, setNewEquipmentModel] = useState('')

    const jobForm = {
        jobNumber,
        orderNumber,
        description,
        jobType,
        selectedMechanicId: mechanic,
        onJobNumberChange: setJobNumber,
        onOrderNumberChange: setOrderNumber,
        onDescriptionChange: setDescription,
        onJobTypeChange: setJobType,
        onMechanicChange: setMechanic,
    }

    const equipmentForm = {
        fleet: newEquipmentFleet,
        serial: newEquipmentSerial,
        make: newEquipmentMake,
        model: newEquipmentModel,
        onFleetChange: setNewEquipmentFleet,
        onSerialChange: setNewEquipmentSerial,
        onMakeChange: setNewEquipmentMake,
        onModelChange: setNewEquipmentModel,
    }

    const siteForm = {
        customerId: selectedCustomerId,
        customerName: newCustomerName,

        name: newSiteName,
        address: newSiteAddress,
        onCustomerChange: setSelectedCustomerId,
        onCustomerNameChange: setNewCustomerName,
        onNameChange: setNewSiteName,
        onAddressChange: setNewSiteAddress,
    }

    const saveNewSite = async () => {
        if (!selectedCustomerId) {
            alert('Please select a customer')
            return
        }
        if (
            selectedCustomerId === '__new__' &&
            !newCustomerName.trim()
        ) {
            alert('Please enter a customer name')
            return
        }
        if (!newSiteName.trim()) {
            alert('Please enter a site name')
            return
        }

        try {
            let customerId = selectedCustomerId

            if (customerId === '__new__') {
                customerId = await createCustomer({
                    name: newCustomerName.trim(),
                })

                setSelectedCustomerId(customerId)
            }
            const siteId = await createSite({
                customerId,
                name: newSiteName,
                address: newSiteAddress || undefined,
            })

            setSelectedSiteId(siteId)
            setSiteSearch(newSiteName.trim())
            setNewSiteName('')
            setNewSiteAddress('')
            setSelectedContactId('')
            setSelectedCustomerId('')
            setNewCustomerName('')
        } catch (err) {
            console.error(err)
            alert('Failed to create site')
        }
    }

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

    const contactForm = {
        name: newContactName,
        phone: newContactPhone,
        email: newContactEmail,
        onNameChange: setNewContactName,
        onPhoneChange: setNewContactPhone,
        onEmailChange: setNewContactEmail,
        onSave: saveNewContact,
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
            setNewSiteName('')
            setNewSiteAddress('')
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
                jobForm={jobForm}
                equipmentForm={equipmentForm}
                siteForm={siteForm}
                contactForm={contactForm}
                onAddNewEquipment={() => {
                    setSelectedEquipmentId('__new__')
                }}
                onSaveNewEquipment={async () => {
                    const newId = await createEquipment({
                        fleet: newEquipmentFleet,
                        serial: newEquipmentSerial,
                        make: newEquipmentMake,
                        model: newEquipmentModel,
                    })

                    setSelectedEquipmentId(newId)
                }}
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
                onAddNewSite={() => {
                    setSelectedSiteId('__new__')
                    setSelectedContactId('')
                }}
                onSaveNewSite={saveNewSite}
                siteContacts={siteContacts}
                selectedContactId={selectedContactId}
                onContactChange={setSelectedContactId}
                sites={sites}
                customers={customers}
                selectedSiteId={selectedSiteId}
                mechanics={mechanics}
                equipmentSearch={equipmentSearch}
                equipmentList={equipmentList}
                selectedEquipmentId={selectedEquipmentId}
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
