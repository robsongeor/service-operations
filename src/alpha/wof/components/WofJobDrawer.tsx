import { useEffect, useMemo, useState } from 'react'
import JobCompletionWorkflow from '../../jobs/components/JobCompletionWorkflow'
import JobDrawerShell from '../../jobs/components/JobDrawerShell'
import JobEditDrawer from '../../jobs/components/JobEditDrawer'
import { useJobs } from '../../jobs/hooks/useJobs'
import type { Job } from '../../jobs/types/job.types'
import type { JobScheduleOption } from '../../jobs/types/jobSchedule.types'
import { useQuoteEditorOverlay } from '../../quotes/QuoteEditorOverlayContext'

type Props = {
    jobId: string
    scheduleOptions: JobScheduleOption[]
    onChanged: () => Promise<void>
    onClose: () => void
}

export default function WofJobDrawer({ jobId, scheduleOptions, onChanged, onClose }: Props) {
    const quoteEditor = useQuoteEditorOverlay()
    const scopedData = useMemo(() => ({
        jobs: [],
        equipment: [],
        sites: [],
        servicePlans: [],
        scheduleOptions,
        officeUpdates: [],
    }), [scheduleOptions])
    const manager = useJobs({
        loadGlobalOperationalData: false,
        scopedData,
        onScopedDataChanged: onChanged,
    })
    const { fetchJobForDrawer, loadJobOfficeUpdatesForEditor } = manager
    const [job, setJob] = useState<Job | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [loadAttempt, setLoadAttempt] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        void Promise.all([
            fetchJobForDrawer(jobId, controller.signal),
            loadJobOfficeUpdatesForEditor(jobId, controller.signal),
        ]).then(([loadedJob]) => {
            if (controller.signal.aborted) return
            setJob(loadedJob ?? null)
            if (!loadedJob) setLoadError('The linked Job could not be found in Dataverse. The WOF record has not been changed.')
        }).catch((error) => {
            if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'The linked Job could not be loaded.')
        }).finally(() => {
            if (!controller.signal.aborted) setIsLoading(false)
        })
        return () => controller.abort()
    }, [fetchJobForDrawer, jobId, loadAttempt, loadJobOfficeUpdatesForEditor])

    const refreshJobAndParent = async () => {
        await onChanged()
        const refreshed = await fetchJobForDrawer(jobId)
        if (refreshed) setJob(refreshed)
    }

    if (isLoading) {
        return <JobDrawerShell eyebrow="WOF Job" title="Loading Job…" onClose={onClose} footer={<button type="button" onClick={onClose}>Close</button>}>
            <div className="wof-state" role="status">Loading the linked Job and its operational details…</div>
        </JobDrawerShell>
    }

    if (loadError || !job) {
        return <JobDrawerShell eyebrow="WOF Job" title="Job unavailable" onClose={onClose} footer={<><button type="button" onClick={() => { setIsLoading(true); setLoadError(''); setJob(null); setLoadAttempt((current) => current + 1) }}>Try again</button><button type="button" onClick={onClose}>Close</button></>}>
            <div className="wof-state error" role="alert">
                {loadError || 'The linked Job could not be found in Dataverse. The WOF record has not been changed.'}
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
            servicePlans={manager.servicePlans}
            onCreateCustomer={manager.createCustomer}
            onCreateSite={manager.createSite}
            onCreateContact={manager.createContactForSite}
            onCreateEquipment={manager.createEquipment}
            onSearchEquipment={manager.searchEquipmentForEditor}
            onSearchCustomers={manager.searchCustomersForEditor}
            onLoadCustomerSites={manager.loadCustomerSitesForEditor}
            onLoadSiteContacts={manager.loadSiteContactsForEditor}
            onLoadEquipment={manager.loadEquipmentForEditor}
            onLoadEquipmentServicePlans={manager.loadEquipmentServicePlansForEditor}
            onSave={async (savedJobId, input) => {
                const saved = await manager.updateJob(savedJobId, input)
                if (saved !== false) await refreshJobAndParent()
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
            onCreateQuote={(savedJobId) => { onClose(); quoteEditor.createQuote(savedJobId) }}
            onOpenQuote={(quoteId) => { onClose(); quoteEditor.openQuote(quoteId) }}
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
            officeUpdates={manager.officeUpdates}
            onCreateOfficeUpdate={manager.createJobOfficeUpdate}
            onSaveOfficeAttention={async (savedJobId, required) => {
                await manager.updateJobOfficeAttention(savedJobId, required)
                await onChanged()
            }}
            referenceDataStatus={manager.referenceDataStatus}
            referenceDataError={manager.referenceDataError}
            onPrepareReferenceData={manager.prepareJobReferenceData}
            onLoadJobQuotes={manager.loadJobQuotes}
            onLoadJobAssignments={manager.loadJobAssignments}
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
                await refreshJobAndParent()
            }}
            onCompleteWof={async (newExpiry, hourMeter, readingType, readingDate, completionDate) => {
                await manager.completeWofJob(newExpiry, hourMeter, readingType, readingDate, completionDate)
                await refreshJobAndParent()
            }}
        />
    </>
}
