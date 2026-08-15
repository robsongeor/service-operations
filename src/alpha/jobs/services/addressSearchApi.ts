export type VerifiedAddressSuggestion = {
    id: string
    formattedAddress: string
    addressLine1: string
    addressLine2: string
    siteName: string
    latitude: number
    longitude: number
}

export async function searchVerifiedAddresses(accessToken: string, query: string, signal?: AbortSignal) {
    const response = await fetch('/api/addresssearch', {
        method: 'POST',
        headers: {
            'X-Dataverse-Authorization': `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal,
    })
    const body = await response.json().catch(() => null) as { suggestions?: unknown; error?: unknown } | null
    if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Addresses could not be searched.')
    if (!Array.isArray(body?.suggestions)) throw new Error('The address service returned an invalid response.')
    return body.suggestions as VerifiedAddressSuggestion[]
}
