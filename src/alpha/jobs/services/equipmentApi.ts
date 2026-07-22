import type { Equipment } from '../types/equipment.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchEquipment(accessToken: string): Promise<Equipment[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_equipments?$select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model,statecode,statuscode,gr_currenthourmeter,gr_servicetrackingenabled,gr_registrationnumber,gr_wofrequired,gr_currentwofexpiry,gr_lastwofcompleted&$expand=gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(`Failed to fetch equipment: ${error}`)
    }

    const data = await result.json()
    return data.value ?? []
}

export async function createEquipment(
    accessToken: string,
    equipment: {
        fleet: string
        serial: string
        make?: string
        model?: string
    },
): Promise<string> {
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_equipments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({
            gr_fleet: equipment.fleet,
            gr_serial: equipment.serial,
            gr_make: equipment.make,
            gr_model: equipment.model,
        }),
    })

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }

    const data = await result.json()
    return data.gr_equipmentid
}

export async function updateEquipmentSite(
    accessToken: string,
    equipmentId: string,
    siteId: string,
) {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_equipments(${equipmentId})`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                'gr_Site@odata.bind': `/gr_sites(${siteId})`,
            }),
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }
}
