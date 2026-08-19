import type { Equipment } from '../types/equipment.types'
import {
    equipmentCacheScope,
    invalidateSharedEquipmentDataCache,
    readPersistedEquipmentSnapshot,
    sharedEquipmentDataCache,
    writePersistedEquipmentSnapshot,
    type EquipmentCacheReadOptions,
} from '../../equipment/services/equipmentDataCache'
import { normalizeAlternateFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'
import { invalidateOperationalQueries } from '../../shared/data/OperationalDataClient'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages'
import { buildDataverseIdFilterBatches } from '../../shared/dataverse/boundedDataverseFilters'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const EQUIPMENT_SELECT = 'gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_serial,gr_make,gr_model,statecode,statuscode,gr_currenthourmeter,gr_currenthourmeterrecordeddate,gr_servicetrackingenabled,gr_registrationnumber,gr_compliancestatus,gr_wofrequired,gr_currentwofexpiry,gr_lastwofcompleted,gr_regoexpiry,gr_powertype,gr_serviceprogramme,gr_maintenanceprofile,gr_ownershiptype,gr_sitecheckavailability,gr_customaenabled,gr_custombenabled,gr_customcenabled,gr_customaintervaldays,gr_custombintervaldays,gr_customcintervaldays'
const EQUIPMENT_EXPAND = 'gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))'
const EQUIPMENT_QUERY = `gr_equipments?$select=${EQUIPMENT_SELECT}&$expand=${EQUIPMENT_EXPAND}`

async function fetchAllEquipmentPages(accessToken: string): Promise<Equipment[]> {
    const rows: Equipment[] = []
    let nextUrl: string | undefined = `${DATAVERSE_URL}/api/data/v9.2/${EQUIPMENT_QUERY}`

    while (nextUrl) {
        const result = await fetch(nextUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                Prefer: 'odata.maxpagesize=5000',
            },
        })

        if (!result.ok) {
            const error = await result.text()
            throw new Error(`Failed to fetch equipment: ${error || `${result.status} ${result.statusText}`}`)
        }

        const data = await result.json() as { value?: Equipment[]; '@odata.nextLink'?: string }
        rows.push(...(data.value ?? []))
        nextUrl = data['@odata.nextLink']
    }

    return rows
}

export async function fetchEquipment(
    accessToken: string,
    options: EquipmentCacheReadOptions & {
        useDeviceCache?: boolean
        onDeviceSnapshot?: (rows: Equipment[], savedAt: number) => void
        onBackgroundRefresh?: (rows: Equipment[], refreshedAt: number) => void
        onBackgroundRefreshError?: () => void
    } = {},
): Promise<Equipment[]> {
    const scope = equipmentCacheScope(accessToken)
    const loadNetwork = async (generation = sharedEquipmentDataCache.captureGeneration(scope)) => {
        const rows = await fetchAllEquipmentPages(accessToken)
        if (sharedEquipmentDataCache.isGenerationCurrent(scope, generation)) {
            const refreshedAt = Date.now()
            void writePersistedEquipmentSnapshot(scope, rows, refreshedAt)
            options.onBackgroundRefresh?.(rows, refreshedAt)
        }
        return rows
    }

    return sharedEquipmentDataCache.read(
        scope,
        async () => {
            if (!options.forceRefresh && options.useDeviceCache) {
                const snapshot = await readPersistedEquipmentSnapshot(scope)
                if (snapshot) {
                    options.onDeviceSnapshot?.(snapshot.rows, snapshot.savedAt)
                    const generation = sharedEquipmentDataCache.captureGeneration(scope)
                    void loadNetwork(generation)
                        .then((rows) => sharedEquipmentDataCache.writeIfCurrent(scope, generation, rows))
                        .catch(() => options.onBackgroundRefreshError?.())
                    return snapshot.rows
                }
            }
            return loadNetwork()
        },
        options,
    )
}

export async function fetchEquipmentForSites(accessToken: string, siteIds: readonly string[], signal?: AbortSignal): Promise<Equipment[]> {
    const filters = buildDataverseIdFilterBatches('_gr_site_value', siteIds)
    if (!filters.length) return []
    const rows: Equipment[] = []
    for (const filter of filters) {
        rows.push(...await fetchAllDataversePages<Equipment>(
            `${DATAVERSE_URL}/api/data/v9.2/gr_equipments?$select=${EQUIPMENT_SELECT}&$expand=${EQUIPMENT_EXPAND}&$filter=${encodeURIComponent(filter)}`,
            {
                cache: 'no-store',
                signal,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                    'Cache-Control': 'no-cache',
                    Prefer: 'odata.maxpagesize=5000',
                },
            },
            async (response) => {
                if (!response.ok) {
                    const detail = await response.text()
                    throw new Error(`Failed to fetch Customer Equipment: ${detail || `${response.status} ${response.statusText}`}`)
                }
            },
        ))
    }
    return rows
}

export async function fetchEquipmentById(accessToken: string, equipmentId: string, signal?: AbortSignal): Promise<Equipment | undefined> {
    const response = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_equipments?$select=${EQUIPMENT_SELECT}&$expand=${EQUIPMENT_EXPAND}&$filter=gr_equipmentid eq ${equipmentId}&$top=1`,
        {
            cache: 'no-store',
            signal,
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-cache' },
        },
    )
    if (!response.ok) throw new Error('The Equipment could not be refreshed.')
    return ((await response.json()) as { value?: Equipment[] }).value?.[0]
}

export function subscribeToEquipmentData(
    accessToken: string,
    listener: (rows: Equipment[], loadedAt: number) => void,
) {
    return sharedEquipmentDataCache.subscribe(equipmentCacheScope(accessToken), listener)
}

export function invalidateEquipmentCache(accessToken?: string) {
    invalidateSharedEquipmentDataCache(accessToken)
    invalidateOperationalQueries((key) =>
        (key[0] === 'equipment' && key[1] === 'operational-list')
        || key[0] === 'customer-dashboard')
}

export async function createEquipment(
    accessToken: string,
    equipment: {
        fleet: string
        alternateFleet?: string
        serial: string
        make?: string
        model?: string
    },
): Promise<string> {
    const alternateFleetNumbers = normalizeAlternateFleetNumbers(equipment.alternateFleet, equipment.fleet)
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
            gr_alternatefleetnumbers: alternateFleetNumbers || null,
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
    invalidateEquipmentCache(accessToken)
    return data.gr_equipmentid
}

export async function updateEquipmentSite(
    accessToken: string,
    equipmentId: string,
    siteId: string,
    maintenanceProfile?: number | null,
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
                ...(maintenanceProfile != null ? { gr_maintenanceprofile: maintenanceProfile } : {}),
            }),
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }
    invalidateEquipmentCache(accessToken)
}
