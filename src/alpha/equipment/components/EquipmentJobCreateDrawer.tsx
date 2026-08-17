import { useEffect } from 'react'
import type { Equipment } from '../../jobs/types/equipment.types'
import JobCreateDrawer, { type JobCreateInitialValues } from '../../jobs/components/JobCreateDrawer'
import { useJobs } from '../../jobs/hooks/useJobs'

type Props = {
    equipment: Equipment
    onClose: () => void
    onCreated: () => void | Promise<void>
}

export default function EquipmentJobCreateDrawer({ equipment, onClose, onCreated }: Props) {
    const {
        equipmentList,
        mechanics,
        sites,
        customers,
        siteContacts,
        servicePlans,
        createJob,
        createCustomer,
        createSite,
        createContactForSite,
        createEquipment,
        createScheduleOption,
        isLoading,
        loadError,
        retryInitialLoad,
        referenceDataStatus,
        referenceDataError,
        prepareJobReferenceData,
    } = useJobs()

    useEffect(() => {
        void prepareJobReferenceData().catch(() => undefined)
    }, [prepareJobReferenceData])

    const preparationError = loadError || referenceDataError
    const isPreparing = isLoading || referenceDataStatus !== 'ready'

    if (isPreparing || preparationError) {
        return <div className="equipment-job-load-overlay" role={preparationError ? 'alert' : 'status'}>
            <section>
                <strong>{preparationError ? 'Job form could not be loaded' : 'Loading job form…'}</strong>
                <p>{preparationError || 'Loading the additional Jobs data only when it is needed.'}</p>
                <div>
                    {preparationError && <button type="button" onClick={() => {
                        retryInitialLoad()
                        void prepareJobReferenceData().catch(() => undefined)
                    }}>Try again</button>}
                    <button type="button" onClick={onClose}>Cancel</button>
                </div>
            </section>
        </div>
    }

    const siteId = equipment.gr_Site?.gr_siteid ?? ''
    const contactsForSite = siteId
        ? siteContacts.filter((siteContact) => siteContact.gr_Site?.gr_siteid === siteId)
        : []
    const initialValues: JobCreateInitialValues = {
        equipmentId: equipment.gr_equipmentid,
        siteId,
        customerId: equipment.gr_Site?.gr_Customer?.gr_customerid ?? '',
        contactId: contactsForSite.length === 1 ? contactsForSite[0].gr_Contact?.gr_contactid ?? '' : '',
    }

    return <JobCreateDrawer
        mechanics={mechanics}
        equipmentList={equipmentList}
        sites={sites}
        customers={customers}
        siteContacts={siteContacts}
        servicePlans={servicePlans}
        initialValues={initialValues}
        onCreateCustomer={createCustomer}
        onCreateSite={createSite}
        onCreateContact={createContactForSite}
        onCreateEquipment={createEquipment}
        onCreateJob={async (input) => {
            const jobId = await createJob(input)
            await onCreated()
            return jobId
        }}
        onCreateScheduleOption={createScheduleOption}
        onClose={onClose}
    />
}
