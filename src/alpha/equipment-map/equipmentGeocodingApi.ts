import type { EquipmentMapCoordinate } from './equipmentMap.types'

export type EquipmentGeocodingResult = {
    siteId: string
    address: string
    coordinate: EquipmentMapCoordinate | null
    status?: 'matched' | 'not_found' | 'provider_failed'
}

export async function geocodeEquipmentSites(
    accessToken: string,
    locations: Array<{ siteId: string; address: string }>,
) {
    const response = await fetch('/api/equipmentgeocode', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locations }),
    })
    const body = await response.json().catch(() => null) as { results?: unknown; error?: unknown } | null
    if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Equipment locations could not be resolved.')
    if (!Array.isArray(body?.results)) throw new Error('The map service returned an invalid response.')
    return body.results as EquipmentGeocodingResult[]
}
