type QuoteTitleJob = {
    gr_jobnumber?: string | null
    gr_description?: string | null
}

type QuoteTitleEquipment = {
    gr_fleet?: string | null
    gr_serial?: string | null
}

type QuoteJobDefaults = {
    gr_Equipment?: { gr_equipmentid: string }
    gr_Site?: { gr_Customer?: { gr_customerid: string } }
}

const clean = (value?: string | null) => value?.trim().replace(/\s+/g, ' ') ?? ''

export function buildProtectedQuoteTitle(job?: QuoteTitleJob, equipment?: QuoteTitleEquipment) {
    return [
        clean(job?.gr_jobnumber),
        clean(equipment?.gr_fleet) || clean(equipment?.gr_serial),
        clean(job?.gr_description),
    ].filter(Boolean).join(' - ')
}

export function buildQuoteTitle(protectedTitle: string, addition: string) {
    return [clean(protectedTitle), clean(addition)].filter(Boolean).join(' - ')
}

export function extractQuoteTitleAddition(existingTitle: string, protectedTitle: string) {
    const protectedParts = new Set(
        protectedTitle.split(' - ').map((part) => clean(part).toLowerCase()).filter(Boolean),
    )
    return existingTitle
        .split(' - ')
        .map(clean)
        .filter((part) => part && !protectedParts.has(part.toLowerCase()))
        .join(' - ')
}

export function getQuoteJobDefaults(job?: QuoteJobDefaults) {
    return {
        customerId: job?.gr_Site?.gr_Customer?.gr_customerid ?? '',
        equipmentId: job?.gr_Equipment?.gr_equipmentid ?? '',
    }
}
