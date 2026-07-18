export const JOB_CARD_STATUSES = {
    NOT_SENT: 122830000,
    SENT: 122830001,
    SUBMITTED: 122830002,
    CLOSED: 122830003,
} as const

export type JobCardStatus = typeof JOB_CARD_STATUSES[keyof typeof JOB_CARD_STATUSES]

export const JOB_CARD_STATUS_OPTIONS: { label: string; value: JobCardStatus }[] = [
    { label: 'Not sent', value: JOB_CARD_STATUSES.NOT_SENT },
    { label: 'Sent', value: JOB_CARD_STATUSES.SENT },
    { label: 'Submitted', value: JOB_CARD_STATUSES.SUBMITTED },
    { label: 'Closed', value: JOB_CARD_STATUSES.CLOSED },
]

export function getJobCardStatus(value?: JobCardStatus | null): JobCardStatus {
    return value ?? JOB_CARD_STATUSES.NOT_SENT
}
