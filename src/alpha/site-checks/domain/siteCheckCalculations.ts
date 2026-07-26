import { JOB_STATUSES } from '../../jobs/types/jobStatus.types.ts'
import { EQUIPMENT_OWNERSHIP_TYPES } from '../../equipment/types/equipmentOwnership.types.ts'
import { newZealandDateOnly } from '../../shared/dates/dateOnly.ts'
import {
    EQUIPMENT_SITE_CHECK_AVAILABILITIES,
    resolveEquipmentSiteCheckAvailability,
    type EquipmentSiteCheckAvailability,
} from '../../equipment/types/equipmentSiteCheckAvailability.types.ts'
import {
    SITE_CHECK_FREQUENCIES,
    SITE_CHECK_EQUIPMENT_SCOPES,
    resolveSiteCheckEquipmentScope,
    type SiteCheckEquipmentScope,
    type SiteCheckFrequency,
    type SiteCheckCreationConflict,
    type SiteCheckJobProgressInput,
    type SiteCheckProgress,
    type SiteCheckSchedule,
    type SiteCheckScheduleState,
    type SiteCheckScheduleValidation,
    type SiteCheckStartValidation,
} from '../types/siteCheck.types.ts'

type SiteCheckEquipmentCandidate = {
    gr_equipmentid?: string
    gr_ownershiptype?: number | null
    gr_sitecheckavailability?: EquipmentSiteCheckAvailability | null
}

export function equipmentIsIncludedInSiteCheck(
    equipment: SiteCheckEquipmentCandidate,
    scope?: SiteCheckEquipmentScope | null,
    selectedEquipmentIds: readonly string[] = [],
) {
    const resolvedScope = resolveSiteCheckEquipmentScope(scope)
    if (resolvedScope === SITE_CHECK_EQUIPMENT_SCOPES.ALL_EQUIPMENT) return true
    if (resolvedScope === SITE_CHECK_EQUIPMENT_SCOPES.LIFTRUCKS_RENTALS_ONLY) {
        return equipment.gr_ownershiptype === EQUIPMENT_OWNERSHIP_TYPES.LIFTRUCKS_RENTAL
    }
    const selected = new Set(selectedEquipmentIds.map((id) => id.toLowerCase()))
    return Boolean(equipment.gr_equipmentid)
        && selected.has(equipment.gr_equipmentid!.toLowerCase())
}

export function filterSiteCheckEquipment<T extends SiteCheckEquipmentCandidate>(
    equipment: readonly T[],
    scope?: SiteCheckEquipmentScope | null,
    selectedEquipmentIds: readonly string[] = [],
) {
    return equipment.filter((item) =>
        equipmentIsIncludedInSiteCheck(item, scope, selectedEquipmentIds)
        && resolveEquipmentSiteCheckAvailability(item.gr_sitecheckavailability)
            === EQUIPMENT_SITE_CHECK_AVAILABILITIES.AVAILABLE_AT_SITE)
}

export function siteCheckUnavailableEquipment<T extends SiteCheckEquipmentCandidate>(
    equipment: readonly T[],
    scope?: SiteCheckEquipmentScope | null,
    selectedEquipmentIds: readonly string[] = [],
) {
    return equipment.filter((item) =>
        equipmentIsIncludedInSiteCheck(item, scope, selectedEquipmentIds)
        && resolveEquipmentSiteCheckAvailability(item.gr_sitecheckavailability)
            !== EQUIPMENT_SITE_CHECK_AVAILABILITIES.AVAILABLE_AT_SITE)
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateOnly(value: string) {
    const match = DATE_ONLY_PATTERN.exec(value)
    if (!match) return null

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) return null

    return { year, month, day, date }
}

function formatDateOnly(year: number, month: number, day: number) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isValidDateOnly(value?: string | null): value is string {
    return typeof value === 'string' && parseDateOnly(value) !== null
}

export function addCalendarDaysDateOnly(value: string, days: number) {
    const parsed = parseDateOnly(value)
    if (!parsed || !Number.isInteger(days)) return ''
    parsed.date.setUTCDate(parsed.date.getUTCDate() + days)
    return formatDateOnly(
        parsed.date.getUTCFullYear(),
        parsed.date.getUTCMonth() + 1,
        parsed.date.getUTCDate(),
    )
}

export function addCalendarMonthsDateOnly(value: string, months: number) {
    const parsed = parseDateOnly(value)
    if (!parsed || !Number.isInteger(months)) return ''

    const targetMonthIndex = (parsed.year * 12) + (parsed.month - 1) + months
    const targetYear = Math.floor(targetMonthIndex / 12)
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

    return formatDateOnly(targetYear, targetMonth + 1, Math.min(parsed.day, lastDay))
}

export function siteCheckJobDescription(
    frequency: SiteCheckFrequency,
    startedOn: string,
) {
    const startedDate = newZealandDateOnly(startedOn)
    const parsed = parseDateOnly(startedDate)
    if (!parsed) throw new Error('A valid Site Check start time is required.')
    const weekStart = addCalendarDaysDateOnly(
        startedDate,
        -((parsed.date.getUTCDay() + 6) % 7),
    )
    const [year, month, day] = weekStart.split('-')
    const frequencyLabel = frequency === SITE_CHECK_FREQUENCIES.WEEKLY
        ? 'Weekly'
        : frequency === SITE_CHECK_FREQUENCIES.FORTNIGHTLY
            ? 'Fortnightly'
            : frequency === SITE_CHECK_FREQUENCIES.MONTHLY
                ? 'Monthly'
                : ''
    if (!frequencyLabel) throw new Error('A valid Site Check frequency is required.')
    return `${frequencyLabel} checks for ${day}/${month}/${year}`
}

export function calculateNextSiteCheckDueDate(
    completedDate: string,
    frequency: SiteCheckFrequency,
) {
    if (!isValidDateOnly(completedDate)) {
        throw new Error('A valid completion date is required to calculate the next Site Check.')
    }

    switch (frequency) {
        case SITE_CHECK_FREQUENCIES.WEEKLY:
            return addCalendarDaysDateOnly(completedDate, 7)
        case SITE_CHECK_FREQUENCIES.FORTNIGHTLY:
            return addCalendarDaysDateOnly(completedDate, 14)
        case SITE_CHECK_FREQUENCIES.MONTHLY:
            return addCalendarMonthsDateOnly(completedDate, 1)
        default:
            throw new Error('A valid Site Check frequency is required.')
    }
}

export function validateSiteCheckSchedule(input: {
    enabled: boolean
    frequency?: SiteCheckFrequency | null
    nextDueDate?: string | null
}): SiteCheckScheduleValidation {
    if (!input.enabled) return { valid: true, errors: [] }

    const errors: string[] = []
    if (!Object.values(SITE_CHECK_FREQUENCIES).includes(input.frequency as SiteCheckFrequency)) {
        errors.push('Select a Site Check frequency.')
    }
    if (!isValidDateOnly(input.nextDueDate)) {
        errors.push('Enter a valid next due date.')
    }
    return { valid: errors.length === 0, errors }
}

export function getSiteCheckScheduleState(input: {
    enabled: boolean
    frequency?: SiteCheckFrequency | null
    nextDueDate?: string | null
    activeSiteCheckId?: string | null
    today: string
}): SiteCheckScheduleState {
    if (!input.enabled) return 'disabled'
    if (!validateSiteCheckSchedule(input).valid || !isValidDateOnly(input.today)) return 'invalid'
    if (input.activeSiteCheckId) return 'in-progress'
    if (input.nextDueDate! < input.today) return 'overdue'
    if (input.nextDueDate === input.today) return 'due'
    return 'up-to-date'
}

export function calculateSiteCheckProgress(
    jobs: readonly SiteCheckJobProgressInput[],
    expectedJobCount: number,
): SiteCheckProgress {
    const total = jobs.length
    const completed = jobs.filter((job) => job.gr_status === JOB_STATUSES.COMPLETE).length
    const expected = Number.isInteger(expectedJobCount) && expectedJobCount > 0
        ? expectedJobCount
        : 0

    return {
        total,
        completed,
        remaining: total - completed,
        expected,
        hasIntegrityMismatch: expected !== total,
        isComplete: expected > 0 && total === expected && completed === total,
    }
}

export function wasSiteCheckCompletedLate(
    completedOn: string | null | undefined,
    dueDateSnapshot: string,
) {
    const completedDate = completedOn?.slice(0, 10)
    if (!isValidDateOnly(completedDate) || !isValidDateOnly(dueDateSnapshot)) return false
    return completedDate > dueDateSnapshot
}

export function isValidSiteCheckRequestKey(value?: string | null) {
    return typeof value === 'string'
        && value.length <= 100
        && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function validateSiteCheckStart(input: {
    schedule?: SiteCheckSchedule | null
    technicianId?: string | null
    equipmentCount: number
    requestKey?: string | null
    creationInProgress?: boolean
}): SiteCheckStartValidation {
    const errors: string[] = []
    const schedule = input.schedule

    if (!schedule) {
        errors.push('A Site Check Schedule is required.')
    } else {
        const scheduleValidation = validateSiteCheckSchedule({
            enabled: schedule.gr_enabled,
            frequency: schedule.gr_frequency,
            nextDueDate: schedule.gr_nextduedate,
        })
        if (!schedule.gr_enabled) errors.push('Site Checks are disabled for this Site.')
        else if (!scheduleValidation.valid) errors.push('The Site Check Schedule is incomplete.')
        if (schedule._gr_activesitecheck_value) {
            errors.push('Another Site Check is already in progress for this Site.')
        }
        if (!schedule['@odata.etag']) {
            errors.push('Reload the Site Check Schedule before starting.')
        }
    }

    if (!input.technicianId?.trim()) errors.push('Select a technician.')
    if (!Number.isInteger(input.equipmentCount) || input.equipmentCount <= 0) {
        errors.push('This Site has no applicable Equipment.')
    }
    if (!isValidSiteCheckRequestKey(input.requestKey)) {
        errors.push('The Site Check request key is invalid.')
    }
    if (input.creationInProgress) errors.push('Site Check creation is already in progress.')

    return { valid: errors.length === 0, errors }
}

export function classifySiteCheckCreationConflict(
    submittedRequestKey: string,
    existingRequestKey?: string | null,
): SiteCheckCreationConflict {
    return submittedRequestKey === existingRequestKey
        ? 'replay'
        : 'active-check-conflict'
}
