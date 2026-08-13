import { isValidRecipientEmail } from '../jobs/utils/technicianMailto.ts'

export type NewPurchaseOrderContactInput = {
    siteId?: string
    name: string
    phone?: string
    email: string
}

export function validateNewPurchaseOrderContact(input: NewPurchaseOrderContactInput) {
    if (!input.name.trim()) throw new Error('Enter the contact name.')
    if (!isValidRecipientEmail(input.email.trim())) throw new Error('Enter a valid email address.')
}
