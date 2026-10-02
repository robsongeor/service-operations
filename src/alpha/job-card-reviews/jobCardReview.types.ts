import type { JobType } from '../jobs/types/jobType.types'

export type JobCardRequestSummary = {
    reviewId: string
    assignmentId?: string
    technicianName: string
    createdOn: string
    expiresOn: string
    submittedOn?: string
    reviewedOn?: string
    status: 'active' | 'expired' | 'superseded' | 'pendingReview' | 'reviewed'
    photoCount: number
}

export type JobCardHistory = { items: JobCardRequestSummary[]; truncated: boolean }

export type JobCardReviewSummary = {
    reviewId: string
    jobNumber: string
    customerName?: string
    siteName?: string
    technicianName?: string
    submittedOn: string
    safetyIssueIdentified: boolean
    furtherWorkRequired: boolean
    photoCount: number
    notificationStatus?: string
    jobType?: JobType
    workRequired?: string
    equipmentDisplayName?: string
    fleetNumber?: string
    equipmentSerial?: string
}

export type JobCardReviewQueue = { items: JobCardReviewSummary[]; truncated?: boolean }

export type JobCardReview = JobCardReviewSummary & {
    etag: string
    status: 'pendingReview' | 'reviewed'
    sourceJobId: string
    assignmentId?: string
    equipmentMake?: string
    equipmentModel?: string
    orderNumber?: string
    siteAddress?: string
    currentHourMeter?: number
    hourMeter?: number
    story: string
    timeEntries: { date: string; hours: number; kilometres: number }[]
    parts: { description: string; quantity: number }[]
    furtherWorkDetails?: string
    safetyIssueDetails?: string
    photos: { id: string; fileName: string; mimeType: string; size: number }[]
    reviewedOn?: string
    reviewedByUserId?: string
}
