import type { PricingItem, PricingItemInput } from '../types/pricing.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const PRICING_ITEMS_URL = `${DATAVERSE_URL}/api/data/v9.2/gr_pricingitems`

const pricingItemFields = [
    'gr_pricingitemid',
    'gr_name',
    'gr_code',
    'gr_category',
    'gr_description',
    'gr_unitlabel',
    'gr_unitprice',
    'gr_taxable',
    'gr_sortorder',
    'statecode',
].join(',')

function headers(accessToken: string, includeContentType = false) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    }
}

async function throwDataverseError(response: Response, action: string) {
    if (response.ok) return

    const detail = await response.text()
    throw new Error(`${action}: ${detail || `${response.status} ${response.statusText}`}`)
}

function toDataverseItem(item: PricingItemInput) {
    return {
        gr_name: item.name.trim(),
        gr_code: item.code.trim() || null,
        gr_category: item.category,
        gr_description: item.description.trim() || null,
        gr_unitlabel: item.unitLabel.trim(),
        gr_unitprice: item.unitPrice,
        gr_taxable: item.taxable,
        gr_sortorder: item.sortOrder,
    }
}

export async function fetchPricingItems(accessToken: string, signal?: AbortSignal): Promise<PricingItem[]> {
    const response = await fetch(
        `${PRICING_ITEMS_URL}?$select=${pricingItemFields}&$orderby=gr_sortorder asc,gr_name asc`,
        {
            cache: 'no-store',
            headers: {
                ...headers(accessToken),
                'Cache-Control': 'no-cache',
            },
            signal,
        },
    )

    await throwDataverseError(response, 'Failed to load pricing items')
    const data = await response.json()
    return data.value ?? []
}

export async function createPricingItem(
    accessToken: string,
    item: PricingItemInput,
): Promise<void> {
    const response = await fetch(PRICING_ITEMS_URL, {
        method: 'POST',
        headers: headers(accessToken, true),
        body: JSON.stringify(toDataverseItem(item)),
    })

    await throwDataverseError(response, 'Failed to create pricing item')
}

export async function updatePricingItem(
    accessToken: string,
    itemId: string,
    item: PricingItemInput,
): Promise<void> {
    const response = await fetch(`${PRICING_ITEMS_URL}(${itemId})`, {
        method: 'PATCH',
        headers: headers(accessToken, true),
        body: JSON.stringify(toDataverseItem(item)),
    })

    await throwDataverseError(response, 'Failed to update pricing item')
}

export async function setPricingItemActive(
    accessToken: string,
    itemId: string,
    active: boolean,
): Promise<void> {
    const response = await fetch(`${PRICING_ITEMS_URL}(${itemId})`, {
        method: 'PATCH',
        headers: headers(accessToken, true),
        body: JSON.stringify({
            statecode: active ? 0 : 1,
            statuscode: active ? 1 : 2,
        }),
    })

    await throwDataverseError(
        response,
        `Failed to ${active ? 'activate' : 'deactivate'} pricing item`,
    )
}

export async function deletePricingItem(
    accessToken: string,
    itemId: string,
): Promise<void> {
    const response = await fetch(`${PRICING_ITEMS_URL}(${itemId})`, {
        method: 'DELETE',
        headers: headers(accessToken),
    })

    await throwDataverseError(response, 'Failed to delete pricing item')
}
