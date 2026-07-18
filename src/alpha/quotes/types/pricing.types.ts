export const PRICING_CATEGORIES = {
    LABOUR: 122830000,
    PARTS: 122830001,
    SERVICE: 122830002,
    CONSUMABLES: 122830003,
    OTHER: 122830004,
    TRAVEL: 122830005,
} as const

export type PricingCategory = typeof PRICING_CATEGORIES[keyof typeof PRICING_CATEGORIES]

export const PRICING_CATEGORY_LABELS: Record<PricingCategory, string> = {
    [PRICING_CATEGORIES.LABOUR]: 'Labour',
    [PRICING_CATEGORIES.PARTS]: 'Parts',
    [PRICING_CATEGORIES.SERVICE]: 'Service',
    [PRICING_CATEGORIES.CONSUMABLES]: 'Consumables',
    [PRICING_CATEGORIES.OTHER]: 'Other',
    [PRICING_CATEGORIES.TRAVEL]: 'Travel',
}

export type PricingItem = {
    gr_pricingitemid: string
    gr_name: string
    gr_code: string | null
    gr_category: PricingCategory
    gr_description: string | null
    gr_unitlabel: string
    gr_unitprice: number
    gr_taxable: boolean
    gr_sortorder: number | null
    statecode: number
}

export type PricingItemInput = {
    name: string
    code: string
    category: PricingCategory
    description: string
    unitLabel: string
    unitPrice: number
    taxable: boolean
    sortOrder: number | null
}
