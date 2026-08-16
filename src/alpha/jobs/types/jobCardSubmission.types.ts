import type { JobCardStatus } from './jobCardStatus.types'

export const JOB_CARD_SUBMISSION_ROLES = {
    PRIMARY: 122830000,
    ADDITIONAL: 122830001,
    LEGACY: 122830002,
} as const

export type JobCardSubmissionRole = typeof JOB_CARD_SUBMISSION_ROLES[keyof typeof JOB_CARD_SUBMISSION_ROLES]

export type JobCardSubmissionTimeEntry = {
    id: string
    date: string
    hours: number
    kilometres: number
}

export type JobCardSubmissionPart = {
    id: string
    part: string
    quantity: number
}

export type JobCardSubmissionPhoto = {
    id: string
    fileName: string
    uploadedOn: string
    displayOrder: number
    previewUrl: string
}

export type JobCardSubmission = {
    gr_jobcardsubmissionid: string
    gr_name: string
    gr_recipientname?: string | null
    gr_recipientemail?: string | null
    gr_role: JobCardSubmissionRole
    gr_status: JobCardStatus
    gr_required?: boolean | null
    gr_emailsenton?: string | null
    gr_submittedon?: string | null
    gr_closedon?: string | null
    gr_hourmeter?: number | null
    gr_story?: string | null
    gr_furtherworkrequired?: boolean | null
    gr_furtherworkdetails?: string | null
    gr_safetyissueidentified?: boolean | null
    gr_safetyissuedetails?: string | null
    gr_islegacy?: boolean | null
    _gr_job_value: string
    _gr_mechanic_value?: string | null
    _gr_jobassignment_value?: string | null
    timeEntries: JobCardSubmissionTimeEntry[]
    parts: JobCardSubmissionPart[]
    photos: JobCardSubmissionPhoto[]
}
