import { useMemo, useState } from 'react'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Site } from '../../jobs/types/site.types'
import JobCreateDrawer, { type JobCreateInitialValues } from '../../jobs/components/JobCreateDrawer'
import JobEditDrawer from '../../jobs/components/JobEditDrawer'
import type { Job } from '../../jobs/types/job.types'
import { useJobs } from '../../jobs/hooks/useJobs'

type Props = {
    equipment: Equipment
    initialContactId?: string
    onClose: () => void
    onCreated: () => void | Promise<void>
}

export default function EquipmentJobCreateDrawer({ equipment, initialContactId, onClose, onCreated }: Props) {
    const [createdJob, setCreatedJob] = useState<Job | null>(null)
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
        scheduleOptions,
        officeUpdates,
        createJob,
        updateJob,
        deleteJob,
        updateJobCardStatus,
        sendPrimaryJobEmail,
        sendAssignmentJobEmail,
        createJobAssignment,
        deleteJobAssignment,
        createCustomer,
        createSite,
        createContactForSite,
        createEquipment,
        createScheduleOption,
        updateScheduleOption,
        deleteScheduleOption,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        searchEquipmentForEditor,
        searchCustomersForEditor,
        loadCustomerSitesForEditor,
        loadSiteContactsForEditor,
        loadEquipmentForEditor,
        loadEquipmentServicePlansForEditor,
        loadJobQuotes,
        loadJobAssignments,
        fetchJobForDrawer,
        fetchJobCardDetails,
        fetchJobPhotoBody,
        referenceDataStatus,
        referenceDataError,
        prepareJobReferenceData,
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
        contactId: initialContactId
            || (contactsForSite.length === 1 ? contactsForSite[0].gr_Contact?.gr_contactid ?? '' : ''),
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

    const sharedProps = {
        mechanics,
        mechanicsLoading,
        mechanicsError,
        onRetryMechanics: () => { void retryMechanics().catch(() => undefined) },
        equipmentList: drawerEquipment,
        sites: drawerSites,
        customers: drawerCustomers,
        siteContacts,
        servicePlans,
        onCreateCustomer: createCustomer,
        onCreateSite: createSite,
        onCreateContact: createContactForSite,
        onCreateEquipment: createEquipment,
        onSearchEquipment: searchEquipmentForEditor,
        onSearchCustomers: searchCustomersForEditor,
        onLoadCustomerSites: loadCustomerSitesForEditor,
        onLoadSiteContacts: loadSiteContactsForEditor,
        onLoadEquipment: loadEquipmentForEditor,
        onLoadEquipmentServicePlans: loadEquipmentServicePlansForEditor,
    }

    if (createdJob) return <JobEditDrawer
        {...sharedProps}
        job={createdJob}
        scheduleOptions={scheduleOptions.filter((option) => option._gr_job_value.toLowerCase() === createdJob.gr_jobid.toLowerCase())}
        onSave={updateJob}
        onDelete={deleteJob}
        onCreateScheduleOption={createScheduleOption}
        onUpdateScheduleOption={updateScheduleOption}
        onDeleteScheduleOption={deleteScheduleOption}
        onCreateQuote={() => undefined}
        onOpenQuote={() => undefined}
        onJobCardStatusChange={updateJobCardStatus}
        onCreateAssignment={createJobAssignment}
        onSendPrimary={sendPrimaryJobEmail}
        onSendAssignment={sendAssignmentJobEmail}
        onDeleteAssignment={deleteJobAssignment}
        officeUpdates={officeUpdates.filter((update) => update.jobId.toLowerCase() === createdJob.gr_jobid.toLowerCase())}
        onCreateOfficeUpdate={createJobOfficeUpdate}
        onSaveOfficeAttention={updateJobOfficeAttention}
        referenceDataStatus={referenceDataStatus}
        referenceDataError={referenceDataError}
        onPrepareReferenceData={prepareJobReferenceData}
        onLoadJobQuotes={loadJobQuotes}
        onLoadJobAssignments={loadJobAssignments}
        onRefreshJob={fetchJobForDrawer}
        onLoadJobCardDetails={fetchJobCardDetails}
        onLoadJobPhoto={fetchJobPhotoBody}
        onClose={onClose}
    />

    return <JobCreateDrawer
        {...sharedProps}
        initialValues={initialValues}
        onCreateJob={createJob}
        closeAfterCreate={false}
        onCreated={async (jobId) => {
            const refreshed = await fetchJobForDrawer(jobId)
            if (!refreshed) throw new Error('The Job was created, but its edit view could not be loaded.')
            setCreatedJob(refreshed)
            await onCreated()
        }}
        onCreateScheduleOption={createScheduleOption}
        onClose={onClose}
    />
}
