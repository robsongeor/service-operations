import { downloadJobSheetPdf, type JobSheetDraft } from '../../portal/jobSheetPdf.ts'
import type { PublicJobSubmissionDetails } from '../../portal/jobSubmission.types.ts'
import type { JobCardSubmission } from '../types/jobCardSubmission.types.ts'
import type { Job } from '../types/job.types.ts'

export function buildSubmittedJobSheet(job: Job, submission: JobCardSubmission) {
    const details: PublicJobSubmissionDetails = {
        jobNumber: job.gr_jobnumber || 'Not recorded',
        orderNumber: job.gr_ordernumber || undefined,
        equipmentDisplayName: [job.gr_Equipment?.gr_make, job.gr_Equipment?.gr_model].filter(Boolean).join(' ') || undefined,
        fleetNumber: job.gr_Equipment?.gr_fleet || undefined,
        equipmentMake: job.gr_Equipment?.gr_make || undefined,
        equipmentModel: job.gr_Equipment?.gr_model || undefined,
        equipmentSerial: job.gr_Equipment?.gr_serial || undefined,
        customerName: job.gr_Site?.gr_Customer?.gr_name || undefined,
        siteName: job.gr_Site?.gr_name || undefined,
        siteAddress: job.gr_Site?.gr_address || undefined,
        siteContactName: job.gr_Contact?.gr_name || undefined,
        siteContactPhone: job.gr_Contact?.gr_phone || undefined,
        technicianName: submission.gr_recipientname || job.gr_Mechanic?.gr_name || undefined,
        workRequired: job.gr_description || undefined,
        requiresHourMeter: false,
        currentHourMeter: job.gr_hourmeter ?? undefined,
    }
    const draft: JobSheetDraft = {
        hourMeter: submission.gr_hourmeter == null ? undefined : String(submission.gr_hourmeter),
        story: submission.gr_story || undefined,
        timeEntries: submission.timeEntries.map((entry) => ({
            date: entry.date,
            hours: entry.hours,
            kilometres: entry.kilometres,
        })),
        parts: submission.parts.map((part) => ({ description: part.part, quantity: part.quantity })),
        furtherWorkDetails: submission.gr_furtherworkrequired ? submission.gr_furtherworkdetails || undefined : undefined,
        safetyIssueDetails: submission.gr_safetyissueidentified ? submission.gr_safetyissuedetails || undefined : undefined,
    }
    const submittedAt = submission.gr_submittedon ? new Date(submission.gr_submittedon) : undefined
    return { details, draft, generatedAt: submittedAt && !Number.isNaN(submittedAt.getTime()) ? submittedAt : undefined }
}

export async function downloadSubmittedJobSheet(job: Job, submission: JobCardSubmission) {
    const sheet = buildSubmittedJobSheet(job, submission)
    await downloadJobSheetPdf(sheet.details, sheet.draft, sheet.generatedAt)
}
