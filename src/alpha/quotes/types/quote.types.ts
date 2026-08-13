import type { PricingCategory } from './pricing.types'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'

export const QUOTE_STATUSES = {
    DRAFT: 122830000,
    SENT: 122830001,
    ACCEPTED: 122830002,
    DECLINED: 122830003,
    EXPIRED: 122830004,
} as const

export type QuoteStatus = typeof QUOTE_STATUSES[keyof typeof QUOTE_STATUSES]

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
    [QUOTE_STATUSES.DRAFT]: 'Draft',
    [QUOTE_STATUSES.SENT]: 'Sent',
    [QUOTE_STATUSES.ACCEPTED]: 'Accepted',
    [QUOTE_STATUSES.DECLINED]: 'Declined',
    [QUOTE_STATUSES.EXPIRED]: 'Expired',
}

export const QUOTE_STATUS_OPTIONS = Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => ({
    value: Number(value) as QuoteStatus,
    label,
}))

export type QuoteJob = {
    gr_jobid: string
    gr_jobnumber: string | null
    gr_description: string | null
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet: string | null
        gr_make: string | null
        gr_model: string | null
        gr_serial: string | null
    }
    gr_Site?: {
        gr_siteid: string
        gr_name: string
        gr_address?: string | null
        gr_Customer?: {
            gr_customerid: string
            gr_name: string
        }
    }
}

export type Quote = {
    gr_quoteid: string
    gr_name: string
    gr_quotenumber: string | null
    gr_quotestatus: QuoteStatus
    gr_revision: number
    gr_quotedate: string
    gr_validuntil: string | null
    gr_notes: string | null
    gr_gstrate: number
    gr_subtotal: number
    gr_gst: number
    gr_total: number
    createdon: string
    _gr_job_value: string | null
    _gr_customer_value?: string | null
    _gr_equipment_value?: string | null
    _createdby_value?: string | null
    gr_Job?: QuoteJob
    gr_Customer?: Customer
    gr_Equipment?: Equipment
    createdby?: {
        systemuserid: string
        fullname: string
        azureactivedirectoryobjectid?: string | null
    }
}

export type QuoteLine = {
    gr_quotelineid: string
    gr_name: string
    _gr_quote_value: string
    _gr_pricingitem_value: string | null
    gr_category: PricingCategory
    gr_description: string
    gr_quantity: number
    gr_unitlabel: string | null
    gr_unitprice: number
    gr_extendedprice: number
    gr_taxable: boolean
    gr_sortorder: number
}

export type QuoteLineInput = {
    id?: string
    pricingItemId: string | null
    category: PricingCategory
    description: string
    quantity: number
    unitLabel: string
    unitPrice: number
    taxable: boolean
    sortOrder: number
}

export type QuoteInput = {
    name: string
    jobId: string
    customerId: string
    equipmentId: string
    status: QuoteStatus
    revision: number
    quoteDate: string
    validUntil: string
    notes: string
    gstRate: number
    subtotal: number
    gst: number
    total: number
    lines: QuoteLineInput[]
}
