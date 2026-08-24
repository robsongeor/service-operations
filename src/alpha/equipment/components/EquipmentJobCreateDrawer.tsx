import { useMemo } from 'react'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Site } from '../../jobs/types/site.types'
import JobCreateDrawer, { type JobCreateInitialValues } from '../../jobs/components/JobCreateDrawer'
import { useJobs } from '../../jobs/hooks/useJobs'

type Props = {
    equipment: Equipment
    onClose: () => void
    onCreated: () => void | Promise<void>
}

export default function EquipmentJobCreateDrawer({ equipment, onClose, onCreated }: Props) {
    const scopedData = useMemo(() => ({
        jobs: [],
        equipment: [equipment],
        sites: equipment.gr_Site ? [{
            ...equipment.gr_Site,
            gr_address: equipment.gr_Site.gr_address ?? '',
        } satisfies Site] : [],
        servicePlans: [],
    }), [equipment])
    const equipmentSite = scopedData.sites[0]
    const {
        equipmentList,
        mechanics,
        mechanicsLoading,
        mechanicsError,
        retryMechanics,
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
        searchEquipmentForEditor,
        searchCustomersForEditor,
        loadCustomerSitesForEditor,
        loadSiteContactsForEditor,
        loadEquipmentForEditor,
        loadEquipmentServicePlansForEditor,
    } = useJobs({
        loadGlobalOperationalData: false,
        scopedData,
    })

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
    const drawerEquipment = equipmentList.some((item) => item.gr_equipmentid === equipment.gr_equipmentid)
        ? equipmentList
        : [equipment, ...equipmentList]
    const drawerSites = equipmentSite && !sites.some((site) => site.gr_siteid === equipmentSite.gr_siteid)
        ? [equipmentSite, ...sites]
        : sites
    const equipmentCustomer = equipment.gr_Site?.gr_Customer
    const drawerCustomers = equipmentCustomer && !customers.some((customer) => customer.gr_customerid === equipmentCustomer.gr_customerid)
        ? [equipmentCustomer, ...customers]
        : customers

    return <JobCreateDrawer
        mechanics={mechanics}
        mechanicsLoading={mechanicsLoading}
        mechanicsError={mechanicsError}
        onRetryMechanics={() => { void retryMechanics().catch(() => undefined) }}
        equipmentList={drawerEquipment}
        sites={drawerSites}
        customers={drawerCustomers}
        siteContacts={siteContacts}
        servicePlans={servicePlans}
        initialValues={initialValues}
        onCreateCustomer={createCustomer}
        onCreateSite={createSite}
        onCreateContact={createContactForSite}
        onCreateEquipment={createEquipment}
        onSearchEquipment={searchEquipmentForEditor}
        onSearchCustomers={searchCustomersForEditor}
        onLoadCustomerSites={loadCustomerSitesForEditor}
        onLoadSiteContacts={loadSiteContactsForEditor}
        onLoadEquipment={loadEquipmentForEditor}
        onLoadEquipmentServicePlans={loadEquipmentServicePlansForEditor}
        onCreateJob={async (input) => {
            const jobId = await createJob(input)
            await onCreated()
            return jobId
        }}
        onCreateScheduleOption={createScheduleOption}
        onClose={onClose}
    />
}
