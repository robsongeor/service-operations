import { useState } from 'react'
import type { Job } from '../types/job.types'
import type { Mechanic } from '../types/mechanic.types'
import type { Equipment } from '../types/equipment.types'
import type { Site } from '../types/site.types'
import type { Customer } from '../types/customer.types'
import type { SiteContact } from '../types/siteContact.types'
import { JOB_TYPES } from '../types/jobType.types'
import type { JobSaveInput } from '../types/jobSave.types'
import { useJobEditor } from '../hooks/useJobEditor'
import JobCoreFields from './JobCoreFields'
import JobRelationshipFields from './JobRelationshipFields'
import JobDrawerShell from './JobDrawerShell'
import './JobDrawer.css'

type Props = {
    job: Job
    mechanics: Mechanic[]
    equipmentList: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: {
        customerId: string
        name: string
        address?: string
    }) => Promise<string>
    onCreateContact: (contact: {
        siteId: string
        name: string
        phone?: string
        email?: string
    }) => Promise<string>
    onCreateEquipment: (equipment: {
        fleet: string
        serial: string
        make?: string
        model?: string
    }) => Promise<string>
    onSave: (jobId: string, job: JobSaveInput) => Promise<void>
    onClose: () => void
}

export default function JobEditDrawer({
    job,
    mechanics,
    equipmentList,
    sites,
    customers,
    siteContacts,
    onCreateCustomer,
    onCreateSite,
    onCreateContact,
    onCreateEquipment,
    onSave,
    onClose,
}: Props) {
    const editor = useJobEditor({
        initialDraft: {
            jobNumber: job.gr_jobnumber ?? '',
            orderNumber: job.gr_ordernumber ?? '',
            description: job.gr_description ?? '',
            jobType: job.gr_jobtype ?? JOB_TYPES.BREAKDOWN,
            mechanicId: job.gr_Mechanic?.gr_mechanicid ?? '',
            status: job.gr_status,
            equipmentId: job.gr_Equipment?.gr_equipmentid ?? '',
            customerId: job.gr_Site?.gr_Customer?.gr_customerid ?? '',
            siteId: job.gr_Site?.gr_siteid ?? '',
            contactId: job.gr_Contact?.gr_contactid ?? '',
        },
        initialCustomerSearch: job.gr_Site?.gr_Customer?.gr_name ?? '',
        customers,
        sites,
        siteContacts,
    })
    const { draft, setDraft } = editor
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const saveChanges = async () => {
        if (!draft.description.trim()) {
            setSaveError('Enter a job description before saving.')
            return
        }

        if (draft.customerId && !draft.siteId) {
            setSaveError('Select a site for the chosen customer before saving.')
            return
        }

        try {
            setIsSaving(true)
            setSaveError('')
            await onSave(job.gr_jobid, {
                jobNumber: draft.jobNumber.trim(),
                orderNumber: draft.orderNumber.trim(),
                description: draft.description.trim(),
                jobType: draft.jobType,
                status: draft.status,
                equipmentId: draft.equipmentId,
                mechanicId: draft.mechanicId,
                siteId: draft.siteId,
                contactId: draft.contactId,
            })
            onClose()
        } catch (error) {
            console.error(error)
            setSaveError('Changes could not be saved. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <JobDrawerShell
            eyebrow="Edit job"
            title={job.gr_jobnumber || 'Unnumbered job'}
            busy={isSaving}
            onClose={onClose}
            footer={
                <>
                    {saveError
                        ? <span className="job-edit-save-error" role="alert">{saveError}</span>
                        : <span>Save to update this job in Dataverse.</span>}
                    <div className="job-edit-footer-actions">
                        <button type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
                        <button
                            type="button"
                            className="primary"
                            onClick={saveChanges}
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </>
            }
        >
            <div className="job-edit-grid">
                <JobCoreFields
                    draft={draft}
                    setDraft={setDraft}
                    mechanics={mechanics}
                />

                <JobRelationshipFields
                    editor={editor}
                    equipmentList={equipmentList}
                    onCreateCustomer={onCreateCustomer}
                    onCreateSite={onCreateSite}
                    onCreateContact={onCreateContact}
                    onCreateEquipment={onCreateEquipment}
                />
            </div>
        </JobDrawerShell>
    )
}
