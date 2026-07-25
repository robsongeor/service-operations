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
