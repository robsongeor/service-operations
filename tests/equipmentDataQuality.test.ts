import assert from 'node:assert/strict'
import test from 'node:test'

import { EQUIPMENT_COMPLIANCE_STATUSES } from '../src/alpha/equipment/compliance/equipmentCompliance.ts'
import { evaluateEquipmentDataQuality } from '../src/alpha/equipment/dataQuality/equipmentDataQuality.ts'
import type { EquipmentServicePlan } from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'
import { MAINTENANCE_PROFILES, SERVICE_PROGRAMMES } from '../src/alpha/equipment/servicePlans/maintenanceConfiguration.ts'
import { SERVICE_TYPES } from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'

const completeEquipment = {
    gr_equipmentid: 'equipment-1',
    gr_fleet: 'FN100',
    gr_serial: 'SERIAL-100',
    gr_make: 'Still',
    gr_model: 'RX60',
    gr_compliancestatus: EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD,
    gr_serviceprogramme: SERVICE_PROGRAMMES.ICE_STANDARD,
    gr_maintenanceprofile: MAINTENANCE_PROFILES.STANDARD,
} as Equipment

const maintenanceHistory: EquipmentServicePlan[] = [{
    gr_equipmentserviceplanid: 'plan-1',
    gr_servicetype: SERVICE_TYPES.A,
    gr_intervalhours: 250,
    gr_lastcompleteddate: '2026-07-01',
    gr_lastcompletedhours: 500,
    gr_active: true,
    _gr_equipment_value: completeEquipment.gr_equipmentid,
}]

test('missing identity fields are critical', () => {
    const quality = evaluateEquipmentDataQuality({ ...completeEquipment, gr_fleet: null, gr_make: null }, maintenanceHistory)
    assert.equal(quality.severity, 'critical')
    assert.deepEqual(quality.criticalIssues, ['Fleet number missing', 'Make missing'])
})

test('On-road Equipment requires all current road-compliance fields', () => {
    const quality = evaluateEquipmentDataQuality({
        ...completeEquipment,
        gr_compliancestatus: EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED,
        gr_registrationnumber: null,
        gr_regoexpiry: null,
        gr_currentwofexpiry: null,
    }, maintenanceHistory)
    assert.equal(quality.severity, 'critical')
    assert.deepEqual(quality.criticalIssues, [
        'Registration number missing',
        'REGO expiry missing',
        'WOF expiry missing',
    ])
})

test('Off-road Equipment is not penalised for missing road-compliance fields', () => {
    const quality = evaluateEquipmentDataQuality(completeEquipment, maintenanceHistory)
    assert.equal(quality.severity, 'none')
    assert.deepEqual(quality.criticalIssues, [])
})

test('Equipment with no maintenance history returns Warning', () => {
    const warning = evaluateEquipmentDataQuality(completeEquipment, [])
    assert.equal(warning.severity, 'warning')
    assert.deepEqual(warning.warningIssues, ['No maintenance history recorded'])
})

test('Equipment with recorded maintenance history does not return Warning', () => {
    const quality = evaluateEquipmentDataQuality(completeEquipment, maintenanceHistory)
    assert.equal(quality.severity, 'none')
    assert.deepEqual(quality.warningIssues, [])
})

test('missing Maintenance Profile or Service Programme does not affect data quality', () => {
    const missingProfile = evaluateEquipmentDataQuality({
        ...completeEquipment,
        gr_maintenanceprofile: null,
    }, maintenanceHistory)
    assert.equal(missingProfile.severity, 'none')

    const missingProgramme = evaluateEquipmentDataQuality({
        ...completeEquipment,
        gr_serviceprogramme: null,
    }, maintenanceHistory)
    assert.equal(missingProgramme.severity, 'none')
})

test('Critical retains priority while missing history remains visible', () => {
    const critical = evaluateEquipmentDataQuality({
        ...completeEquipment,
        gr_serial: null,
    }, [])
    assert.equal(critical.severity, 'critical')
    assert.deepEqual(critical.warningIssues, ['No maintenance history recorded'])
})
