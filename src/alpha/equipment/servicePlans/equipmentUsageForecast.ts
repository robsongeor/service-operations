import type { Job } from '../../jobs/types/job.types.ts'
import type { Equipment } from '../../jobs/types/equipment.types.ts'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types.ts'
import { HOUR_METER_READING_TYPES, type HourMeterReadingType } from '../hourMeter/hourMeterReading.types.ts'
import type { MaintenanceInterval } from './maintenanceConfiguration.ts'

const HISTORY_WINDOW_DAYS = 360
export const MINIMUM_USAGE_SPAN_DAYS = 7
export const MINIMUM_AUTHORITATIVE_USAGE_CONFIDENCE = 40
const DAY_MS = 24 * 60 * 60 * 1000

export type HourMeterAssessment = 'Accepted' | 'Estimated' | 'Potentially incorrect' | 'Possible reset' | 'Confirmed reset'

export type UsageReading = {
    id: string
    date: string
    timestamp: number
    hours: number
    readingType: HourMeterReadingType
    assessment: HourMeterAssessment
    segment: number
}

export type UsageForecastConfidence = 'Low' | 'Moderate' | 'High'

export type EquipmentUsageForecast = {
    averageHoursPerDay: number | null
    averageHoursPerWeek: number | null
    averageHoursPerMonth: number | null
    confidenceScore: number
    confidence: UsageForecastConfidence
    readingCount: number
    estimatedCount: number
    anomalyCount: number
    resetCount: number
    spanDays: number
    latestReadingDate: string | null
    confidenceSummary: string
    readings: UsageReading[]
}

export type LatestHourMeterReading = {
    id: string
    hours: number
    date: string
    source: 'job' | 'equipment'
}

export type UsageAdjustedServiceInterval = {
    days: number
    label: string
    source: 'usage' | 'profile'
    hasReliableUsage: boolean
}

function maintenanceIntervalDays(interval: MaintenanceInterval) {
    if (interval.unit === 'days') return interval.value
    if (interval.unit === 'weeks') return interval.value * 7
    return interval.value * 30.4375
}

function approximateIntervalLabel(days: number) {
    if (days < 14) return `about ${Math.max(1, Math.round(days))} days`
    if (days < 90) return `about ${Math.max(1, Math.round(days / 7))} weeks`
    return `about ${Math.max(1, Math.round(days / 30.4375))} months`
}

export function calculateUsageAdjustedServiceInterval(
    forecast: EquipmentUsageForecast,
    serviceHours: number,
    defaultInterval: MaintenanceInterval,
): UsageAdjustedServiceInterval {
    const defaultDays = maintenanceIntervalDays(defaultInterval)
    const hasReliableUsage = forecast.averageHoursPerDay != null
        && forecast.averageHoursPerDay > 0
        && forecast.confidenceScore >= MINIMUM_AUTHORITATIVE_USAGE_CONFIDENCE
        && forecast.resetCount === 0
    const usageDays = hasReliableUsage ? serviceHours / forecast.averageHoursPerDay! : Number.POSITIVE_INFINITY
    return {
        days: Math.ceil(hasReliableUsage ? usageDays : defaultDays),
        label: hasReliableUsage ? approximateIntervalLabel(usageDays) : `${defaultInterval.value} ${defaultInterval.unit}`,
        source: hasReliableUsage ? 'usage' : 'profile',
        hasReliableUsage,
    }
}

export function shouldAdvanceCurrentHourMeter(
    incomingRecordedDate: string,
    currentRecordedDate: string | null | undefined,
) {
    const incomingDate = incomingRecordedDate.slice(0, 10)
    const currentDate = currentRecordedDate?.slice(0, 10)
    return !currentDate || incomingDate >= currentDate
}

export function resolveLatestHourMeterReading(equipment: Equipment, jobs: readonly Job[]): LatestHourMeterReading | null {
    const equipmentId = equipment.gr_equipmentid.toLowerCase()
    const latestJobReading = jobs
        .filter((job) => job.gr_status === JOB_STATUSES.COMPLETE
            && job.gr_hourmeter != null
            && Number.isFinite(job.gr_hourmeter)
            && job.gr_hourmeter >= 0
            && job.gr_Equipment?.gr_equipmentid.toLowerCase() === equipmentId)
        .map((job) => {
            const recordedAt = job.gr_hourmeterrecordeddate ?? job.gr_completeddate
            const timestamp = recordedAt ? Date.parse(recordedAt) : Number.NaN
            return Number.isFinite(timestamp) ? { job, recordedAt: recordedAt!, timestamp } : null
        })
        .filter((reading): reading is { job: Job; recordedAt: string; timestamp: number } => reading != null)
        .sort((first, second) => first.timestamp - second.timestamp
            || Date.parse(first.job.gr_completeddate ?? first.job.createdon) - Date.parse(second.job.gr_completeddate ?? second.job.createdon)
            || first.job.gr_jobid.localeCompare(second.job.gr_jobid))
        .at(-1)

    if (latestJobReading) return {
        id: latestJobReading.job.gr_jobid,
        hours: latestJobReading.job.gr_hourmeter!,
        date: new Date(latestJobReading.timestamp).toISOString().slice(0, 10),
        source: 'job',
    }

    const equipmentReading = validPoint(
        'equipment-current',
        equipment.gr_currenthourmeterrecordeddate,
        equipment.gr_currenthourmeter,
    )
    return equipmentReading ? {
        id: equipmentReading.id,
        hours: equipmentReading.hours,
        date: equipmentReading.date,
        source: 'equipment',
    } : null
}

export function resolveCurrentHourMeterRecordedDate(equipment: Equipment, jobs: readonly Job[]) {
    return resolveLatestHourMeterReading(equipment, jobs)?.date ?? null
}

function validPoint(
    id: string,
    dateValue: string | null | undefined,
    hours: number | null | undefined,
    readingType: HourMeterReadingType = HOUR_METER_READING_TYPES.ACTUAL,
): UsageReading | null {
    if (!dateValue || hours == null || !Number.isFinite(hours) || hours < 0) return null
    const timestamp = Date.parse(dateValue)
    if (!Number.isFinite(timestamp)) return null
    return {
        id,
        date: new Date(timestamp).toISOString().slice(0, 10),
        timestamp,
        hours,
        readingType,
        assessment: readingType === HOUR_METER_READING_TYPES.ESTIMATED ? 'Estimated' : 'Accepted',
        segment: 1,
    }
}

function confidenceLabel(score: number): UsageForecastConfidence {
    if (score >= 75) return 'High'
    if (score >= MINIMUM_AUTHORITATIVE_USAGE_CONFIDENCE) return 'Moderate'
    return 'Low'
}

function confidenceSummary({
    candidateCount,
    usableCount,
    intervalCount,
    spanDays,
    latestAgeDays,
    score,
    anomalyCount,
    estimatedCount,
    resetCount,
    consistencyScore,
}: {
    candidateCount: number
    usableCount: number
    intervalCount: number
    spanDays: number
    latestAgeDays: number
    score: number
    anomalyCount: number
    estimatedCount: number
    resetCount: number
    consistencyScore: number
}) {
    const reasons: string[] = []
    if (usableCount < 2) {
        reasons.push(candidateCount > usableCount
            ? `Only ${usableCount} of ${candidateCount} valid readings is within the ${HISTORY_WINDOW_DAYS}-day forecast window, so no usage interval can be calculated.`
            : `At least two valid readings are needed to calculate a usage interval; ${usableCount || 'none'} is currently available.`)
    } else if (spanDays < MINIMUM_USAGE_SPAN_DAYS) {
        reasons.push(`Recent readings span ${spanDays} day${spanDays === 1 ? '' : 's'}; at least ${MINIMUM_USAGE_SPAN_DAYS} days is required.`)
    } else if (score < 50 && intervalCount < 5) {
        reasons.push(`Only ${usableCount} recent readings across ${spanDays} days are available.`)
    }
    if (Number.isFinite(latestAgeDays) && latestAgeDays > 60) {
        reasons.push(`The latest valid reading is ${Math.round(latestAgeDays)} days old.`)
    }
    if (score < 50 && intervalCount >= 2 && consistencyScore === 0) reasons.push('Usage varies significantly between readings.')
    if (anomalyCount > 0) reasons.push(`${anomalyCount} anomalous reading${anomalyCount === 1 ? ' was' : 's were'} ignored.`)
    if (resetCount > 0) reasons.push(`${resetCount} confirmed meter reset${resetCount === 1 ? ' reduces' : 's reduce'} confidence.`)
    if (estimatedCount > 0) reasons.push(`${estimatedCount} estimated reading${estimatedCount === 1 ? ' contributes' : 's contribute'} less evidence than an actual reading.`)
    if (reasons.length) return reasons.slice(0, 2).join(' ')
    if (score >= 75) return `Strong evidence from ${usableCount} recent readings across ${spanDays} days.`
    return `Based on ${usableCount} recent readings across ${spanDays} days; more recent history will improve confidence.`
}

function classifyReadings(readings: UsageReading[]) {
    const classified = readings.map((reading) => ({ ...reading }))
    for (let index = 1; index < classified.length - 1; index += 1) {
        const previous = classified.slice(0, index).findLast((reading) => reading.assessment !== 'Potentially incorrect')
        const current = classified[index]
        const next = classified[index + 1]
        if (!previous) continue
        if (current.hours > previous.hours && next.hours < current.hours && next.hours >= previous.hours) {
            current.assessment = 'Potentially incorrect'
        } else if (current.hours < previous.hours && next.hours >= previous.hours) {
            current.assessment = 'Potentially incorrect'
        }
    }

    for (let index = 1; index < classified.length; index += 1) {
        const current = classified[index]
        const previous = classified.slice(0, index).findLast((reading) => reading.assessment !== 'Potentially incorrect')
        if (!previous || current.assessment === 'Potentially incorrect' || current.hours >= previous.hours) continue
        const following = classified.slice(index + 1).filter((reading) => reading.assessment !== 'Potentially incorrect')
        const confirmed = following.length >= 2
            && following[0].hours >= current.hours
            && following[1].hours >= following[0].hours
            && following[1].hours < previous.hours
        current.assessment = confirmed ? 'Confirmed reset' : 'Possible reset'
    }

    let segment = 1
    for (const reading of classified) {
        if (reading.assessment === 'Confirmed reset') segment += 1
        reading.segment = segment
    }
    return classified
}

export function calculateEquipmentUsageForecast(
    equipment: Equipment,
    jobs: readonly Job[],
    now = new Date(),
): EquipmentUsageForecast {
    const points = jobs
        .filter((job) => job.gr_status === JOB_STATUSES.COMPLETE
            && job.gr_Equipment?.gr_equipmentid.toLowerCase() === equipment.gr_equipmentid.toLowerCase())
        .map((job) => validPoint(
            job.gr_jobid,
            job.gr_hourmeterrecordeddate ?? job.gr_completeddate,
            job.gr_hourmeter,
            job.gr_hourmeterreadingtype ?? HOUR_METER_READING_TYPES.ACTUAL,
        ))
        .filter((point): point is UsageReading => point != null)
    if (!points.length) {
        const currentPoint = validPoint('equipment-current', equipment.gr_currenthourmeterrecordeddate, equipment.gr_currenthourmeter)
        if (currentPoint) points.push(currentPoint)
    }

    const distinct = [...points.reduce((byReading, point) => {
        const key = `${point.date}:${point.hours}`
        const existing = byReading.get(key)
        if (!existing || point.timestamp >= existing.timestamp) byReading.set(key, point)
        return byReading
    }, new Map<string, UsageReading>()).values()].sort((first, second) => first.timestamp - second.timestamp)
    const readings = classifyReadings(distinct)
    const candidates = readings.filter((reading) => reading.assessment !== 'Potentially incorrect' && reading.assessment !== 'Possible reset')
    const latest = candidates.at(-1)
    const windowStart = latest ? latest.timestamp - HISTORY_WINDOW_DAYS * DAY_MS : Number.NEGATIVE_INFINITY
    const usable = candidates.filter((reading) => reading.timestamp >= windowStart)
    const intervals = usable.slice(1).map((reading, index) => {
        const previous = usable[index]
        const days = (reading.timestamp - previous.timestamp) / DAY_MS
        if (reading.segment !== previous.segment || days <= 0 || reading.hours < previous.hours) return null
        const weight = reading.readingType === HOUR_METER_READING_TYPES.ESTIMATED
            || previous.readingType === HOUR_METER_READING_TYPES.ESTIMATED ? .5 : 1
        return { days, hours: reading.hours - previous.hours, rate: (reading.hours - previous.hours) / days, weight }
    }).filter((interval): interval is { days: number; hours: number; rate: number; weight: number } => interval != null)
    const weightedDays = intervals.reduce((sum, interval) => sum + interval.days * interval.weight, 0)
    const weightedHours = intervals.reduce((sum, interval) => sum + interval.hours * interval.weight, 0)
    const spanDays = Math.round(intervals.reduce((sum, interval) => sum + interval.days, 0))
    const averageHoursPerDay = weightedDays > 0 && spanDays >= MINIMUM_USAGE_SPAN_DAYS
        ? weightedHours / weightedDays
        : null
    const sampleScore = Math.min(35, intervals.length * 7)
    const spanScore = Math.min(30, spanDays / 90 * 30)
    const latestAge = latest ? Math.max(0, (now.getTime() - latest.timestamp) / DAY_MS) : Number.POSITIVE_INFINITY
    const recencyScore = latestAge <= 7 ? 20 : latestAge <= 30 ? 15 : latestAge <= 60 ? 8 : latestAge <= 120 ? 3 : 0
    let consistencyScore = intervals.length === 1 ? 5 : 0
    if (intervals.length >= 2) {
        const consistencyWeight = intervals.reduce((sum, interval) => sum + interval.days * interval.weight, 0)
        const mean = intervals.reduce((sum, interval) => sum + interval.rate * interval.days * interval.weight, 0) / consistencyWeight
        if (mean === 0) consistencyScore = intervals.every((interval) => interval.rate === 0) ? 15 : 0
        else {
            const variance = intervals.reduce((sum, interval) => sum
                + (interval.rate - mean) ** 2 * interval.days * interval.weight, 0) / consistencyWeight
            const variation = Math.sqrt(variance) / mean
            consistencyScore = variation <= .15 ? 15 : variation <= .35 ? 10 : variation <= .6 ? 5 : 0
        }
    }
    const estimatedCount = usable.filter((reading) => reading.readingType === HOUR_METER_READING_TYPES.ESTIMATED).length
    const anomalyCount = readings.filter((reading) => reading.assessment === 'Potentially incorrect').length
    const resetCount = readings.filter((reading) => reading.assessment === 'Confirmed reset').length
    const actualRatio = usable.length ? (usable.length - estimatedCount) / usable.length : 0
    const score = Math.round(Math.max(0, Math.min(100,
        (sampleScore + spanScore + recencyScore + consistencyScore) * (.65 + .35 * actualRatio)
        - Math.min(15, anomalyCount * 5)
        - (readings.some((reading) => reading.assessment === 'Possible reset') ? 15 : 0)
        - Math.min(10, resetCount * 5),
    )))
    const summary = confidenceSummary({
        candidateCount: candidates.length,
        usableCount: usable.length,
        intervalCount: intervals.length,
        spanDays,
        latestAgeDays: latestAge,
        score,
        anomalyCount,
        estimatedCount,
        resetCount,
        consistencyScore,
    })

    return {
        averageHoursPerDay,
        averageHoursPerWeek: averageHoursPerDay == null ? null : averageHoursPerDay * 7,
        averageHoursPerMonth: averageHoursPerDay == null ? null : averageHoursPerDay * 30.4375,
        confidenceScore: score,
        confidence: confidenceLabel(score),
        readingCount: usable.length,
        estimatedCount,
        anomalyCount,
        resetCount,
        spanDays,
        latestReadingDate: latest?.date ?? null,
        confidenceSummary: summary,
        readings,
    }
}

export function estimateHourMeterReading(
    forecast: EquipmentUsageForecast,
    equipment: Equipment,
    readingDate = new Date(),
) {
    const targetTimestamp = readingDate.getTime()
    const historicalBase = forecast.readings
        .filter((reading) => reading.timestamp <= targetTimestamp
            && reading.assessment !== 'Potentially incorrect'
            && reading.assessment !== 'Possible reset')
        .at(-1)
    const currentDate = equipment.gr_currenthourmeterrecordeddate
    const currentTimestamp = currentDate ? Date.parse(currentDate) : Number.NaN
    const useCurrentFallback = !historicalBase && Number.isFinite(currentTimestamp) && currentTimestamp <= targetTimestamp
    const baseHours = historicalBase?.hours ?? (useCurrentFallback ? equipment.gr_currenthourmeter ?? 0 : equipment.gr_currenthourmeter ?? 0)
    const baseTimestamp = historicalBase?.timestamp ?? (useCurrentFallback ? currentTimestamp : targetTimestamp)
    const elapsedDays = Math.max(0, (targetTimestamp - baseTimestamp) / DAY_MS)
    const projected = forecast.averageHoursPerDay == null
        ? baseHours
        : baseHours + forecast.averageHoursPerDay * elapsedDays
    return {
        hours: Math.max(0, Math.round(projected)),
        confidenceScore: forecast.confidenceScore,
        confidence: forecast.confidence,
    }
}

export function estimateUsageThresholdDate(
    forecast: EquipmentUsageForecast,
    currentHours: number,
    dueHours: number | null | undefined,
) {
    if (forecast.resetCount > 0 || !forecast.latestReadingDate || forecast.averageHoursPerDay == null || forecast.averageHoursPerDay <= 0 || dueHours == null) return null
    const remaining = dueHours - currentHours
    if (remaining <= 0) return forecast.latestReadingDate
    const date = new Date(`${forecast.latestReadingDate}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + Math.ceil(remaining / forecast.averageHoursPerDay))
    return date.toISOString().slice(0, 10)
}
