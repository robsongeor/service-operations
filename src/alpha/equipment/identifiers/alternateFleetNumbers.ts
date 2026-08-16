import type { Equipment } from '../../jobs/types/equipment.types'

export const ALTERNATE_FLEET_NUMBER_LIMIT = 20
export const ALTERNATE_FLEET_NUMBER_LENGTH = 100

const identityKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

export function parseAlternateFleetNumbers(value?: string | null) {
    if (!value) return []
    const seen = new Set<string>()
    return value
        .split(/[\r\n,;]+/)
        .map((item) => item.trim().replace(/\s+/g, ' '))
        .filter((item) => {
            const key = identityKey(item)
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
        })
}

export function normalizeAlternateFleetNumbers(value?: string | null, primaryFleet?: string | null) {
    const primaryKey = identityKey(primaryFleet ?? '')
    const values = parseAlternateFleetNumbers(value).filter((item) => identityKey(item) !== primaryKey)
    if (values.length > ALTERNATE_FLEET_NUMBER_LIMIT) {
        throw new Error(`Enter no more than ${ALTERNATE_FLEET_NUMBER_LIMIT} alternate Fleet Numbers.`)
    }
    const tooLong = values.find((item) => item.length > ALTERNATE_FLEET_NUMBER_LENGTH)
    if (tooLong) {
        throw new Error(`Each alternate Fleet Number must be ${ALTERNATE_FLEET_NUMBER_LENGTH} characters or fewer.`)
    }
    return values.join('\n')
}

export function preservePreviousFleetNumber(
    alternateFleetNumbers: string,
    previousFleet: string | null | undefined,
    nextFleet: string,
) {
    if (!previousFleet?.trim() || identityKey(previousFleet) === identityKey(nextFleet)) {
        return normalizeAlternateFleetNumbers(alternateFleetNumbers, nextFleet)
    }
    return normalizeAlternateFleetNumbers(`${alternateFleetNumbers}\n${previousFleet}`, nextFleet)
}

export function equipmentIdentifierSearchValues(equipment: Equipment) {
    return [
        equipment.gr_fleet,
        ...parseAlternateFleetNumbers(equipment.gr_alternatefleetnumbers),
        equipment.gr_serial,
    ].filter((value): value is string => Boolean(value?.trim()))
}
