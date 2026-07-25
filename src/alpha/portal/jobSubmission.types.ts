export type PublicJobSubmissionDetails = {
    jobNumber: string
    equipmentDisplayName?: string
    fleetNumber?: string
    customerName?: string
    siteName?: string
    workRequired?: string
    requiresHourMeter: boolean
    currentHourMeter?: number
}

export type PublicSubmissionErrorCode = 'invalid' | 'expired' | 'used' | 'unavailable' | 'temporary'

export type PublicSubmissionError = {
    code: PublicSubmissionErrorCode
    error: string
}

export type JobCardTimeEntryInput = {
    date: string
    hours: number
    kilometres: number
}

export type JobCardSubmissionInput = {
    story: string
    hourMeter?: number
    timeEntries: JobCardTimeEntryInput[]
    parts: string[]
    furtherWorkRequired: boolean
    furtherWorkDetails?: string
    safetyIssueIdentified: boolean
    safetyIssueDetails?: string
    photos: {
        fileName: string
        mimeType: string
        size: number
        data: string
    }[]
}
