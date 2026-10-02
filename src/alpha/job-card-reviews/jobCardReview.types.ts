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
}

export type JobCardReview = JobCardReviewSummary & {
    etag: string
    status: 'pendingReview' | 'reviewed'
    sourceJobId: string
    assignmentId?: string
    workRequired?: string
    equipmentDisplayName?: string
    fleetNumber?: string
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
