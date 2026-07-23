import { fetchEquipment } from '../../jobs/services/equipmentApi'
import type { Equipment } from '../../jobs/types/equipment.types'
import { normalizeEquipmentInput, type EquipmentUpdateInput } from '../types/equipmentManager.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`

export { fetchEquipment }

function equipmentPayload(input: EquipmentUpdateInput) {
    const normalized = normalizeEquipmentInput(input)
    return {
        gr_fleet: normalized.fleet || null,
        gr_make: normalized.make || null,
        gr_model: normalized.model || null,
        gr_serial: normalized.serial || null,
        gr_registrationnumber: normalized.registrationNumber || null,
        gr_wofrequired: normalized.wofRequired,
        gr_currentwofexpiry: normalized.currentWofExpiry || null,
        gr_regoexpiry: normalized.regoExpiry || null,
        'gr_Site@odata.bind': normalized.siteId ? `/gr_sites(${normalized.siteId})` : null,
    }
}

export async function createEquipment(
    token: string,
    input: EquipmentUpdateInput,
): Promise<Equipment> {
    const response = await fetch(`${API_URL}/gr_equipments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify(equipmentPayload(input)),
    })
    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to create equipment: ${detail || `${response.status} ${response.statusText}`}`)
    }
    const data = await response.json()
    return data
}

export async function updateEquipment(
    token: string,
    equipmentId: string,
    input: EquipmentUpdateInput,
): Promise<void> {
    const response = await fetch(`${API_URL}/gr_equipments(${equipmentId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(equipmentPayload(input)),
    })

    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to update equipment: ${detail || `${response.status} ${response.statusText}`}`)
    }
}

export async function deleteEquipment(token: string, equipmentId: string): Promise<void> {
    const response = await fetch(`${API_URL}/gr_equipments(${equipmentId})`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!response.ok) {
        const detail = await response.text()
        throw new Error(`Failed to delete equipment: ${detail || `${response.status} ${response.statusText}`}`)
    }
}

export function applyEquipmentUpdate(
    equipment: Equipment,
    input: EquipmentUpdateInput,
    site: Equipment['gr_Site'],
): Equipment {
    const normalized = normalizeEquipmentInput(input)
    return {
        ...equipment,
        gr_fleet: normalized.fleet || null,
        gr_make: normalized.make || null,
        gr_model: normalized.model || null,
        gr_serial: normalized.serial || null,
        gr_registrationnumber: normalized.registrationNumber || null,
        gr_wofrequired: normalized.wofRequired,
        gr_currentwofexpiry: normalized.currentWofExpiry || null,
        gr_regoexpiry: normalized.regoExpiry || null,
        gr_Site: site,
    }
}
