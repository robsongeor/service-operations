export const OFFICE_ACTIONS = {
    NONE: 122830000,
    ORDER_PARTS: 122830001,
    PREPARE_QUOTE: 122830002,
    WARRANTY_CLAIM: 122830003,
    ARRANGE_TRANSPORT: 122830004,
    FOLLOW_UP_SUPPLIER: 122830005,
    FOLLOW_UP_CUSTOMER: 122830006,
    FOLLOW_UP_MANAGER: 122830007,
    WAITING_FOR_CUSTOMER: 122830008,
    WAITING_FOR_SUPPLIER: 122830009,
    OTHER: 122830010,
} as const

export type OfficeAction = typeof OFFICE_ACTIONS[keyof typeof OFFICE_ACTIONS]

export type JobOfficeUpdate = {
    id: string
    jobId: string
    text: string
    createdAt: string
    createdByName?: string
}

export const OFFICE_ACTION_OPTIONS: Array<{ value: OfficeAction; label: string }> = [
    { value: OFFICE_ACTIONS.NONE, label: 'None' },
    { value: OFFICE_ACTIONS.ORDER_PARTS, label: 'Order Parts' },
    { value: OFFICE_ACTIONS.PREPARE_QUOTE, label: 'Prepare Quote' },
    { value: OFFICE_ACTIONS.WARRANTY_CLAIM, label: 'Warranty Claim' },
    { value: OFFICE_ACTIONS.ARRANGE_TRANSPORT, label: 'Arrange Transport' },
    { value: OFFICE_ACTIONS.FOLLOW_UP_SUPPLIER, label: 'Follow Up Supplier' },
    { value: OFFICE_ACTIONS.FOLLOW_UP_CUSTOMER, label: 'Follow Up Customer' },
    { value: OFFICE_ACTIONS.FOLLOW_UP_MANAGER, label: 'Follow Up Manager' },
    { value: OFFICE_ACTIONS.WAITING_FOR_CUSTOMER, label: 'Waiting for Customer' },
    { value: OFFICE_ACTIONS.WAITING_FOR_SUPPLIER, label: 'Waiting for Supplier' },
    { value: OFFICE_ACTIONS.OTHER, label: 'Other' },
]

export const jobNeedsOfficeAttention = (job: { gr_officeattentionrequired?: boolean | null }) =>
    job.gr_officeattentionrequired === true

export const getOfficeActionLabel = (action?: OfficeAction) => OFFICE_ACTION_OPTIONS.find((option) => option.value === action)?.label ?? ''
