import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import { MAX_LIFTTRUCKS_INVOICE_LINES, type LiftrucksInvoiceSnapshot } from '../../shared/pdf/renderLiftrucksInvoicePdf.ts'
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
    if (input.lines.length > MAX_LIFTTRUCKS_INVOICE_LINES) {
        throw new Error(`The invoice template supports at most ${MAX_LIFTTRUCKS_INVOICE_LINES} quote lines.`)
    }

    const job = input.jobs.find((candidate) => candidate.gr_jobid === input.jobId) ?? input.quote.gr_Job
    const jobNumber = job?.gr_jobnumber?.trim()
    if (!jobNumber) throw new Error('Link the quote to a numbered Job before generating the provisional quotation.')
    const directEquipment = input.equipment.find((candidate) => candidate.gr_equipmentid === input.equipmentId)
        ?? input.quote.gr_Equipment
    const selectedEquipment = directEquipment ?? job?.gr_Equipment
    const directCustomer = input.customers.find((candidate) => candidate.gr_customerid === input.customerId)
        ?? input.quote.gr_Customer
    const customer = directCustomer ?? job?.gr_Site?.gr_Customer ?? directEquipment?.gr_Site?.gr_Customer
        ?? input.quote.gr_Equipment?.gr_Site?.gr_Customer
    const site = job?.gr_Site

    return {
        documentNumber: jobNumber,
        documentDate: input.quoteDate,
        jobNumber,
        orderNumber: '',
        customer: customer?.gr_name ?? '',
        siteName: site?.gr_name ?? '',
        siteAddress: site?.gr_address ?? '',
        headline: input.title,
        fleet: selectedEquipment?.gr_fleet ?? '',
        make: selectedEquipment?.gr_make ?? '',
        model: selectedEquipment?.gr_model ?? '',
        serial: selectedEquipment?.gr_serial ?? '',
        repairDescription: job?.gr_description || input.title,
        workRequired: input.notes,
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

const safeFilenamePart = (value: string) => [...value]
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. -]+$/g, '')
    .trim()

export function buildQuoteProvisionalFilename(snapshot: LiftrucksInvoiceSnapshot) {
    const equipment = safeFilenamePart(snapshot.fleet
        || snapshot.serial
        || [snapshot.make, snapshot.model].filter(Boolean).join(' ')
        || 'Equipment')
    const jobNumber = safeFilenamePart(snapshot.jobNumber || snapshot.documentNumber || 'Job')
    return `${equipment} - ${jobNumber}.pdf`
}
