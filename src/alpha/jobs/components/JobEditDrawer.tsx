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
import JobScheduleFields from './JobScheduleFields'
import JobDrawerShell from './JobDrawerShell'
import './JobDrawer.css'
import type {
    JobScheduleOption,
    JobScheduleOptionInput,
} from '../types/jobSchedule.types'

type Props = {
    job: Job
    mechanics: Mechanic[]
    equipmentList: Equipment[]
    sites: Site[]
    customers: Customer[]
    siteContacts: SiteContact[]
    scheduleOptions: JobScheduleOption[]
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
    onDelete: (jobId: string) => Promise<void>
    onCreateScheduleOption: (option: JobScheduleOptionInput) => Promise<void>
    onUpdateScheduleOption: (
        optionId: string,
        option: JobScheduleOptionInput,
    ) => Promise<void>
    onDeleteScheduleOption: (optionId: string) => Promise<void>
    onClose: () => void
}

export default function JobEditDrawer({
    job,
    mechanics,
    equipmentList,
    sites,
    customers,
    siteContacts,
    scheduleOptions,
    onCreateCustomer,
    onCreateSite,
    onCreateContact,
    onCreateEquipment,
    onSave,
    onDelete,
    onCreateScheduleOption,
    onUpdateScheduleOption,
    onDeleteScheduleOption,
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
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')

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

    const deleteJob = async () => {
        try {
            setIsDeleting(true)
            setDeleteError('')
            await onDelete(job.gr_jobid)
            setShowDeleteConfirm(false)
            onClose()
        } catch (error) {
            console.error(error)
            setDeleteError('The job could not be deleted. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <>
        <JobDrawerShell
            eyebrow="Edit job"
            title={job.gr_jobnumber || 'Unnumbered job'}
            busy={isSaving || isDeleting}
            onClose={onClose}
            footer={
                <>
                    <div className="job-edit-footer-leading">
                        <button
                            type="button"
                            className="job-edit-delete-button"
                            onClick={() => {
                                setDeleteError('')
                                setShowDeleteConfirm(true)
                            }}
                            disabled={isSaving}
                        >
                            Delete job
                        </button>
                        {saveError
                            ? <span className="job-edit-save-error" role="alert">{saveError}</span>
                            : <span>Save to update this job in Dataverse.</span>}
                    </div>
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

                <JobScheduleFields
                    jobId={job.gr_jobid}
                    scheduleOptions={scheduleOptions}
                    onCreate={onCreateScheduleOption}
                    onUpdate={onUpdateScheduleOption}
                    onDelete={onDeleteScheduleOption}
                />
            </div>
        </JobDrawerShell>

        {showDeleteConfirm && (
            <div
                className="job-delete-backdrop"
                role="presentation"
                onMouseDown={() => {
                    if (!isDeleting) setShowDeleteConfirm(false)
                }}
            >
                <div
                    className="job-delete-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="job-delete-title"
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <div className="job-delete-icon" aria-hidden="true">!</div>
                    <div>
                        <p className="job-delete-eyebrow">Delete job</p>
                        <h3 id="job-delete-title">
                            Delete {job.gr_jobnumber || 'this unnumbered job'}?
                        </h3>
                        <p className="job-delete-message">
                            This permanently removes the job from Dataverse. This action cannot be undone.
                        </p>
                    </div>
                    {deleteError && <p className="job-delete-error" role="alert">{deleteError}</p>}
                    <div className="job-delete-actions">
                        <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                            Cancel
                        </button>
                        <button type="button" className="danger" onClick={deleteJob} disabled={isDeleting}>
                            {isDeleting ? 'Deleting...' : 'Delete job'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}
