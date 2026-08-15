import type { Equipment } from '../jobs/types/equipment.types.ts'
import type { GreentreeRecord } from './greentreeEquipmentApi.ts'

const FORMATTED_VALUE = '@OData.Community.Display.V1.FormattedValue'

const fieldAliases = {
    fleet: ['code', 'fleetnumbercode', 'fleetnumber', 'fleetno', 'fleet'],
    make: ['make'],
    model: ['model'],
    serial: ['serial', 'serialnumber'],
    siteAddress1: ['siteaddress1', 'siteaddressline1', 'address1', 'addressline1'],
    siteAddress3: ['siteaddress3', 'siteaddressline3', 'address3', 'addressline3'],
    siteName: ['sitename', 'site'],
    codeActive: ['codeactive'],
} as const

export type GreentreeEquipmentSnapshot = {
    sourceId: string
    fleet: string
    make: string
    model: string
    serial: string
    siteAddress1: string
    siteAddress3: string
    siteName: string
    codeActive: string
}

export type ReconciliationStatus = 'exact' | 'probable' | 'new' | 'conflict'

export type ReconciliationDifference = {
    field: string
    appValue: string
    greentreeValue: string
}

export type ReconciliationRow = {
    status: ReconciliationStatus
    source: GreentreeEquipmentSnapshot
    appEquipment: Equipment | null
    candidateEquipment: Equipment[]
    reasons: string[]
    qualityIssues: string[]
    differences: ReconciliationDifference[]
}

export type ReconciliationResult = {
    rows: ReconciliationRow[]
    appOnly: Equipment[]
}

export function reconciliationReviewCount(row: ReconciliationRow) {
    return row.reasons.length + row.qualityIssues.length + row.differences.length
}

export type GreentreeSourceProfile = {
    totalRows: number
    fleet: IdentityProfile
    serial: IdentityProfile
    missingMake: number
    missingModel: number
    missingSiteName: number
    missingSiteAddress: number
    distinctSiteNames: number
    distinctSiteAddresses: number
    codeActiveValues: Array<{ value: string; count: number }>
    conflictReasons: Array<{ value: string; count: number }>
    legacyAppFleetLabels: number
}

type IdentityProfile = {
    missing: number
    uniqueValues: number
    duplicateValues: number
    duplicateRows: number
}

export const normalizeIdentity = (value?: string | null) => value?.trim().toLocaleLowerCase().replace(/\s+/g, ' ') ?? ''

const normalizedKey = (key: string) => key
    .replace(/^_/, '')
    .replace(/_value$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()

const logicalSuffix = (key: string) => {
    const unwrapped = key.replace(/^_/, '').replace(/_value$/i, '')
    const separator = unwrapped.indexOf('_')
    return normalizedKey(separator >= 0 ? unwrapped.slice(separator + 1) : unwrapped)
}

function resolveKey(keys: string[], aliases: readonly string[]) {
    for (const alias of aliases) {
        const exact = keys.find((key) => logicalSuffix(key) === alias)
        if (exact) return exact
    }
    return keys.find((key) => aliases.some((alias) => normalizedKey(key).endsWith(alias))) ?? null
}

function recordText(record: GreentreeRecord, key: string | null) {
    if (!key) return ''
    const value = record[`${key}${FORMATTED_VALUE}`] ?? record[key]
    return value == null ? '' : String(value).trim()
}

export function mapGreentreeEquipmentRecords(records: GreentreeRecord[], primaryIdAttribute: string) {
    const keys = [...new Set(records.flatMap((record) => Object.keys(record).filter((key) =>
        !key.startsWith('@odata.') && !key.includes('@OData.') && !key.endsWith('_base'),
    )))]
    const resolved = {
        fleet: resolveKey(keys, fieldAliases.fleet),
        make: resolveKey(keys, fieldAliases.make),
        model: resolveKey(keys, fieldAliases.model),
        serial: resolveKey(keys, fieldAliases.serial),
        siteAddress1: resolveKey(keys, fieldAliases.siteAddress1),
        siteAddress3: resolveKey(keys, fieldAliases.siteAddress3),
        siteName: resolveKey(keys, fieldAliases.siteName),
        codeActive: resolveKey(keys, fieldAliases.codeActive),
    }

    return records.map((record, index): GreentreeEquipmentSnapshot => ({
        sourceId: recordText(record, primaryIdAttribute) || `source-row-${index + 1}`,
        fleet: recordText(record, resolved.fleet),
        make: recordText(record, resolved.make),
        model: recordText(record, resolved.model),
        serial: recordText(record, resolved.serial),
        siteAddress1: recordText(record, resolved.siteAddress1),
        siteAddress3: recordText(record, resolved.siteAddress3),
        siteName: recordText(record, resolved.siteName),
        codeActive: recordText(record, resolved.codeActive),
    }))
}

function indexEquipment(equipment: Equipment[], value: (item: Equipment) => string | null) {
    const index = new Map<string, Equipment[]>()
    equipment.forEach((item) => {
        const key = normalizeIdentity(value(item))
        if (key) index.set(key, [...(index.get(key) ?? []), item])
    })
    return index
}

function sourceCounts(source: GreentreeEquipmentSnapshot[], value: (item: GreentreeEquipmentSnapshot) => string) {
    const counts = new Map<string, number>()
    source.forEach((item) => {
        const key = normalizeIdentity(value(item))
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return counts
}

function differences(source: GreentreeEquipmentSnapshot, equipment: Equipment) {
    const fields = [
        ['Fleet Number', equipment.gr_fleet ?? '', source.fleet],
        ['Make', equipment.gr_make ?? '', source.make],
        ['Model', equipment.gr_model ?? '', source.model],
        ['Serial', equipment.gr_serial ?? '', source.serial],
    ] as const
    return fields
        .filter(([, appValue, greentreeValue]) => normalizeIdentity(appValue) !== normalizeIdentity(greentreeValue))
        .map(([field, appValue, greentreeValue]) => ({ field, appValue, greentreeValue }))
}

export function reconcileGreentreeEquipment(
    source: GreentreeEquipmentSnapshot[],
    equipment: Equipment[],
): ReconciliationResult {
    const appByFleet = indexEquipment(equipment, (item) => item.gr_fleet)
    const appBySerial = indexEquipment(equipment, (item) => item.gr_serial)
    const sourceFleetCounts = sourceCounts(source, (item) => item.fleet)
    const sourceSerialCounts = sourceCounts(source, (item) => item.serial)
    const referencedAppIds = new Set<string>()

    const rows = source.map((item): ReconciliationRow => {
        const fleetKey = normalizeIdentity(item.fleet)
        const serialKey = normalizeIdentity(item.serial)
        const fleetMatches = fleetKey ? appByFleet.get(fleetKey) ?? [] : []
        const serialMatches = serialKey ? appBySerial.get(serialKey) ?? [] : []
        const candidates = [...new Map([...fleetMatches, ...serialMatches].map((record) => [record.gr_equipmentid, record])).values()]
        candidates.forEach((record) => referencedAppIds.add(record.gr_equipmentid))
        const reasons: string[] = []
        const qualityIssues: string[] = []

        if (!item.fleet) qualityIssues.push('Fleet Number Code missing')
        if (!item.serial) qualityIssues.push('Serial missing')
        if (!item.make) qualityIssues.push('Make missing')
        if (!item.model) qualityIssues.push('Model missing')

        if (fleetKey && (sourceFleetCounts.get(fleetKey) ?? 0) > 1) reasons.push('Fleet Number Code is duplicated in Greentree')
        if (serialKey && (sourceSerialCounts.get(serialKey) ?? 0) > 1) reasons.push('Serial is duplicated in Greentree')
        if (fleetMatches.length > 1) reasons.push('Fleet Number Code matches multiple app records')
        if (serialMatches.length > 1) reasons.push('Serial matches multiple app records')

        const fleetMatch = fleetMatches.length === 1 ? fleetMatches[0] : null
        const serialMatch = serialMatches.length === 1 ? serialMatches[0] : null
        if (fleetMatch && serialMatch && fleetMatch.gr_equipmentid !== serialMatch.gr_equipmentid) {
            reasons.push('Fleet Number Code and Serial point to different app records')
        }

        let status: ReconciliationStatus
        let appEquipment: Equipment | null = null
        if (reasons.length > 0 || !fleetKey && !serialKey) {
            status = 'conflict'
            if (!fleetKey && !serialKey) reasons.push('No Fleet Number Code or Serial is available for matching')
        } else if (fleetMatch && serialMatch && fleetMatch.gr_equipmentid === serialMatch.gr_equipmentid) {
            status = 'exact'
            appEquipment = fleetMatch
        } else if (candidates.length === 1) {
            status = 'probable'
            appEquipment = candidates[0]
            reasons.push(fleetMatch ? 'Matched by Fleet Number Code only' : 'Matched by Serial only')
        } else {
            status = 'new'
        }

        return {
            status,
            source: item,
            appEquipment,
            candidateEquipment: candidates,
            reasons,
            qualityIssues,
            differences: appEquipment ? differences(item, appEquipment) : [],
        }
    })

    return {
        rows,
        appOnly: equipment.filter((item) => !referencedAppIds.has(item.gr_equipmentid)),
    }
}

function profileIdentity(source: GreentreeEquipmentSnapshot[], value: (item: GreentreeEquipmentSnapshot) => string): IdentityProfile {
    const counts = sourceCounts(source, value)
    const duplicateCounts = [...counts.values()].filter((count) => count > 1)
    return {
        missing: source.filter((item) => !normalizeIdentity(value(item))).length,
        uniqueValues: [...counts.values()].filter((count) => count === 1).length,
        duplicateValues: duplicateCounts.length,
        duplicateRows: duplicateCounts.reduce((total, count) => total + count, 0),
    }
}

function valueDistribution(values: string[], blankLabel: string) {
    const counts = new Map<string, number>()
    values.forEach((value) => {
        const label = value.trim() || blankLabel
        counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
}

export function profileGreentreeEquipment(
    source: GreentreeEquipmentSnapshot[],
    reconciliation: ReconciliationResult,
    appEquipment: Equipment[],
): GreentreeSourceProfile {
    const siteAddresses = source.map((item) => [item.siteAddress1, item.siteAddress3].filter(Boolean).join(', '))
    return {
        totalRows: source.length,
        fleet: profileIdentity(source, (item) => item.fleet),
        serial: profileIdentity(source, (item) => item.serial),
        missingMake: source.filter((item) => !normalizeIdentity(item.make)).length,
        missingModel: source.filter((item) => !normalizeIdentity(item.model)).length,
        missingSiteName: source.filter((item) => !normalizeIdentity(item.siteName)).length,
        missingSiteAddress: siteAddresses.filter((value) => !normalizeIdentity(value)).length,
        distinctSiteNames: new Set(source.map((item) => normalizeIdentity(item.siteName)).filter(Boolean)).size,
        distinctSiteAddresses: new Set(siteAddresses.map(normalizeIdentity).filter(Boolean)).size,
        codeActiveValues: valueDistribution(source.map((item) => item.codeActive), 'Blank'),
        conflictReasons: valueDistribution(reconciliation.rows.flatMap((row) => row.status === 'conflict' ? row.reasons : []), 'Unspecified'),
        legacyAppFleetLabels: appEquipment.filter((item) => /\bex\s*fn\s*\d+/i.test(item.gr_fleet ?? '')).length,
    }
}
