import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { EQUIPMENT_COMPLIANCE_STATUSES } from '../src/alpha/equipment/compliance/equipmentCompliance.ts'
import {
    compareEquipmentDataQuality,
    evaluateEquipmentDataQuality,
} from '../src/alpha/equipment/dataQuality/equipmentDataQuality.ts'
import type { EquipmentServicePlan } from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'
import { MAINTENANCE_PROFILES, SERVICE_PROGRAMMES } from '../src/alpha/equipment/servicePlans/maintenanceConfiguration.ts'
import { SERVICE_TYPES } from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'
import {
    canUseEquipmentCsvTools,
    equipmentCsvText,
    reviewEquipmentCsv,
} from '../src/alpha/equipment/utils/equipmentCsv.ts'
import type { Site } from '../src/alpha/jobs/types/site.types.ts'

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

test('Data Status sorting ranks Critical, Warning, then None and reverses explicitly', () => {
    const critical = { ...completeEquipment, gr_equipmentid: 'critical', gr_serial: null }
    const warning = { ...completeEquipment, gr_equipmentid: 'warning' }
    const none = { ...completeEquipment, gr_equipmentid: 'none' }
    const rows = [
        { equipment: none, plans: maintenanceHistory },
        { equipment: warning, plans: [] },
        { equipment: critical, plans: maintenanceHistory },
    ]
    const ascending = [...rows].sort((left, right) =>
        compareEquipmentDataQuality(left.equipment, left.plans, right.equipment, right.plans, 'asc'),
    )
    const descending = [...rows].sort((left, right) =>
        compareEquipmentDataQuality(left.equipment, left.plans, right.equipment, right.plans, 'desc'),
    )
    assert.deepEqual(ascending.map((row) => row.equipment.gr_equipmentid), ['critical', 'warning', 'none'])
    assert.deepEqual(descending.map((row) => row.equipment.gr_equipmentid), ['none', 'warning', 'critical'])
})

test('Data Status sorting uses natural Fleet Number order within a severity', () => {
    const rows = ['FN24', 'FN2', 'FN10'].map((fleet) => ({ ...completeEquipment, gr_equipmentid: fleet, gr_fleet: fleet }))
    rows.sort((left, right) => compareEquipmentDataQuality(left, maintenanceHistory, right, maintenanceHistory, 'asc'))
    assert.deepEqual(rows.map((row) => row.gr_fleet), ['FN2', 'FN10', 'FN24'])
})

test('missing Fleet Number stays last within its severity group', () => {
    const withFleet = { ...completeEquipment, gr_equipmentid: 'with-fleet', gr_serial: null }
    const withoutFleet = { ...completeEquipment, gr_equipmentid: 'without-fleet', gr_fleet: null }
    const rows = [withoutFleet, withFleet]
    rows.sort((left, right) => compareEquipmentDataQuality(left, maintenanceHistory, right, maintenanceHistory, 'asc'))
    assert.deepEqual(rows.map((row) => row.gr_equipmentid), ['with-fleet', 'without-fleet'])
})

const csvSite = {
    gr_siteid: 'site-1',
    gr_name: 'Main, "North"',
    gr_address: '1 Test Street',
    gr_Customer: { gr_customerid: 'customer-1', gr_name: 'Customer, Ltd' },
} as Site
const csvEquipment = {
    ...completeEquipment,
    gr_equipmentid: 'equipment-csv-1',
    gr_fleet: 'FN1',
    gr_make: 'Still',
    gr_model: 'RX\n60',
    gr_currenthourmeter: 100,
    gr_currenthourmeterrecordeddate: '2026-07-25',
    gr_Site: csvSite,
} as Equipment

test('Equipment CSV authorization is case-insensitive and denies other users', () => {
    assert.equal(canUseEquipmentCsvTools({ storageId: '1', displayName: 'George', username: 'GEORGER@LIFTRUCKS.CO.NZ' }), true)
    assert.equal(canUseEquipmentCsvTools({ storageId: '2', displayName: 'Other', username: 'other@liftrucks.co.nz' }), false)
    assert.equal(canUseEquipmentCsvTools(null), false)
})

test('Equipment CSV export includes stable IDs and escapes Excel values', () => {
    const csv = equipmentCsvText([csvEquipment])
    assert.match(csv, /^\uFEFFEquipment ID,/)
    assert.match(csv, /equipment-csv-1/)
    assert.match(csv, /"Customer, Ltd"/)
    assert.match(csv, /"Main, ""North"""/)
    assert.match(csv, /"RX\n60"/)
})

test('Equipment CSV review ignores blanks and unchanged values', () => {
    const csv = 'Equipment ID,Fleet Number,Make\r\nequipment-csv-1,,Still\r\n'
    const review = reviewEquipmentCsv(csv, [csvEquipment], [csvSite])
    assert.equal(review.rows[0].status, 'unchanged')
    assert.deepEqual(review.rows[0].changes, [])
})

test('Equipment CSV review reports changed values without writing', () => {
    const csv = 'Equipment ID,Fleet Number,Make\r\nequipment-csv-1,FN2,Komatsu\r\n'
    const review = reviewEquipmentCsv(csv, [csvEquipment], [csvSite])
    assert.equal(review.rows[0].status, 'changed')
    assert.deepEqual(review.rows[0].changes.map((change) => change.label), ['Fleet Number', 'Make'])
})

test('Equipment CSV rejects invalid dates, decreasing meters, unknown Sites, and duplicate IDs', () => {
    const invalid = reviewEquipmentCsv(
        'Equipment ID,Rego Expiry,Last Known Hour Meter,Site ID\r\nequipment-csv-1,25/07/2026,99,missing-site\r\n',
        [csvEquipment],
        [csvSite],
    )
    assert.equal(invalid.rows[0].status, 'invalid')
    assert.match(invalid.rows[0].errors.join(' '), /YYYY-MM-DD/)
    assert.match(invalid.rows[0].errors.join(' '), /cannot decrease/)
    assert.match(invalid.rows[0].errors.join(' '), /does not reference an existing Site/)

    const duplicate = reviewEquipmentCsv(
        'Equipment ID,Fleet Number\r\nequipment-csv-1,FN2\r\nequipment-csv-1,FN3\r\n',
        [csvEquipment],
        [csvSite],
    )
    assert.deepEqual(duplicate.rows.map((row) => row.status), ['duplicate', 'duplicate'])
})

test('re-reviewing an already applied Equipment CSV is idempotent', () => {
    const csv = equipmentCsvText([csvEquipment])
    const review = reviewEquipmentCsv(csv, [csvEquipment], [csvSite])
    assert.equal(review.rows[0].status, 'unchanged')
})

test('changing Road Use away from Road Registered explicitly reviews compliance-field clearing', () => {
    const roadEquipment = {
        ...csvEquipment,
        gr_compliancestatus: EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED,
        gr_registrationnumber: 'ABC123',
        gr_regoexpiry: '2027-01-01',
        gr_currentwofexpiry: '2027-02-01',
    }
    const csv = `Equipment ID,Road Use ID\r\nequipment-csv-1,${EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD}\r\n`
    const review = reviewEquipmentCsv(csv, [roadEquipment], [csvSite])
    assert.equal(review.rows[0].status, 'changed')
    assert.deepEqual(
        review.rows[0].changes.map((change) => [change.label, change.proposedValue]),
        [
            ['Road Use ID', String(EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD)],
            ['Registration Number', ''],
            ['Rego Expiry', ''],
            ['WOF Expiry', ''],
        ],
    )
})

test('Equipment Job History labels created, completed, and hour-meter evidence', () => {
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    assert.match(drawer, /Created \{formatDate\(job\.createdon\)\}/)
    assert.match(drawer, /<dt>Completed Date<\/dt>/)
    assert.match(drawer, /job\.gr_completeddate \? formatDate\(job\.gr_completeddate\) : 'Not completed'/)
    assert.match(drawer, /<dt>Hours Recorded<\/dt>/)
    assert.match(drawer, /job\.gr_hourmeter == null \? 'Not recorded'/)
    assert.match(drawer, /HOUR_METER_READING_TYPES\.ESTIMATED/)
    assert.match(drawer, /<span title=\{job\.gr_description \|\| 'No description'\}>/)
    assert.match(drawer, /className="equipment-history-status" data-status=\{job\.gr_status\}/)
    const styles = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.css', import.meta.url), 'utf8')
    for (const status of ['122830000', '122830001', '122830002', '122830003', '122830004', '122830005']) {
        assert.match(styles, new RegExp(`equipment-history-status\\[data-status="${status}"\\]`))
    }
})

test('Equipment table displays and sorts case-insensitive linked Job counts', () => {
    const screen = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    const table = readFileSync(new URL('../src/alpha/equipment/components/EquipmentTable.tsx', import.meta.url), 'utf8')
    const types = readFileSync(new URL('../src/alpha/equipment/types/equipmentManager.types.ts', import.meta.url), 'utf8')
    assert.match(screen, /job\.gr_Equipment\?\.gr_equipmentid\.toLowerCase\(\)/)
    assert.match(screen, /if \(sortKey === 'jobs'\)/)
    assert.match(screen, /jobCounts\.get\(a\.gr_equipmentid\.toLowerCase\(\)\)/)
    assert.match(table, /\{ key: 'jobs', label: 'Jobs' \}/)
    assert.match(table, /className="equipment-job-count"/)
    assert.match(types, /'jobs' \| 'dataStatus'/)
})

test('Equipment Maintenance separates usage insight from legacy service baseline setup', () => {
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    const usageIndex = drawer.indexOf('Average Machine Usage')
    const serviceHistoryIndex = drawer.indexOf('Service history and due dates')
    assert.ok(usageIndex >= 0 && serviceHistoryIndex > usageIndex)
    assert.match(drawer, /Set historical baseline/)
    assert.match(drawer, /only when earlier maintenance is not represented by Jobs/)
    assert.match(drawer, /title="Set Historical Service Baseline"/)
    assert.match(drawer, /latestHourMeterReading\?\.source === 'job'/)
    assert.doesNotMatch(drawer, />Edit history</)
    assert.match(drawer, /Default Maintenance Profile/)
    assert.match(drawer, /<details className="equipment-usage-forecast-card">/)
    assert.match(drawer, /<details className="equipment-service-plan-card"/)
    assert.match(drawer, /<span>Last completed<\/span>/)
    assert.match(drawer, /<span>Next due by<\/span>/)
    assert.match(drawer, /equipment-service-plan-interval/)
    assert.match(drawer, /lastCompletedSummary/)
    assert.match(drawer, /hours not recorded/)
    assert.match(drawer, /Usage-adjusted · default/)
    assert.match(drawer, /Projected hours/)
    assert.doesNotMatch(drawer, /<dt>Estimated Hour Due<\/dt>/)
    const styles = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.css', import.meta.url), 'utf8')
    assert.match(styles, /\.equipment-maintenance-plans dl \{ display: grid; grid-template-columns: repeat\(3,/)
    assert.match(styles, /\.equipment-service-plan-glance/)
    assert.match(styles, /details\[open\] > summary::after/)
})

test('linked Job deletion guidance is attached to the disabled Equipment delete control', () => {
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    const styles = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.css', import.meta.url), 'utf8')
    assert.doesNotMatch(drawer, /equipment-delete-blocked/)
    assert.match(drawer, /className="equipment-delete-tooltip" role="tooltip"/)
    assert.match(drawer, /aria-describedby=\{history\.length > 0 \? 'equipment-delete-explanation'/)
    assert.match(styles, /\.equipment-delete-control:hover \.equipment-delete-tooltip/)
    assert.match(styles, /\.equipment-delete-control:focus \.equipment-delete-tooltip/)
})
