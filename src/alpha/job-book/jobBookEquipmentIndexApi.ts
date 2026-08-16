import type { PrototypeEquipment } from './jobBookPrototype'
import {
    jobBookEquipmentIndexScope,
    readPersistedJobBookEquipmentIndex,
    sharedJobBookEquipmentIndexCache,
    writePersistedJobBookEquipmentIndex,
    type JobBookEquipmentIndexCacheOptions,
} from './jobBookEquipmentIndexCache'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const EQUIPMENT_INDEX_QUERY = 'gr_equipments?$select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_serial,gr_make,gr_model&$expand=gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))'

type EquipmentIndexApiRow = {
    gr_equipmentid: string
    gr_fleet: string | null
    gr_alternatefleetnumbers?: string | null
    gr_serial: string | null
    gr_make: string | null
    gr_model: string | null
    gr_Site?: {
        gr_siteid: string
        gr_name: string | null
        gr_address: string | null
        gr_Customer?: { gr_customerid: string; gr_name: string | null }
    }
}

type FetchJobBookEquipmentIndexOptions = JobBookEquipmentIndexCacheOptions & {
    useDeviceCache?: boolean
    onDeviceSnapshot?: (rows: PrototypeEquipment[], savedAt: number) => void
    onBackgroundRefresh?: (rows: PrototypeEquipment[], refreshedAt: number) => void
    onBackgroundRefreshError?: () => void
}

function trustedNextLink(value?: string) {
    if (!value) return undefined
    const next = new URL(value, DATAVERSE_URL)
    if (next.origin !== new URL(DATAVERSE_URL).origin) throw new Error('Dataverse returned an invalid Equipment continuation link.')
    return next.toString()
}

export function mapJobBookEquipmentIndexRow(row: EquipmentIndexApiRow): PrototypeEquipment {
    return {
        id: row.gr_equipmentid,
        fleet: row.gr_fleet?.trim() ?? '',
        alternateFleetNumbers: row.gr_alternatefleetnumbers?.trim() ?? '',
        serial: row.gr_serial?.trim() ?? '',
        make: row.gr_make?.trim() ?? '',
        model: row.gr_model?.trim() ?? '',
        customer: row.gr_Site?.gr_Customer?.gr_name?.trim() ?? '',
        customerId: row.gr_Site?.gr_Customer?.gr_customerid ?? '',
        site: row.gr_Site?.gr_name?.trim() ?? '',
        siteId: row.gr_Site?.gr_siteid ?? '',
        address: row.gr_Site?.gr_address?.trim() ?? '',
        addressVerified: Boolean(row.gr_Site?.gr_address?.trim()),
        addressNotFoundConfirmed: false,
        isLocal: false,
    }
}

async function fetchAllEquipmentIndexPages(accessToken: string) {
    const rows: PrototypeEquipment[] = []
    let nextUrl: string | undefined = `${DATAVERSE_URL}/api/data/v9.2/${EQUIPMENT_INDEX_QUERY}`
    while (nextUrl) {
        const response = await fetch(nextUrl, {
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                Prefer: 'odata.maxpagesize=5000',
            },
        })
        if (!response.ok) throw new Error('The Job Book Equipment index could not be loaded.')
        const page = await response.json() as { value?: EquipmentIndexApiRow[]; '@odata.nextLink'?: string }
        rows.push(...(page.value ?? []).map(mapJobBookEquipmentIndexRow))
        nextUrl = trustedNextLink(page['@odata.nextLink'])
    }
    return rows
}

export async function fetchJobBookEquipmentIndex(
    accessToken: string,
    options: FetchJobBookEquipmentIndexOptions = {},
) {
    const scope = jobBookEquipmentIndexScope(accessToken)
    const loadNetwork = async () => {
        const rows = await fetchAllEquipmentIndexPages(accessToken)
        const refreshedAt = Date.now()
        void writePersistedJobBookEquipmentIndex(scope, rows, refreshedAt)
        options.onBackgroundRefresh?.(rows, refreshedAt)
        return rows
    }

    return sharedJobBookEquipmentIndexCache.read(scope, async () => {
        if (!options.forceRefresh && options.useDeviceCache) {
            const snapshot = await readPersistedJobBookEquipmentIndex(scope)
            if (snapshot) {
                options.onDeviceSnapshot?.(snapshot.rows, snapshot.savedAt)
                void loadNetwork()
                    .then((rows) => sharedJobBookEquipmentIndexCache.write(scope, rows))
                    .catch(() => options.onBackgroundRefreshError?.())
                return snapshot.rows
            }
        }
        return loadNetwork()
    }, options)
}
