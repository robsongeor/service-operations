export const STAFF_DEPARTMENTS = {
    SERVICE: 122830000,
    ACCOUNTS: 122830001,
    SALES: 122830002,
    MANAGEMENT: 122830003,
    OTHER: 122830004,
} as const

export const STAFF_DEPARTMENT_OPTIONS = [
    { value: STAFF_DEPARTMENTS.SERVICE, label: 'Service' },
    { value: STAFF_DEPARTMENTS.ACCOUNTS, label: 'Accounts' },
    { value: STAFF_DEPARTMENTS.SALES, label: 'Sales' },
    { value: STAFF_DEPARTMENTS.MANAGEMENT, label: 'Management' },
    { value: STAFF_DEPARTMENTS.OTHER, label: 'Other' },
]

export function staffDepartmentLabel(value?: number | null) {
    return STAFF_DEPARTMENT_OPTIONS.find((option) => option.value === value)?.label ?? 'Service'
}

export function canBeAssignedJobs(staff: { statecode?: number; gr_jobassignmentenabled?: boolean | null }) {
    return staff.statecode !== 1 && staff.gr_jobassignmentenabled !== false
}

export function canReceiveInternalEmail(staff: { statecode?: number; gr_email?: string | null }) {
    return staff.statecode !== 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staff.gr_email?.trim() ?? '')
}

export function shouldCopyOnCustomerEmail(staff: {
    statecode?: number
    gr_email?: string | null
    gr_customeremailccenabled?: boolean | null
}) {
    return staff.gr_customeremailccenabled === true && canReceiveInternalEmail(staff)
}

export function customerEmailCcRecipients<T extends {
    statecode?: number
    gr_email?: string | null
    gr_customeremailccenabled?: boolean | null
}>(staff: T[]) {
    return [...new Set(staff
        .filter(shouldCopyOnCustomerEmail)
        .map((person) => person.gr_email!.trim().toLowerCase()))]
}
