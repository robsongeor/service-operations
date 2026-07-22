import { fetchEquipment } from '../../jobs/services/equipmentApi'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { EquipmentUpdateInput } from '../types/equipmentManager.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`

export { fetchEquipment }

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
        body: JSON.stringify({
            gr_fleet: input.fleet.trim() || null,
            gr_make: input.make.trim() || null,
            gr_model: input.model.trim() || null,
            gr_serial: input.serial.trim() || null,
            gr_registrationnumber: input.registrationNumber.trim() || null,
            gr_wofrequired: input.wofRequired,
            gr_currentwofexpiry: input.currentWofExpiry || null,
            'gr_Site@odata.bind': input.siteId ? `/gr_sites(${input.siteId})` : null,
        }),
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
        body: JSON.stringify({
            gr_fleet: input.fleet.trim() || null,
            gr_make: input.make.trim() || null,
            gr_model: input.model.trim() || null,
            gr_serial: input.serial.trim() || null,
            gr_registrationnumber: input.registrationNumber.trim() || null,
            gr_wofrequired: input.wofRequired,
            gr_currentwofexpiry: input.currentWofExpiry || null,
            'gr_Site@odata.bind': input.siteId ? `/gr_sites(${input.siteId})` : null,
        }),
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
    return {
        ...equipment,
        gr_fleet: input.fleet.trim() || null,
        gr_make: input.make.trim() || null,
        gr_model: input.model.trim() || null,
        gr_serial: input.serial.trim() || null,
        gr_registrationnumber: input.registrationNumber.trim() || null,
        gr_wofrequired: input.wofRequired,
        gr_currentwofexpiry: input.currentWofExpiry || null,
        gr_Site: site,
    }
}
