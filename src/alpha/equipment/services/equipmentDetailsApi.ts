import type { Equipment } from '../../jobs/types/equipment.types'
import type { EquipmentUpdateInput } from '../types/equipmentManager.types'
import { fetchEquipmentById, invalidateEquipmentCache } from '../../jobs/services/equipmentApi'

// Deliberately excludes maintenance, compliance, ownership, state and historical readings.
export function equipmentDetailsPatch(input: EquipmentUpdateInput) {
    const id = input.siteId.trim()
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) throw new Error('Select a saved Site before moving Equipment.')
    return {
        gr_fleet: input.fleet.trim() || null,
        gr_alternatefleetnumbers: input.alternateFleetNumbers?.trim() || null,
        gr_make: input.make.trim() || null,
        gr_model: input.model.trim() || null,
        gr_serial: input.serial.trim() || null,
        'gr_Site@odata.bind': `/gr_sites(${id})`,
    }
}

export async function updateEquipmentDetails(token: string, original: Equipment, input: EquipmentUpdateInput) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(original.gr_equipmentid)) throw new Error('Invalid Equipment record.')
    const etag = original['@odata.etag']
    if (!etag || !/^(W\/)?"[^"\r\n]+"$/.test(etag)) throw new Error('Reload Equipment before saving; its version is unavailable.')
    const response = await fetch(`${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_equipments(${original.gr_equipmentid})`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(equipmentDetailsPatch(input)),
    })
    if (response.status === 412) throw new Error('Someone else changed this Equipment. Close and refresh the register before reopening it; your changes were not saved.')
    if (!response.ok) throw new Error('Equipment details could not be saved. Check your access and reload before retrying.')
    invalidateEquipmentCache()
    let saved: Equipment | undefined
    try {
        saved = await fetchEquipmentById(token, original.gr_equipmentid)
    } catch {
        throw new Error('Equipment was saved, but could not be reloaded. Close and refresh before editing again.')
    }
    if (!saved) throw new Error('Equipment was saved, but could not be reloaded. Close and refresh before editing again.')
    return saved
}
