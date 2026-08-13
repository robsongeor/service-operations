import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { LiftrucksInvoiceSnapshot } from '../../shared/pdf/renderLiftrucksInvoicePdf'
import type { PricingCategory } from '../types/pricing.types'
import type { Quote, QuoteJob, QuoteLineInput } from '../types/quote.types'

type QuotePoRequestInvoiceInput = {
    quote: Quote
    title: string
    quoteDate: string
    notes: string
    jobId: string
    customerId: string
    equipmentId: string
    jobs: QuoteJob[]
    customers: Customer[]
    equipment: Equipment[]
    lines: QuoteLineInput[]
    extendedPrices: number[]
    subtotal: number
    gstRatePercent: number
    gst: number
    total: number
}

const invoiceLineType = (category: PricingCategory): 'Labour' | 'Parts' | 'Other' => {
    if (category === 122830000) return 'Labour'
    if (category === 122830001) return 'Parts'
    return 'Other'
}

export function buildQuotePoRequestInvoiceSnapshot(input: QuotePoRequestInvoiceInput): LiftrucksInvoiceSnapshot {
    const quoteNumber = input.quote.gr_quotenumber?.trim()
    if (!quoteNumber) throw new Error('Save the quote before generating its PO request invoice.')
    if (!input.lines.length || input.lines.some((line) => !line.description.trim())) {
        throw new Error('Add at least one complete quote line before generating the invoice.')
    }
    if (input.lines.length > 15) throw new Error('The invoice template supports at most 15 quote lines.')

    const job = input.jobs.find((candidate) => candidate.gr_jobid === input.jobId) ?? input.quote.gr_Job
    const directEquipment = input.equipment.find((candidate) => candidate.gr_equipmentid === input.equipmentId)
        ?? input.quote.gr_Equipment
    const selectedEquipment = directEquipment ?? job?.gr_Equipment
    const directSite = directEquipment?.gr_Site ?? input.quote.gr_Equipment?.gr_Site
    const directCustomer = input.customers.find((candidate) => candidate.gr_customerid === input.customerId)
        ?? input.quote.gr_Customer
    const customer = directCustomer ?? directSite?.gr_Customer ?? job?.gr_Site?.gr_Customer
    const site = directSite ?? job?.gr_Site

    return {
        documentNumber: quoteNumber,
        documentDate: input.quoteDate,
        jobNumber: job?.gr_jobnumber ?? '',
        orderNumber: '',
        customer: customer?.gr_name ?? '',
        site: site?.gr_address || site?.gr_name || '',
        headline: input.title,
        fleet: selectedEquipment?.gr_fleet ?? '',
        make: selectedEquipment?.gr_make ?? '',
        model: selectedEquipment?.gr_model ?? '',
        serial: selectedEquipment?.gr_serial ?? '',
        repairDescription: job?.gr_description || input.title,
        workCompleted: input.notes,
        lines: input.lines.map((line, index) => ({
            type: invoiceLineType(line.category),
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            extendedPrice: input.extendedPrices[index],
        })),
        subtotal: input.subtotal,
        gstRatePercent: input.gstRatePercent,
        gstAmount: input.gst,
        total: input.total,
    }
}
