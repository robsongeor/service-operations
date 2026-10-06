import { useState } from 'react'
import { useJobCorrections } from '../hooks/useJobCorrections'
import type { CorrectableJob } from '../services/jobCorrectionsApi'
import JobEditDrawer from './JobEditDrawer'
import JobDrawerShell from './JobDrawerShell'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import type { Mechanic } from '../types/mechanic.types'

const unavailable = async (): Promise<never> => { throw new Error('This action is reserved for a service coordinator.') }

type Props = {
    jobId: string
    jobBookLabel?: string
    mechanics?: Mechanic[]
    canAssignTechnician?: boolean
    getAccessToken: () => Promise<string>
    onSaved: (job: CorrectableJob) => void
    onClose: () => void
}

/** Capability-guarded by its host. Reuses the canonical Job editor, with no operational mutation callbacks. */
export default function JobCorrectionsDrawer({ jobId, jobBookLabel = 'Auckland', mechanics = [], canAssignTechnician = false, getAccessToken, onSaved, onClose }: Props) {
    const corrections = useJobCorrections(jobId, getAccessToken, onSaved)
    const [confirmReload, setConfirmReload] = useState(false)
    if (!corrections.job) return <JobDrawerShell eyebrow="Edit entry" title="Managed Job" onClose={onClose} footer={<button type="button" onClick={onClose}>Close</button>}>
        <p role={corrections.loadError ? 'alert' : 'status'}>{corrections.loadError || 'Loading the latest Job details…'}</p>
        {corrections.loadError && <button type="button" onClick={corrections.reload}>Try again</button>}
    </JobDrawerShell>
    return <>
        <JobEditDrawer key={corrections.job['@odata.etag']} correctionsOnly jobBookLabel={jobBookLabel} canCorrectMechanic={canAssignTechnician} job={corrections.job}
            mechanics={mechanics} equipmentList={corrections.equipment} customers={corrections.customers} sites={corrections.sites} siteContacts={corrections.contacts} scheduleOptions={[]} servicePlans={[]}
            onSearchCustomers={corrections.findCustomers} onSearchEquipment={corrections.findEquipment} onLoadCustomerSites={corrections.loadSites} onLoadSiteContacts={corrections.loadContacts}
            onSave={corrections.save} onClose={onClose}
            saveBlockedReason={corrections.reloadReason} onReloadCorrections={() => setConfirmReload(true)}
            onCreateCustomer={unavailable} onCreateSite={unavailable} onCreateContact={unavailable} onCreateEquipment={unavailable}
            onDelete={unavailable} onCreateScheduleOption={unavailable} onUpdateScheduleOption={unavailable} onDeleteScheduleOption={unavailable}
            onCreateQuote={unavailable} onOpenQuote={unavailable} onJobCardStatusChange={unavailable} onCreateAssignment={unavailable} onSendPrimary={unavailable} onSendAssignment={unavailable} onDeleteAssignment={unavailable}
        />
        {confirmReload && <EditDrawerFormDialog eyebrow="Latest Job details" title="Reload this Job?" submitLabel="Reload latest details" onCancel={() => setConfirmReload(false)} onSubmit={() => { setConfirmReload(false); corrections.reload() }}>
            <p>This discards your unsaved corrections. Review the latest details before making your changes again.</p>
        </EditDrawerFormDialog>}
    </>
}
