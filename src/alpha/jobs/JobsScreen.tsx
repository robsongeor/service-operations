import { useState } from 'react'
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
    } = useJobs()

    const [jobNumber, setJobNumber] = useState('')
    const [orderNumber, setOrderNumber] = useState('')
    const [description, setDescription] = useState('')

    const [selectedEquipmentId, setSelectedEquipmentId] = useState('')
    const [equipmentSearch, setEquipmentSearch] = useState('')
    const [mechanic, setMechanic] = useState('')

    const [selectedSiteId, setSelectedSiteId] = useState('')

    const [selectedContactId, setSelectedContactId] = useState('')

    const createJob = async () => {
        if (!jobNumber || !description) {
            alert('Please enter a job number and description')
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
        } catch (err) {
            console.error(err)
            alert('Failed to create job')
        }
    }

    return (
        <div>
            <h1>Jobs</h1>
            <JobForm
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

                    const eq = equipmentList.find((e) => e.gr_equipmentid === id)

                    if (eq?.gr_Site?.gr_siteid) {
                        setSelectedSiteId(eq.gr_Site.gr_siteid)
                    }
                }}
                onSubmit={createJob}
            />
            <JobsTable jobs={jobs} />
        </div>
    )
}