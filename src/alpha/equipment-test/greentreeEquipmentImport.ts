import { isServiceOperationsAdministrator } from '../../auth/adminAuthorization.ts'
import type { SignedInUserInfo } from '../../auth/signedInUser.ts'
import type { GreentreeEquipmentSnapshot, ReconciliationRow } from './greentreeReconciliation.ts'
import { invalidateSharedEquipmentDataCache } from '../equipment/services/equipmentDataCache.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''
export const GREENTREE_IMPORT_BATCH_LIMIT = 50

export type GreentreeImportResult = {
    succeeded: Array<{ sourceId: string; equipmentId: string; action: 'created' | 'updated' }>
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
    if (!row.source.fleet.trim()) issues.push('Fleet Number Code is required.')
    if (row.reasons.includes('Serial is duplicated in Greentree')) {
        issues.push('Serial is duplicated in Greentree. Resolve the duplicate before importing.')
    }
    if (!row.appEquipment && row.candidateEquipment.length > 1) {
        issues.push('Multiple app records are possible matches. Resolve the duplicate app records before importing.')
    }
    return issues
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
    invalidateSharedEquipmentDataCache(accessToken)
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

async function updateEquipmentFromGreentree(accessToken: string, equipmentId: string, source: GreentreeEquipmentSnapshot) {
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_equipments(${equipmentId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            gr_fleet: source.fleet.trim(),
            gr_serial: source.serial.trim(),
            gr_make: source.make.trim(),
            gr_model: source.model.trim(),
        }),
    })
    if (!response.ok) throw new Error(await dataverseMessage(response))
    invalidateSharedEquipmentDataCache(accessToken)
    return equipmentId
}

function importTarget(row: ReconciliationRow) {
    if (row.appEquipment) return row.appEquipment
    return row.candidateEquipment.length === 1 ? row.candidateEquipment[0] : null
}

export async function importGreentreeEquipmentBatch(
    user: SignedInUserInfo | null,
    accessToken: string,
    rows: ReconciliationRow[],
): Promise<GreentreeImportResult> {
    if (!isServiceOperationsAdministrator(user)) throw new Error('You are not authorised to import Greentree Equipment.')
    if (rows.length === 0) throw new Error('Select at least one Equipment record.')
    if (rows.length > GREENTREE_IMPORT_BATCH_LIMIT) throw new Error(`Import no more than ${GREENTREE_IMPORT_BATCH_LIMIT} records per batch.`)
    const ineligible = rows.find((row) => greentreeImportIssues(row).length > 0)
    if (ineligible) throw new Error(`${ineligible.source.fleet || ineligible.source.sourceId}: ${greentreeImportIssues(ineligible).join(' ')}`)

    const succeeded: GreentreeImportResult['succeeded'] = []
    const failed: GreentreeImportResult['failed'] = []

    for (const row of rows) {
        try {
            const target = importTarget(row)
            const equipmentId = target
                ? await updateEquipmentFromGreentree(accessToken, target.gr_equipmentid, row.source)
                : await createEquipmentFromGreentree(accessToken, row.source)
            succeeded.push({ sourceId: row.source.sourceId, equipmentId, action: target ? 'updated' : 'created' })
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
