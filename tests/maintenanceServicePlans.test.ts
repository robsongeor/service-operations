import assert from 'node:assert/strict'
import test from 'node:test'

import {
    MAINTENANCE_PROFILES,
    SERVICE_PROGRAMMES,
    isServiceTypeEnabled,
    resolveSatisfiedServiceLevels,
} from '../src/alpha/equipment/servicePlans/maintenanceConfiguration.ts'
import {
    applyServiceCompletion,
    selectSatisfiedServicePlans,
} from '../src/alpha/equipment/servicePlans/servicePlanCalculations.ts'
import {
    SERVICE_INTERVAL_HOURS,
    SERVICE_TYPES,
    type EquipmentServicePlan,
    type PlannedServiceType,
} from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'
import {
    calculatePrimaryNextService,
    calculateServiceStatus,
} from '../src/alpha/equipment/servicePlans/servicePlanStatus.ts'

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
