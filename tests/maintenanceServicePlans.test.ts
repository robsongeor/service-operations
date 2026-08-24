import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
    MAINTENANCE_PROFILES,
    SERVICE_PROGRAMMES,
    isServiceTypeEnabled,
    resolveSatisfiedServiceLevels,
} from '../src/alpha/equipment/servicePlans/maintenanceConfiguration.ts'
import {
    applyServiceCompletion,
    cascadeServiceHistoryBaselines,
    recalculateServicePlanDueDates,
    resolveEffectiveServicePlans,
    selectSatisfiedServicePlans,
} from '../src/alpha/equipment/servicePlans/servicePlanCalculations.ts'
import {
    SERVICE_INTERVAL_HOURS,
    SERVICE_TYPES,
    type EquipmentServicePlan,
    type PlannedServiceType,
} from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'
import {
    calculateForecastAdjustedServicePlan,
    calculatePrimaryNextService,
    calculateSuggestedServiceDate,
    calculateServiceStatus,
} from '../src/alpha/equipment/servicePlans/servicePlanStatus.ts'
import {
    calculateEquipmentUsageForecast,
    calculateUsageAdjustedServiceInterval,
    estimateUsageThresholdDate,
    MINIMUM_AUTHORITATIVE_USAGE_CONFIDENCE,
    MINIMUM_USAGE_SPAN_DAYS,
    resolveCurrentHourMeterRecordedDate,
    resolveLatestHourMeterReading,
    shouldAdvanceCurrentHourMeter,
} from '../src/alpha/equipment/servicePlans/equipmentUsageForecast.ts'
import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'
import { JOB_TYPES, type JobType } from '../src/alpha/jobs/types/jobType.types.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'
import { HOUR_METER_READING_TYPES, type HourMeterReadingType } from '../src/alpha/equipment/hourMeter/hourMeterReading.types.ts'

const ICE = {
    gr_serviceprogramme: SERVICE_PROGRAMMES.ICE_STANDARD,
    gr_maintenanceprofile: MAINTENANCE_PROFILES.STANDARD,
}
const ELECTRIC = {
    gr_serviceprogramme: SERVICE_PROGRAMMES.ELECTRIC_STANDARD,
    gr_maintenanceprofile: MAINTENANCE_PROFILES.STANDARD,
}

function plan(type: PlannedServiceType, dueHours: number, dueDate = '2026-01-01'): EquipmentServicePlan {
    return {
        gr_equipmentserviceplanid: `plan-${type}`,
        gr_servicetype: type,
        gr_intervalhours: SERVICE_INTERVAL_HOURS[type],
        gr_nextduehours: dueHours,
        gr_nextduedate: dueDate,
        gr_active: true,
    }
}

const forecastEquipment = { gr_equipmentid: 'equipment-1', gr_fleet: 'F1', gr_serial: null, gr_make: null, gr_model: null } as Equipment

function meterJob(
    type: JobType,
    date: string,
    hours: number,
    status = JOB_STATUSES.COMPLETE,
    readingType: HourMeterReadingType = HOUR_METER_READING_TYPES.ACTUAL,
): Job {
    return {
        gr_jobid: `${type}-${date}`,
        createdon: date,
        gr_jobnumber: null,
        gr_status: status,
        gr_ordernumber: null,
        gr_description: null,
        gr_jobtype: type,
        gr_completeddate: date,
        gr_hourmeter: hours,
        gr_hourmeterreadingtype: readingType,
        gr_Equipment: { gr_equipmentid: forecastEquipment.gr_equipmentid, gr_fleet: 'F1', gr_serial: null, gr_make: null, gr_model: null },
    }
}

test('usage forecast treats valid readings from every completed Job type equally', () => {
    const forecast = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-01-01T00:00:00Z', 100),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-01-21T00:00:00Z', 200),
        meterJob(JOB_TYPES.WOF, '2026-02-10T00:00:00Z', 300),
        meterJob(JOB_TYPES.SITE_CHECK, '2026-03-02T00:00:00Z', 400),
        meterJob(JOB_TYPES.WORKSHOP, '2026-03-03T00:00:00Z', 900, JOB_STATUSES.ALLOCATED),
    ], new Date('2026-03-02T12:00:00Z'))

    assert.equal(forecast.readingCount, 4)
    assert.equal(forecast.averageHoursPerDay, 5)
    assert.equal(forecast.averageHoursPerWeek, 35)
})

test('usage forecast orders readings by their recorded date rather than completion or Job order', () => {
    const enteredLater = meterJob(JOB_TYPES.BREAKDOWN, '2026-03-01T00:00:00Z', 100)
    enteredLater.gr_hourmeterrecordeddate = '2026-01-01'
    const enteredEarlier = meterJob(JOB_TYPES.SERVICE, '2026-02-01T00:00:00Z', 200)
    enteredEarlier.gr_hourmeterrecordeddate = '2026-02-01'

    const forecast = calculateEquipmentUsageForecast(forecastEquipment, [enteredEarlier, enteredLater], new Date('2026-03-01T00:00:00Z'))
    assert.deepEqual(forecast.readings.map((reading) => reading.date), ['2026-01-01', '2026-02-01'])
    assert.equal(forecast.averageHoursPerDay, 100 / 31)
})

test('latest dated completed Job is authoritative over the Equipment meter snapshot', () => {
    const equipmentWithoutDate = { ...forecastEquipment, gr_currenthourmeter: 300, gr_currenthourmeterrecordeddate: null }
    const currentReading = meterJob(JOB_TYPES.BREAKDOWN, '2026-08-10T00:00:00Z', 300)
    currentReading.gr_hourmeterrecordeddate = '2026-08-01'
    const unrelatedReading = meterJob(JOB_TYPES.SERVICE, '2026-08-12T00:00:00Z', 250)
    unrelatedReading.gr_hourmeterrecordeddate = '2026-08-12'

    assert.deepEqual(resolveLatestHourMeterReading(equipmentWithoutDate, [unrelatedReading, currentReading]), {
        id: unrelatedReading.gr_jobid,
        hours: 250,
        date: '2026-08-12',
        source: 'job',
    })
    assert.equal(resolveCurrentHourMeterRecordedDate(equipmentWithoutDate, [unrelatedReading, currentReading]), '2026-08-12')
})

test('stale Equipment snapshot does not mark later valid Job readings as incorrect', () => {
    const equipment = {
        ...forecastEquipment,
        gr_currenthourmeter: 2425,
        gr_currenthourmeterrecordeddate: '2026-08-14',
    }
    const jobs = [
        meterJob(JOB_TYPES.BREAKDOWN, '2026-03-13T00:00:00Z', 1840),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-04-13T00:00:00Z', 1966),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-07-23T00:00:00Z', 2426),
        meterJob(JOB_TYPES.WOF, '2026-07-24T00:00:00Z', 2425),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-08-12T00:00:00Z', 2527),
    ]

    assert.equal(resolveLatestHourMeterReading(equipment, jobs)?.hours, 2527)
    const forecast = calculateEquipmentUsageForecast(equipment, jobs, new Date('2026-08-14T00:00:00Z'))
    assert.equal(forecast.anomalyCount, 1)
    assert.equal(forecast.readings.find((reading) => reading.date === '2026-07-23')?.assessment, 'Potentially incorrect')
    assert.equal(forecast.readings.find((reading) => reading.date === '2026-07-24')?.assessment, 'Accepted')
    assert.equal(forecast.readings.at(-1)?.hours, 2527)
    assert.equal(forecast.readings.some((reading) => reading.id === 'equipment-current'), false)
})

test('Equipment current meter advances by recorded date rather than submission order or meter value', () => {
    assert.equal(shouldAdvanceCurrentHourMeter('2026-07-30', '2026-08-10'), false)
    assert.equal(shouldAdvanceCurrentHourMeter('2026-08-10', '2026-08-10'), true)
    assert.equal(shouldAdvanceCurrentHourMeter('2026-08-11', '2026-08-10'), true)
    assert.equal(shouldAdvanceCurrentHourMeter('2026-08-11', null), true)
})

test('usage confidence reaches High only with broad recent consistent evidence', () => {
    const jobs = Array.from({ length: 6 }, (_, index) => meterJob(
        index % 2 ? JOB_TYPES.BREAKDOWN : JOB_TYPES.WORKSHOP,
        new Date(Date.UTC(2026, 0, 1 + index * 18)).toISOString(),
        100 + index * 180,
    ))
    const forecast = calculateEquipmentUsageForecast(forecastEquipment, jobs, new Date('2026-04-01T00:00:00Z'))
    assert.equal(forecast.confidenceScore, 100)
    assert.equal(forecast.confidence, 'High')
    assert.equal(forecast.spanDays, 90)
})

test('usage forecast fails safely with insufficient history and estimates thresholds when available', () => {
    const insufficient = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-04-01T00:00:00Z', 1_000),
    ], new Date('2026-04-01T00:00:00Z'))
    assert.equal(insufficient.averageHoursPerDay, null)
    assert.equal(insufficient.confidence, 'Low')
    assert.match(insufficient.confidenceSummary, /At least two valid readings/)

    const forecast = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-03-02T00:00:00Z', 700),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-04-01T00:00:00Z', 1_000),
    ], new Date('2026-04-01T00:00:00Z'))
    assert.equal(estimateUsageThresholdDate(forecast, 1_000, 1_300), '2026-05-01')
})

test('suggested service date uses the earlier calendar or projected-hour limit', () => {
    assert.deepEqual(calculateSuggestedServiceDate('2026-09-01', '2026-08-20', '2026-08-14'), {
        date: '2026-08-20', basis: 'hours', isOverdue: false, isDueToday: false,
    })
    assert.deepEqual(calculateSuggestedServiceDate('2026-08-10', '2026-08-20', '2026-08-14'), {
        date: '2026-08-10', basis: 'calendar', isOverdue: true, isDueToday: false,
    })
    assert.deepEqual(calculateSuggestedServiceDate('2026-08-14', '2026-08-14', '2026-08-14'), {
        date: '2026-08-14', basis: 'both', isOverdue: false, isDueToday: true,
    })
    assert.equal(calculateSuggestedServiceDate(null, null, '2026-08-14'), null)
})

test('usage at 40% confidence becomes authoritative and the profile is the low-confidence fallback', () => {
    const highUsage = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-04-01T00:00:00Z', 1_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-07-01T00:00:00Z', 1_455),
    ], new Date('2026-07-01T00:00:00Z'))
    assert.deepEqual(calculateUsageAdjustedServiceInterval(highUsage, 250, { unit: 'months', value: 3 }), {
        days: 50, label: 'about 7 weeks', source: 'usage', hasReliableUsage: true,
    })

    const lowUsage = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-01-01T00:00:00Z', 1_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-07-01T00:00:00Z', 1_100),
    ], new Date('2026-07-01T00:00:00Z'))
    const usageExtended = calculateUsageAdjustedServiceInterval({
        ...lowUsage,
        confidenceScore: MINIMUM_AUTHORITATIVE_USAGE_CONFIDENCE,
    }, 250, { unit: 'months', value: 3 })
    assert.equal(usageExtended.source, 'usage')
    assert.ok(usageExtended.days > 3 * 30)

    const profileFallback = calculateUsageAdjustedServiceInterval({
        ...lowUsage,
        confidenceScore: MINIMUM_AUTHORITATIVE_USAGE_CONFIDENCE - 1,
    }, 250, { unit: 'months', value: 3 })
    assert.equal(profileFallback.source, 'profile')
    assert.equal(profileFallback.label, '3 months')

    const insufficient = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-07-01T00:00:00Z', 1_000),
    ], new Date('2026-07-01T00:00:00Z'))
    assert.equal(calculateUsageAdjustedServiceInterval(insufficient, 250, { unit: 'months', value: 3 }).hasReliableUsage, false)
})

test('date-only readings do not calculate usage from an ambiguous overnight interval', () => {
    const overnight = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-08-13T00:00:00Z', 1_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-08-14T00:00:00Z', 1_002),
    ], new Date('2026-08-14T00:00:00Z'))
    assert.equal(overnight.spanDays, 1)
    assert.equal(overnight.averageHoursPerDay, null)
    assert.equal(overnight.confidence, 'Low')

    const sufficientSpan = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-08-07T00:00:00Z', 1_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-08-14T00:00:00Z', 1_035),
    ], new Date('2026-08-14T00:00:00Z'))
    assert.equal(sufficientSpan.spanDays, MINIMUM_USAGE_SPAN_DAYS)
    assert.equal(sufficientSpan.averageHoursPerDay, 5)
})

test('longer reading intervals carry proportionally more weight than adjacent-day readings', () => {
    const forecast = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-07-14T00:00:00Z', 1_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-07-15T00:00:00Z', 1_010),
        meterJob(JOB_TYPES.WOF, '2026-08-14T00:00:00Z', 1_040),
    ], new Date('2026-08-14T00:00:00Z'))

    assert.equal(forecast.spanDays, 31)
    assert.equal(forecast.averageHoursPerDay, 40 / 31)
    assert.notEqual(forecast.averageHoursPerDay, (10 + 1) / 2)
})

test('usage forecast ignores one isolated incorrect reading without questioning later valid readings', () => {
    const forecast = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-01-01T00:00:00Z', 5_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-01-11T00:00:00Z', 8_000),
        meterJob(JOB_TYPES.WOF, '2026-01-21T00:00:00Z', 5_100),
        meterJob(JOB_TYPES.WORKSHOP, '2026-01-31T00:00:00Z', 5_200),
    ], new Date('2026-01-31T00:00:00Z'))

    assert.equal(forecast.anomalyCount, 1)
    assert.equal(forecast.readings[1].assessment, 'Potentially incorrect')
    assert.equal(forecast.readings[2].assessment, 'Accepted')
    assert.equal(forecast.averageHoursPerDay, 200 / 30)
})

test('usage forecast distinguishes an unconfirmed drop from a confirmed reset sequence', () => {
    const possible = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-01-01T00:00:00Z', 5_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-01-11T00:00:00Z', 20),
    ], new Date('2026-01-11T00:00:00Z'))
    assert.equal(possible.readings[1].assessment, 'Possible reset')
    assert.equal(possible.resetCount, 0)

    const confirmed = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-01-01T00:00:00Z', 5_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-01-11T00:00:00Z', 20),
        meterJob(JOB_TYPES.WOF, '2026-01-21T00:00:00Z', 120),
        meterJob(JOB_TYPES.WORKSHOP, '2026-01-31T00:00:00Z', 230),
    ], new Date('2026-01-31T00:00:00Z'))
    assert.equal(confirmed.readings[1].assessment, 'Confirmed reset')
    assert.equal(confirmed.resetCount, 1)
    assert.equal(confirmed.averageHoursPerDay, 10.5)
    assert.equal(estimateUsageThresholdDate(confirmed, 230, 500), null)
})

test('estimated readings are clearly classified and reduce confidence without being discarded', () => {
    const actualOnly = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-01-01T00:00:00Z', 100),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-02-01T00:00:00Z', 200),
        meterJob(JOB_TYPES.WOF, '2026-03-01T00:00:00Z', 300),
    ], new Date('2026-03-01T00:00:00Z'))
    const withEstimate = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-01-01T00:00:00Z', 100),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-02-01T00:00:00Z', 200, JOB_STATUSES.COMPLETE, HOUR_METER_READING_TYPES.ESTIMATED),
        meterJob(JOB_TYPES.WOF, '2026-03-01T00:00:00Z', 300),
    ], new Date('2026-03-01T00:00:00Z'))

    assert.equal(withEstimate.readings[1].assessment, 'Estimated')
    assert.equal(withEstimate.estimatedCount, 1)
    assert.ok(withEstimate.confidenceScore < actualOnly.confidenceScore)
    assert.ok(withEstimate.averageHoursPerDay != null)
})

const ALL_PLANS = [
    plan(SERVICE_TYPES.A, 1000),
    plan(SERVICE_TYPES.B, 1000),
    plan(SERVICE_TYPES.C, 2000),
]

test('ICE service completion cascades through all satisfied lower levels', () => {
    assert.deepEqual(resolveSatisfiedServiceLevels(ICE, SERVICE_TYPES.A), [SERVICE_TYPES.A])
    assert.deepEqual(resolveSatisfiedServiceLevels(ICE, SERVICE_TYPES.B), [SERVICE_TYPES.A, SERVICE_TYPES.B])
    assert.deepEqual(resolveSatisfiedServiceLevels(ICE, SERVICE_TYPES.C), [SERVICE_TYPES.A, SERVICE_TYPES.B, SERVICE_TYPES.C])
})

test('Electric completion updates A or A+C and never B', () => {
    assert.deepEqual(resolveSatisfiedServiceLevels(ELECTRIC, SERVICE_TYPES.A), [SERVICE_TYPES.A])
    assert.deepEqual(resolveSatisfiedServiceLevels(ELECTRIC, SERVICE_TYPES.C), [SERVICE_TYPES.A, SERVICE_TYPES.C])
    assert.equal(isServiceTypeEnabled(ELECTRIC, SERVICE_TYPES.B), false)
})

test('B completion resets A and B hour and date baselines and clears stale overdue state', () => {
    const updated = applyServiceCompletion(ALL_PLANS, {
        jobId: 'job-b',
        completedDate: '2026-07-24',
        hourMeter: 1050,
        serviceType: SERVICE_TYPES.B,
    }, ICE)

    const a = updated.find((item) => item.gr_servicetype === SERVICE_TYPES.A)!
    const b = updated.find((item) => item.gr_servicetype === SERVICE_TYPES.B)!
    const c = updated.find((item) => item.gr_servicetype === SERVICE_TYPES.C)!
    assert.equal(a.gr_nextduehours, 1300)
    assert.equal(b.gr_nextduehours, 2050)
    assert.equal(a.gr_lastcompleteddate, '2026-07-24')
    assert.equal(b.gr_lastcompleteddate, '2026-07-24')
    assert.equal(c.gr_nextduehours, 2000)
    assert.equal(c.gr_lastcompleteddate, undefined)
    assert.equal(calculateServiceStatus(1050, a.gr_nextduehours, a.gr_nextduedate, '2026-07-24'), 'OK')
    assert.equal(calculateServiceStatus(1050, b.gr_nextduehours, b.gr_nextduedate, '2026-07-24'), 'OK')
})

test('C completion resets every ICE plan from the same baseline', () => {
    const updated = applyServiceCompletion(ALL_PLANS, {
        jobId: 'job-c',
        completedDate: '2026-07-24',
        hourMeter: 2100,
        serviceType: SERVICE_TYPES.C,
    }, ICE)
    assert.deepEqual(
        updated.map((item) => item.gr_nextduehours),
        [2350, 3100, 4100],
    )
    assert.ok(updated.every((item) => item.gr_lastcompleteddate === '2026-07-24'))
})

test('forecast-aware status ignores an expired profile date when trusted hours remain', () => {
    const baseForecast = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2026-07-01T00:00:00Z', 1_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-08-14T00:00:00Z', 1_100),
    ], new Date('2026-08-17T00:00:00Z'))
    const forecast = {
        ...baseForecast,
        averageHoursPerDay: 1,
        averageHoursPerWeek: 7,
        averageHoursPerMonth: 30.4375,
        confidenceScore: 56,
        confidence: 'Moderate' as const,
        resetCount: 0,
        latestReadingDate: '2026-08-14',
    }
    const equipment = { ...forecastEquipment, ...ICE, gr_currenthourmeter: 1_100 }
    const servicePlan = plan(SERVICE_TYPES.A, 1_312, '2026-08-06')

    const projected = calculateForecastAdjustedServicePlan(servicePlan, equipment, forecast, '2026-08-17')
    assert.equal(projected.usesUsageSchedule, true)
    assert.equal(projected.status, 'OK')
    assert.equal(projected.suggestedService?.basis, 'hours')
    assert.equal(projected.suggestedService?.date, '2027-03-14')

    const fallback = calculateForecastAdjustedServicePlan(servicePlan, equipment, {
        ...forecast,
        confidenceScore: 39,
        confidence: 'Low',
    }, '2026-08-17')
    assert.equal(fallback.usesUsageSchedule, false)
    assert.equal(fallback.status, 'Overdue')
    assert.equal(fallback.suggestedService?.basis, 'calendar')
})

test('every completed Job reading refreshes the stored effective service due date', () => {
    const equipment = {
        ...forecastEquipment,
        ...ICE,
        gr_currenthourmeter: 1_400,
        gr_currenthourmeterrecordeddate: '2026-08-01',
    }
    const jobs = [
        meterJob(JOB_TYPES.SERVICE, '2026-04-01T00:00:00Z', 1_000),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-05-01T00:00:00Z', 1_100),
        meterJob(JOB_TYPES.WOF, '2026-06-01T00:00:00Z', 1_200),
        meterJob(JOB_TYPES.WORKSHOP, '2026-07-01T00:00:00Z', 1_300),
        meterJob(JOB_TYPES.SITE_CHECK, '2026-08-01T00:00:00Z', 1_400),
    ]
    const storedPlan = {
        ...plan(SERVICE_TYPES.A, 1_650, '2026-08-01'),
        gr_lastcompleteddate: '2026-06-01',
        gr_lastcompletedhours: 1_200,
        _gr_equipment_value: equipment.gr_equipmentid,
    }
    const [forecastUpdated] = recalculateServicePlanDueDates(equipment, [storedPlan], jobs)
    assert.equal(forecastUpdated.gr_nextduedate, '2026-10-17')

    const [profileFallback] = recalculateServicePlanDueDates(equipment, [storedPlan], [jobs.at(-1)!])
    assert.equal(profileFallback.gr_nextduedate, '2026-09-01')
})

test('standard, Service, and WOF completion all persist refreshed service dates', () => {
    const hook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    const api = readFileSync(new URL('../src/alpha/equipment/servicePlans/servicePlanApi.ts', import.meta.url), 'utf8')
    assert.equal(hook.match(/await refreshCompletionDataAndServiceDates\(token, equipment\.gr_equipmentid, request\.job\.gr_jobid\)/g)?.length, 3)
    assert.match(hook, /fetchEquipmentJobsApi\(token, equipmentId\)/)
    assert.match(hook, /fetchJobCoreApi\(token, jobId\)/)
    assert.match(hook, /fetchEquipmentByIdApi\(token, equipmentId\)/)
    assert.match(hook, /fetchEquipmentServicePlansForEquipment\(token, \[equipmentId\]\)/)
    assert.match(hook, /refreshEquipmentServicePlanDueDates\(token, completedEquipment, equipmentPlans, equipmentJobs\)/)
    assert.doesNotMatch(hook, /fetchEquipmentServicePlans\(token\)/)
    assert.match(api, /body: JSON\.stringify\(\{ gr_nextduedate: plan\.gr_nextduedate \?\? null \}\)/)
})

test('usage forecast keeps a 360-day baseline and explains its remaining confidence limits', () => {
    const forecast = calculateEquipmentUsageForecast(forecastEquipment, [
        meterJob(JOB_TYPES.SERVICE, '2024-09-05T00:00:00Z', 3_185),
        meterJob(JOB_TYPES.BREAKDOWN, '2024-11-12T00:00:00Z', 3_276),
        meterJob(JOB_TYPES.BREAKDOWN, '2025-01-21T00:00:00Z', 3_339),
        meterJob(JOB_TYPES.WORKSHOP, '2025-05-27T00:00:00Z', 3_491),
        meterJob(JOB_TYPES.BREAKDOWN, '2026-04-29T00:00:00Z', 3_636),
    ], new Date('2026-08-17T00:00:00Z'))

    assert.equal(forecast.confidenceScore, 45)
    assert.equal(forecast.averageHoursPerDay, 145 / 337)
    assert.equal(forecast.readingCount, 2)
    assert.match(forecast.confidenceSummary, /Only 2 recent readings across 337 days are available/)
    assert.match(forecast.confidenceSummary, /latest valid reading is 110 days old/)
})

test('historical C baseline satisfies B and A while a newer lower service remains authoritative', () => {
    const cascaded = cascadeServiceHistoryBaselines([
        { serviceType: SERVICE_TYPES.A, lastCompletedDate: '2026-05-10', lastCompletedHours: 2200 },
        { serviceType: SERVICE_TYPES.B, lastCompletedDate: '2025-06-01', lastCompletedHours: 1000 },
        { serviceType: SERVICE_TYPES.C, lastCompletedDate: '2026-04-20', lastCompletedHours: 2000 },
    ], ICE)
    assert.deepEqual(cascaded, [
        { serviceType: SERVICE_TYPES.A, lastCompletedDate: '2026-05-10', lastCompletedHours: 2200 },
        { serviceType: SERVICE_TYPES.B, lastCompletedDate: '2026-04-20', lastCompletedHours: 2000 },
        { serviceType: SERVICE_TYPES.C, lastCompletedDate: '2026-04-20', lastCompletedHours: 2000 },
    ])
})

test('effective plan display recalculates lower service due dates from a newer C baseline', () => {
    const plans = [
        { ...plan(SERVICE_TYPES.A, 1250), gr_equipmentserviceplanid: 'a', gr_lastcompleteddate: '2024-09-05', gr_lastcompletedhours: 1000 },
        { ...plan(SERVICE_TYPES.B, 2000), gr_equipmentserviceplanid: 'b', gr_lastcompleteddate: '2024-09-05', gr_lastcompletedhours: 1000 },
        { ...plan(SERVICE_TYPES.C, 5636), gr_equipmentserviceplanid: 'c', gr_lastcompleteddate: '2026-04-20', gr_lastcompletedhours: 3636 },
    ]
    const effective = resolveEffectiveServicePlans(plans, ICE)
    const a = effective.find((item) => item.gr_servicetype === SERVICE_TYPES.A)!
    const b = effective.find((item) => item.gr_servicetype === SERVICE_TYPES.B)!
    assert.equal(a.gr_lastcompleteddate, '2026-04-20')
    assert.equal(a.gr_lastcompletedhours, 3636)
    assert.equal(a.gr_nextduehours, 3886)
    assert.equal(a.gr_nextduedate, '2026-07-20')
    assert.equal(b.gr_lastcompleteddate, '2026-04-20')
    assert.equal(b.gr_nextduedate, '2027-04-20')
})

test('Electric C resets A and C, excludes B, and recalculates nearest service', () => {
    const updated = applyServiceCompletion(ALL_PLANS, {
        jobId: 'job-electric-c',
        completedDate: '2026-07-24',
        hourMeter: 2000,
        serviceType: SERVICE_TYPES.C,
    }, ELECTRIC)
    const a = updated.find((item) => item.gr_servicetype === SERVICE_TYPES.A)!
    const b = updated.find((item) => item.gr_servicetype === SERVICE_TYPES.B)!
    const c = updated.find((item) => item.gr_servicetype === SERVICE_TYPES.C)!
    assert.equal(a.gr_nextduehours, 2250)
    assert.equal(b.gr_nextduehours, 1000)
    assert.equal(c.gr_nextduehours, 4000)
    assert.equal(calculatePrimaryNextService(updated, { ...ELECTRIC, gr_currenthourmeter: 2000 })?.gr_servicetype, SERVICE_TYPES.A)
})

test('completion refuses an atomic plan set when any satisfied level is missing', () => {
    assert.throws(
        () => selectSatisfiedServicePlans(
            [plan(SERVICE_TYPES.B, 2000), plan(SERVICE_TYPES.C, 4000)],
            SERVICE_TYPES.C,
            ICE,
        ),
        /maintenance schedule is incomplete/,
    )
})

test('Service completion dialog constrains responsive hour-meter fields', () => {
    const workflow = readFileSync(new URL('../src/alpha/jobs/components/JobCompletionWorkflow.tsx', import.meta.url), 'utf8')
    const styles = readFileSync(new URL('../src/alpha/jobs/components/JobCompletionWorkflow.css', import.meta.url), 'utf8')
    const managerApi = readFileSync(new URL('../src/alpha/equipment/services/equipmentManagerApi.ts', import.meta.url), 'utf8')
    const jobsHook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    const servicePlanApi = readFileSync(new URL('../src/alpha/equipment/servicePlans/servicePlanApi.ts', import.meta.url), 'utf8')
  assert.match(workflow, /fieldsClassName="job-completion-fields"/)
  assert.match(workflow, /dialogClassName="job-completion-dialog"/)
  assert.match(workflow, /request\.pendingSave\?\.jobNumber\.trim\(\)/)
  assert.equal(workflow.match(/<span>Job Number<\/span>/g)?.length, 3)
  assert.match(workflow, /submitDisabled=\{missingServicePlans\.length > 0 \|\| isSavingMaintenance\}/)
  assert.match(workflow, /hideSubmit=\{missingServicePlans\.length > 0\}/)
  assert.match(workflow, /missingServicePlans\.length === 0 && <>/)
  assert.match(workflow, /request\.kind === 'standard'/)
  assert.match(workflow, /onCompleteStandard\(reading, readingType, readingDate, completionDate\)/)
  assert.match(workflow, /onCompleteWof\(wofExpiry, reading, readingType, readingDate, completionDate\)/)
  assert.equal(workflow.match(/Job Completion Date \*/g)?.length, 1)
  const hourEntryIndex = workflow.indexOf("'Hour Meter at Completion *'")
  const completionDateIndex = workflow.indexOf('Job Completion Date *')
  const estimateControlIndex = workflow.indexOf('job-completion-estimate-toggle')
  assert.ok(hourEntryIndex >= 0 && completionDateIndex > hourEntryIndex && estimateControlIndex > completionDateIndex)
  assert.match(workflow, /value=\{readingValue\}[\s\S]*?autoFocus readOnly=\{isUsingEstimatedReading\}/)
  assert.match(workflow, /const readingDate = completionDate/)
  assert.doesNotMatch(workflow, /Hour Meter Reading Date \*/)
  assert.doesNotMatch(workflow, /readingDateInput/)
  assert.match(workflow, /This Job is earlier than the Equipment's current reading/)
  assert.match(workflow, /<strong>Technician did not record hours<\/strong>/)
  assert.match(workflow, /job-completion-estimate-value/)
  assert.match(workflow, /Calculated from previous Jobs, not editable, and saved as Estimated/)
  assert.match(workflow, /No usable previous Job reading is available, so an estimate cannot be generated/)
  assert.match(workflow, /const isUsingEstimatedReading = useEstimatedReading && canUseEstimatedReading/)
  assert.match(workflow, /disabled=\{!canUseEstimatedReading\}/)
  assert.doesNotMatch(workflow, /placeholder="4936"/)
  assert.match(workflow, /onSetupMaintenance\(selectedEquipment/)
  assert.match(workflow, /Save maintenance setup/)
  assert.match(workflow, /Default Maintenance Profile/)
  assert.match(workflow, /Maintenance setup required/)
  assert.match(managerApi, /export async function updateEquipmentMaintenanceSetup/)
  assert.match(jobsHook, /await updateEquipmentMaintenanceSetupApi\(token, record\.gr_equipmentid, input\)/)
  assert.match(jobsHook, /await syncEquipmentServiceProgramme\(token, updated, recordPlans\)/)
  assert.match(servicePlanApi, /\?\$select=gr_currenthourmeter,gr_currenthourmeterrecordeddate/)
  assert.match(servicePlanApi, /'If-Match': etag/)
  assert.match(servicePlanApi, /response\.status === 412 && attempt === 0/)
    assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
    assert.match(styles, /\.edit-form-dialog\.job-completion-dialog \{ width: min\(560px, calc\(100vw - 32px\)\); \}/)
    assert.match(styles, /\.job-completion-fields output small, \.job-completion-wof-fields output small \{ display: block;/)
    assert.match(styles, /\.job-completion-current-meter output/)
    assert.match(styles, /\.job-completion-estimate-value/)
    assert.match(styles, /\.job-completion-summary \{ grid-column: 1 \/ -1; \}/)
    assert.match(styles, /\.job-completion-summary ul \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
    assert.match(styles, /@media \(max-width: 480px\)/)
})
