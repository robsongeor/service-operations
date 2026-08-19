import { useNavigate } from 'react-router-dom'
import JobCompletionWorkflow from '../../jobs/components/JobCompletionWorkflow'
import JobDrawerShell from '../../jobs/components/JobDrawerShell'
import JobEditDrawer from '../../jobs/components/JobEditDrawer'
import { useJobs } from '../../jobs/hooks/useJobs'

type Props = {
    jobId: string
    onChanged: () => Promise<void>
    onClose: () => void
}

export default function WofJobDrawer({ jobId, onChanged, onClose }: Props) {
    const navigate = useNavigate()
    const manager = useJobs()
    const job = manager.jobs.find((item) => item.gr_jobid.toLowerCase() === jobId.toLowerCase())

    if (manager.isLoading) {
        return <JobDrawerShell eyebrow="WOF Job" title="Loading Job…" onClose={onClose} footer={<button type="button" onClick={onClose}>Close</button>}>
            <div className="wof-state" role="status">Loading the linked Job and its operational details…</div>
        </JobDrawerShell>
    }

    if (manager.loadError || !job) {
        return <JobDrawerShell eyebrow="WOF Job" title="Job unavailable" onClose={onClose} footer={<><button type="button" onClick={manager.retryInitialLoad}>Try again</button><button type="button" onClick={onClose}>Close</button></>}>
            <div className="wof-state error" role="alert">
                {manager.loadError || 'The linked Job could not be found in Dataverse. The WOF record has not been changed.'}
            </div>
        </JobDrawerShell>
    }

    return <>
        <JobEditDrawer
            job={job}
            mechanics={manager.mechanics}
            equipmentList={manager.equipmentList}
            sites={manager.sites}
            customers={manager.customers}
            siteContacts={manager.siteContacts}
            scheduleOptions={manager.scheduleOptions}
            quotes={manager.jobQuotes.filter((quote) => quote._gr_job_value?.toLowerCase() === jobId.toLowerCase())}
            assignments={manager.jobAssignments.filter((assignment) => assignment._gr_job_value?.toLowerCase() === jobId.toLowerCase())}
            servicePlans={manager.servicePlans}
            onCreateCustomer={manager.createCustomer}
            onCreateSite={manager.createSite}
            onCreateContact={manager.createContactForSite}
            onCreateEquipment={manager.createEquipment}
            onSave={async (savedJobId, input) => {
                const saved = await manager.updateJob(savedJobId, input)
                if (saved !== false) await onChanged()
                return saved
            }}
            onDelete={async (savedJobId) => {
                await manager.deleteJob(savedJobId)
                await onChanged()
            }}
            onCreateScheduleOption={async (input) => {
                await manager.createScheduleOption(input)
                await onChanged()
            }}
            onUpdateScheduleOption={async (optionId, input) => {
                await manager.updateScheduleOption(optionId, input)
                await onChanged()
            }}
            onDeleteScheduleOption={async (optionId) => {
                await manager.deleteScheduleOption(optionId)
                await onChanged()
            }}
            onCreateQuote={(savedJobId) => navigate(`/quotes?new=1&jobId=${encodeURIComponent(savedJobId)}`)}
            onOpenQuote={(quoteId) => navigate(`/quotes?quoteId=${encodeURIComponent(quoteId)}`)}
            onJobCardStatusChange={async (savedJobId, status) => {
                await manager.updateJobCardStatus(savedJobId, status)
                await onChanged()
            }}
            onCreateAssignment={async (input) => {
                await manager.createJobAssignment(input)
                await onChanged()
            }}
            onSendPrimary={manager.sendPrimaryJobEmail}
            onSendAssignment={manager.sendAssignmentJobEmail}
            onDeleteAssignment={async (assignmentId) => {
                await manager.deleteJobAssignment(assignmentId)
                await onChanged()
            }}
            officeUpdates={manager.officeUpdates.filter((update) => update.jobId.toLowerCase() === jobId.toLowerCase())}
            onCreateOfficeUpdate={manager.createJobOfficeUpdate}
            onSaveOfficeAttention={async (savedJobId, required) => {
                await manager.updateJobOfficeAttention(savedJobId, required)
                await onChanged()
            }}
            referenceDataStatus={manager.referenceDataStatus}
            referenceDataError={manager.referenceDataError}
            collaborationDataStatus={manager.collaborationDataStatus}
            collaborationDataError={manager.collaborationDataError}
            onPrepareReferenceData={manager.prepareJobReferenceData}
            onRefreshJob={manager.fetchJobForDrawer}
            onLoadJobCardDetails={manager.fetchJobCardDetails}
            onLoadJobPhoto={manager.fetchJobPhotoBody}
            onClose={onClose}
        />
        <JobCompletionWorkflow
            key={manager.completionRequest?.job.gr_jobid ?? 'no-completion'}
            request={manager.completionRequest}
            equipment={manager.equipmentList}
            jobs={manager.jobs}
            servicePlans={manager.servicePlans}
            isCompleting={manager.isCompletingJob}
            error={manager.completionError}
            onCancel={manager.cancelJobCompletion}
            onSetupMaintenance={manager.setupEquipmentMaintenance}
            onCompleteStandard={manager.completeStandardJob}
            onCompleteService={async (hourMeter, readingType, readingDate, completionDate) => {
                await manager.completeServiceJob(hourMeter, readingType, readingDate, completionDate)
                await onChanged()
            }}
            onCompleteWof={async (newExpiry, hourMeter, readingType, readingDate, completionDate) => {
                await manager.completeWofJob(newExpiry, hourMeter, readingType, readingDate, completionDate)
                await onChanged()
            }}
        />
    </>
}
