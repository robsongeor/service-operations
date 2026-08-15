import type { Equipment } from '../jobs/types/equipment.types.ts'
import { isServiceOperationsAdministrator } from '../../auth/adminAuthorization.ts'
import type { SignedInUserInfo } from '../../auth/signedInUser.ts'
import type { GreentreeEquipmentSnapshot, ReconciliationRow } from './greentreeReconciliation.ts'
import { normalizeIdentity } from './greentreeReconciliation.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''
export const GREENTREE_IMPORT_BATCH_LIMIT = 50

export type GreentreeImportResult = {
    succeeded: Array<{ sourceId: string; equipmentId: string }>
    failed: Array<{ sourceId: string; fleet: string; message: string }>
}

export function greentreeImportBatches(rows: ReconciliationRow[]) {
    const batches: ReconciliationRow[][] = []
    for (let index = 0; index < rows.length; index += GREENTREE_IMPORT_BATCH_LIMIT) {
        batches.push(rows.slice(index, index + GREENTREE_IMPORT_BATCH_LIMIT))
    }
    return batches
}

export function greentreeImportIssues(row: ReconciliationRow) {
    const issues: string[] = []
    if (row.status !== 'new') issues.push('Only New records can be imported.')
    if (!row.source.fleet.trim()) issues.push('Fleet Number Code is required.')
    if (!row.source.serial.trim()) issues.push('Serial is required.')
    if (!row.source.make.trim()) issues.push('Make is required.')
    if (!row.source.model.trim()) issues.push('Model is required.')
    return issues
}

function existingIdentity(equipment: Equipment[]) {
    return {
        fleets: new Set(equipment.map((item) => normalizeIdentity(item.gr_fleet)).filter(Boolean)),
        serials: new Set(equipment.map((item) => normalizeIdentity(item.gr_serial)).filter(Boolean)),
    }
}

async function dataverseMessage(response: Response) {
    const text = await response.text()
    if (!text) return `${response.status} ${response.statusText}`
    try {
        const parsed = JSON.parse(text) as { error?: { message?: string }; gr_equipmentid?: string }
        return parsed.error?.message || text
    } catch {
        return text
    }
}

async function createEquipmentFromGreentree(accessToken: string, source: GreentreeEquipmentSnapshot) {
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_equipments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({
            gr_fleet: source.fleet.trim(),
            gr_serial: source.serial.trim(),
            gr_make: source.make.trim(),
            gr_model: source.model.trim(),
        }),
    })
    if (!response.ok) throw new Error(await dataverseMessage(response))
    const text = await response.text()
    if (text) {
        const data = JSON.parse(text) as { gr_equipmentid?: string }
        if (data.gr_equipmentid) return data.gr_equipmentid
    }
    const entityUrl = response.headers.get('OData-EntityId') ?? response.headers.get('odata-entityid')
    const id = entityUrl?.match(/\(([^)]+)\)/)?.[1]
    if (!id) throw new Error('Equipment was created but Dataverse did not return its ID.')
    return id
}

export async function importGreentreeEquipmentBatch(
    user: SignedInUserInfo | null,
    accessToken: string,
    rows: ReconciliationRow[],
    fetchCurrentEquipment: (token: string) => Promise<Equipment[]>,
): Promise<GreentreeImportResult> {
    if (!isServiceOperationsAdministrator(user)) throw new Error('You are not authorised to import Greentree Equipment.')
    if (rows.length === 0) throw new Error('Select at least one Equipment record.')
    if (rows.length > GREENTREE_IMPORT_BATCH_LIMIT) throw new Error(`Import no more than ${GREENTREE_IMPORT_BATCH_LIMIT} records per batch.`)
    const ineligible = rows.find((row) => greentreeImportIssues(row).length > 0)
    if (ineligible) throw new Error(`${ineligible.source.fleet || ineligible.source.sourceId}: ${greentreeImportIssues(ineligible).join(' ')}`)

    const current = await fetchCurrentEquipment(accessToken)
    const identities = existingIdentity(current)
    const succeeded: GreentreeImportResult['succeeded'] = []
    const failed: GreentreeImportResult['failed'] = []

    for (const row of rows) {
        const fleet = normalizeIdentity(row.source.fleet)
        const serial = normalizeIdentity(row.source.serial)
        if (identities.fleets.has(fleet)) {
            failed.push({ sourceId: row.source.sourceId, fleet: row.source.fleet, message: 'Fleet Number Code now exists in the app. Nothing was created.' })
            continue
        }
        if (identities.serials.has(serial)) {
            failed.push({ sourceId: row.source.sourceId, fleet: row.source.fleet, message: 'Serial now exists in the app. Nothing was created.' })
            continue
        }
        try {
            const equipmentId = await createEquipmentFromGreentree(accessToken, row.source)
            identities.fleets.add(fleet)
            identities.serials.add(serial)
            succeeded.push({ sourceId: row.source.sourceId, equipmentId })
        } catch (error) {
            failed.push({
                sourceId: row.source.sourceId,
                fleet: row.source.fleet,
                message: error instanceof Error ? error.message : 'Dataverse rejected the Equipment creation.',
            })
        }
    }
    return { succeeded, failed }
}
