import type { Equipment } from '../types/equipment.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchEquipment(accessToken: string): Promise<Equipment[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_equipments?$select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model&$expand=gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_name))`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
    )

    const data = await result.json()
    return data.value ?? []
}