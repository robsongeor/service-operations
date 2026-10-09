import type { JobType } from '../jobs/types/jobType.types'

export type JobCardRequestSummary = {
    reviewId: string
    assignmentId?: string
    technicianName: string
    createdOn: string
    expiresOn: string
    submittedOn?: string
    reviewedOn?: string
    status: 'active' | 'expired' | 'superseded' | 'withdrawn' | 'pendingReview' | 'reviewed'
    photoCount: number
    etag: string
    withdrawnOn?: string
    withdrawnReason?: string
    withdrawnByDisplayName?: string
    operationalStatusWarning?: string
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
    officeStatus: JobCardOfficeStatus
    officeNote?: string
    greentreeReference?: string
    reviewStartedOn?: string
    reviewStartedBy?: JobCardOfficeActor
    officeActionOn?: string
    officeActionBy?: JobCardOfficeActor
    outcomeOn?: string
    outcomeBy?: JobCardOfficeActor
    officeActivities: JobCardOfficeActivity[]
    isTerminal: boolean
}

export type JobCardOfficeStatus = 'pending' | 'inReview' | 'needsClarification' | 'onHold' | 'processedInGreenTree' | 'noInvoiceRequired' | 'legacyReviewed'
export type JobCardOfficeActor = { userId: string; displayName: string; email?: string }
export type JobCardOfficeAction = 'startReview' | 'setNeedsClarification' | 'setOnHold' | 'completeGreenTreeProcessing'
export type JobCardOfficeActivity = {
    // Retain previously recorded actions without allowing new submissions of retired actions.
    action: JobCardOfficeAction | 'completeNoInvoiceRequired'
    fromStatus: JobCardOfficeStatus
    toStatus: JobCardOfficeStatus
    occurredOn: string
    actor: JobCardOfficeActor
    note?: string
    greentreeReference?: string
}
export type JobCardOpenJobSummary = Omit<JobCardReviewSummary, 'reviewId' | 'submittedOn' | 'officeStatus'> & {
    dispatchId: string
    sourceJobId: string
    sentOn: string
    reviewId?: never
    submittedOn?: never
    officeStatus?: never
}
export type JobCardQueueItem = JobCardReviewSummary | JobCardOpenJobSummary
export type JobCardReviewQueueView = 'open' | 'submitted' | 'review' | 'completed'
export type JobCardReviewApiView = JobCardReviewQueueView | 'active' | 'history'
export type JobCardReviewQueue = { items: JobCardQueueItem[]; view: JobCardReviewApiView; hasMore: boolean; nextOffset?: number; truncated?: boolean; scanLimitReached?: boolean }

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
