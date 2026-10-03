export type JobCreationLocation = {
    equipmentId?: string | null
    customerId?: string | null
    siteId?: string | null
    address?: string | null
}

export type JobCreationLocationErrors = Partial<Record<'customer' | 'site' | 'address', string>>

// Creation only: existing incomplete records must remain editable.
export function jobCreationLocationErrors(location: JobCreationLocation): JobCreationLocationErrors {
    if (location.equipmentId?.trim()) return {}
    return {
        ...(!location.customerId?.trim() ? { customer: 'Select a customer when no equipment is selected.' } : {}),
        ...(!location.siteId?.trim() ? { site: 'Select a site when no equipment is selected.' } : {}),
        ...(!location.address?.trim() ? { address: 'Choose a site with an address when no equipment is selected.' } : {}),
    }
}

export function assertJobCreationLocation(location: JobCreationLocation): void {
    const errors = jobCreationLocationErrors(location)
    const message = errors.customer || errors.site || errors.address
    if (message) throw new Error(message)
}
