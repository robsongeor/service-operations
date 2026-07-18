import { useState } from 'react'
import type { Mechanic } from '../types/mechanic.types'
import type { Equipment } from '../types/equipment.types'
import type { Site } from '../types/site.types'
import type { Customer } from '../types/customer.types'
import type { SiteContact } from '../types/siteContact.types'
import { JOB_TYPES } from '../types/jobType.types'
import { JOB_STATUSES } from '../types/jobStatus.types'
import type { JobSaveInput } from '../types/jobSave.types'
import { useJobEditor } from '../hooks/useJobEditor'
import JobDrawerShell from './JobDrawerShell'
import JobCoreFields from './JobCoreFields'
import JobRelationshipFields from './JobRelationshipFields'
import './JobDrawer.css'

type Props = {
    mechanics: Mechanic[]
    equipmentList: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    onCreateCustomer: (customer: { name: string }) => Promise<string>
    onCreateSite: (site: { customerId: string; name: string; address?: string }) => Promise<string>
    onCreateContact: (contact: { siteId: string; name: string; phone?: string; email?: string }) => Promise<string>
    onCreateEquipment: (equipment: { fleet: string; serial: string; make?: string; model?: string }) => Promise<string>
    onCreateJob: (job: JobSaveInput) => Promise<void>
    onClose: () => void
}

export default function JobCreateDrawer({
    mechanics, equipmentList, sites, customers, siteContacts,
    onCreateCustomer, onCreateSite, onCreateContact, onCreateEquipment,
    onCreateJob, onClose,
}: Props) {
    const editor = useJobEditor({
        initialDraft: {
            jobNumber: '', orderNumber: '', description: '',
            jobType: JOB_TYPES.BREAKDOWN,
            status: JOB_STATUSES.UNALLOCATED,
            mechanicId: '', equipmentId: '', customerId: '', siteId: '', contactId: '',
        },
        customers,
        sites,
        siteContacts,
    })
    const { draft, setDraft } = editor
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const createJob = async () => {
        if (!draft.description.trim()) return setSaveError('Enter a job description before creating the job.')
        if (draft.customerId && !draft.siteId) return setSaveError('Select a site for the chosen customer.')

        try {
            setIsSaving(true)
            setSaveError('')
            await onCreateJob({
                jobNumber: draft.jobNumber.trim(),
                orderNumber: draft.orderNumber.trim(),
                description: draft.description.trim(),
                jobType: draft.jobType,
                status: draft.status,
                equipmentId: draft.equipmentId || undefined,
                mechanicId: draft.mechanicId || undefined,
                siteId: draft.siteId || undefined,
                contactId: draft.contactId || undefined,
            })
            onClose()
        } catch (error) {
            console.error(error)
            setSaveError('The job could not be created. Please try again.')
        } finally { setIsSaving(false) }
    }

    return (
        <JobDrawerShell
            eyebrow="Create job"
            title={draft.jobNumber.trim() || 'New job'}
            busy={isSaving}
            onClose={onClose}
            footer={<>
                {saveError
                    ? <span className="job-edit-save-error" role="alert">{saveError}</span>
                    : <span>Create this job in Dataverse.</span>}
                <div className="job-edit-footer-actions">
                    <button type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button type="button" className="primary" onClick={createJob} disabled={isSaving}>
                        {isSaving ? 'Creating...' : 'Create job'}
                    </button>
                </div>
            </>}
        >
            <div className="job-edit-grid">
                <JobCoreFields draft={draft} setDraft={setDraft} mechanics={mechanics} />
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
