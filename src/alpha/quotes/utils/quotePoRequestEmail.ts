import type { PurchaseOrderRecipient } from '../../customers/purchaseOrderRecipient.types.ts'
import { resolvePurchaseOrderRecipients } from '../../customers/purchaseOrderRecipientRules.ts'
import { buildMailtoUrl, isValidRecipientEmail } from '../../jobs/utils/technicianMailto.ts'

const collapseWhitespace = (value?: string | null) => (value ?? '').replace(/\s+/g, ' ').trim()

export type QuotePoRequestEmailInput = {
    recipients: PurchaseOrderRecipient[]
    customerId: string
    siteId?: string | null
    jobNumber?: string | null
    quoteNumber?: string | null
    customerName?: string | null
    equipmentLabel?: string | null
    total: number
    internalCc?: string[]
    workSummary?: string | null
}

export function buildQuotePoRequestEmail(input: QuotePoRequestEmailInput) {
    const resolved = resolvePurchaseOrderRecipients(input.recipients, input.customerId, input.siteId)
    const primary = resolved.primary?.gr_Contact
    const recipient = isValidRecipientEmail(primary?.gr_email) ? primary!.gr_email!.trim() : ''
    const cc = [...resolved.cc
        .map((row) => row.gr_Contact?.gr_email?.trim() ?? '')
        .filter(isValidRecipientEmail), ...(input.internalCc ?? []).filter(isValidRecipientEmail)]
    const jobNumber = collapseWhitespace(input.jobNumber) || 'Not supplied'
    const customer = collapseWhitespace(input.customerName) || 'Customer'
    const firstName = collapseWhitespace(primary?.gr_name).split(/\s+/)[0]
    const workSummary = collapseWhitespace(input.workSummary)
    const subject = `Purchase order request - Job ${jobNumber} - ${customer}`.slice(0, 150)
    const body = [
        firstName ? `Hi ${firstName},` : 'Hi,', '',
        'Could you please process the attached provisional quotation and provide an order number so we can proceed with the work?', '',
        ...(workSummary ? [workSummary, ''] : []),
        'The work is awaiting PO approval.', '',
        'Thanks,',
    ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n')

    return {
        mailto: recipient
            ? buildMailtoUrl({ recipient, cc, subject, body })
            : `mailto:?${[
                ...([...new Set(cc.map((email) => email.trim().toLowerCase()))].length
                    ? [`cc=${encodeURIComponent([...new Set(cc.map((email) => email.trim().toLowerCase()))].join(','))}`]
                    : []),
                `subject=${encodeURIComponent(subject)}`,
                `body=${encodeURIComponent(body)}`,
            ].join('&')}`,
        recipientConfigured: Boolean(recipient),
        recipientSource: resolved.source,
    }
}
