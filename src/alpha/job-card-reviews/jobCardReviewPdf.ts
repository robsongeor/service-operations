import { loadJobSheetTemplate, renderJobSheetPdf, type JobSheetDraft } from '../portal/jobSheetPdf.ts'
import type { PublicJobSubmissionDetails } from '../portal/jobSubmission.types.ts'
import type { JobCardReview } from './jobCardReview.types.ts'
import { safePhotoFilename } from './jobCardPhotoDownload.ts'

/** Fill the actual Job card from saved evidence only, never mutable Job/contact/hour readings. */
export function buildReviewJobSheet(review: JobCardReview) {
    const details: PublicJobSubmissionDetails = {
        jobNumber: review.jobNumber, orderNumber: review.orderNumber,
        customerName: review.customerName, siteName: review.siteName, siteAddress: review.siteAddress,
        fleetNumber: review.fleetNumber, equipmentDisplayName: review.equipmentDisplayName,
        equipmentMake: review.equipmentMake, equipmentModel: review.equipmentModel, equipmentSerial: review.equipmentSerial,
        technicianName: review.technicianName, workRequired: review.workRequired, requiresHourMeter: false,
    }
    const draft: JobSheetDraft = {
        hourMeter: review.hourMeter == null ? '' : String(review.hourMeter),
        story: review.story, timeEntries: review.timeEntries, parts: review.parts,
        furtherWorkDetails: review.furtherWorkRequired ? review.furtherWorkDetails || 'Required - details not supplied.' : 'None reported.',
        safetyIssueDetails: review.safetyIssueIdentified ? review.safetyIssueDetails || 'Identified - details not supplied.' : 'None reported.',
    }
    return { details, draft, generatedAt: new Date(review.submittedOn) }
}

export async function renderJobCardReviewPdf(review: JobCardReview, templateBytes: ArrayBuffer | Uint8Array) {
    const { details, draft, generatedAt } = buildReviewJobSheet(review)
    return renderJobSheetPdf(templateBytes, details, draft, generatedAt)
}

export async function createJobCardReviewPdf(review: JobCardReview, signal?: AbortSignal) {
    const bytes = await loadJobSheetTemplate(signal)
    signal?.throwIfAborted()
    const pdf = await renderJobCardReviewPdf(review, bytes)
    signal?.throwIfAborted()
    return pdf
}

export const jobCardPdfFilename = (review: Pick<JobCardReview, 'jobNumber'>) => `Job-${safePhotoFilename(review.jobNumber, 'card')}.pdf`

export async function downloadJobCardReviewPdf(review: JobCardReview) {
    const blob = await createJobCardReviewPdf(review)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = jobCardPdfFilename(review)
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
