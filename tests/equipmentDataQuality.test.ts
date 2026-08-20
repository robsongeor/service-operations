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

test('Equipment drawer owns its styles when opened outside the Equipment route', () => {
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    assert.match(drawer, /import '\.\.\/EquipmentScreen\.css'/)
})

test('Equipment table omits the temporary linked Job count column', () => {
    const screen = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    const table = readFileSync(new URL('../src/alpha/equipment/components/EquipmentTable.tsx', import.meta.url), 'utf8')
    const types = readFileSync(new URL('../src/alpha/equipment/types/equipmentManager.types.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(screen, /jobCounts/)
    assert.doesNotMatch(table, /\{ key: 'jobs', label: 'Jobs' \}/)
    assert.doesNotMatch(table, /className="equipment-job-count"/)
    assert.doesNotMatch(types, /'jobs'/)
})

test('Equipment lazily loads focused Job history in the background and unloads it on close', () => {
    const manager = readFileSync(new URL('../src/alpha/equipment/hooks/useEquipmentManager.ts', import.meta.url), 'utf8')
    const jobsApi = readFileSync(new URL('../src/alpha/jobs/services/jobsApi.ts', import.meta.url), 'utf8')
    const screen = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    const historyHook = readFileSync(new URL('../src/alpha/equipment/hooks/useEquipmentJobHistory.ts', import.meta.url), 'utf8')
    const dataClient = readFileSync(new URL('../src/alpha/shared/data/OperationalDataClient.ts', import.meta.url), 'utf8')

    assert.doesNotMatch(manager, /fetchJobs\(token\)/)
    assert.doesNotMatch(manager, /fetchEquipmentJobs/)
    assert.match(jobsApi, /\$filter=_gr_equipment_value eq \$\{equipmentId\}/)
    assert.match(screen, /setEditingEquipment\(record\)/)
    assert.match(screen, /useEquipmentJobHistory\(editingEquipment\?\.gr_equipmentid\)/)
    assert.match(screen, /jobs=\{equipmentJobHistory\.jobs\}/)
    assert.match(screen, /onClose=\{\(\) => setEditingEquipment\(null\)\}/)
    assert.match(historyHook, /fetchEquipmentJobs\(token, normalizedEquipmentId, signal\)/)
    assert.match(historyHook, /EQUIPMENT_JOB_HISTORY_CACHE_TIME_MS = 60_000/)
    assert.match(dataClient, /entry\.controller\?\.abort\(\)/)
    assert.match(dataClient, /if \(entry\.listeners\.size === 0\) this\.remove\(key\)/)
})

test('Customer Dashboard also opens Equipment immediately while focused Job history loads', () => {
    const dashboard = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    assert.match(dashboard, /useEquipmentJobHistory\(editingEquipment\?\.gr_equipmentid\)/)
    assert.match(dashboard, /const openEquipment = useCallback\(\(record: Equipment\)/)
    assert.match(dashboard, /setEditingEquipment\(record\)/)
    assert.match(dashboard, /void openEquipment\(item\)/)
    assert.match(dashboard, /isJobHistoryLoading=\{equipmentJobHistory\.isLoading\}/)
    assert.match(dashboard, /jobs=\{visibleEquipmentJobs\}/)
    assert.doesNotMatch(dashboard, /clearEquipmentJobs/)
})

test('Equipment maintenance plans load only when the maintenance tab needs them', () => {
    const keys = readFileSync(new URL('../src/alpha/shared/data/operationalCollectionKeys.ts', import.meta.url), 'utf8')
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    const manager = readFileSync(new URL('../src/alpha/equipment/hooks/useEquipmentManager.ts', import.meta.url), 'utf8')
    const equipmentScreen = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    const dashboard = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    const wofScreen = readFileSync(new URL('../src/alpha/wof/WofScreen.tsx', import.meta.url), 'utf8')

    assert.match(keys, /focusedEquipmentServicePlansQueryKey/)
    assert.match(drawer, /enabled: activeTab === 'maintenance'/)
    assert.match(drawer, /Loading service history and due dates/)
    assert.match(manager, /fetchEquipmentServicePlansForEquipment\(token, \[equipmentId\], signal\)/)
    assert.match(equipmentScreen, /onLoadServicePlans=\{loadEquipmentServicePlans\}/)
    assert.match(dashboard, /onLoadServicePlans=\{loadEquipmentServicePlans\}/)
    assert.match(wofScreen, /onLoadServicePlans=\{loadEquipmentServicePlans\}/)
})

test('WOF Equipment drawer uses the same focused Job history workflow', () => {
    const wofScreen = readFileSync(new URL('../src/alpha/wof/WofScreen.tsx', import.meta.url), 'utf8')
    assert.match(wofScreen, /useEquipmentJobHistory\(editingEquipment\?\.gr_equipmentid\)/)
    assert.match(wofScreen, /jobs=\{equipmentJobHistory\.jobs\}/)
    assert.match(wofScreen, /isJobHistoryLoading=\{equipmentJobHistory\.isLoading\}/)
    assert.match(wofScreen, /onRetryJobHistory=/)
})

test('Customer Dashboard prepares Job reference data before applying Customer or Equipment defaults', () => {
    const dashboard = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    assert.match(dashboard, /const referenceData = await prepareJobReferenceData\(\)/)
    assert.match(dashboard, /void openJobCreate\(initialJobValuesForCustomer\(selectedCustomer\)\)/)
    assert.match(dashboard, /void openJobCreate\(initialJobValuesForEquipment\(record\)\)/)
    assert.match(dashboard, /equipmentId: selectedEquipment\?\.gr_equipmentid/)
    assert.match(dashboard, /contactsForSite\.length === 1/)
})

test('Customer Dashboard uses the same effective hierarchical maintenance plans as Equipment details', () => {
    const dashboard = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    assert.match(dashboard, /resolveEffectiveServicePlans\(servicePlans\.filter/)
    assert.match(dashboard, /calculateEquipmentUsageForecast\(item, operationalJobs\)/)
    assert.match(dashboard, /calculatePrimaryForecastAdjustedService\(plans, item, forecast, today\)/)
    assert.match(dashboard, /maintenanceByEquipment\.get\(item\.gr_equipmentid\)\?\.primary\?\.status/)
})

test('Customer Dashboard Equipment history opens immediately and lets the canonical drawer refresh progressively', () => {
    const dashboard = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    assert.match(drawer, /className=\{!isCreate && props\.onOpenJob \? 'equipment-history-card-clickable'/)
    assert.match(drawer, /role=\{!isCreate && props\.onOpenJob \? 'button'/)
    assert.match(drawer, /event\.key !== 'Enter' && event\.key !== ' '/)
    assert.match(dashboard, /const openEquipmentHistoryJob = useCallback\(\(job: Job\) => \{\s*setEditingJob\(job\)/)
    assert.match(dashboard, /onOpenJob=\{\(job\) => \{ void openEquipmentHistoryJob\(job\) \}\}/)
    assert.match(dashboard, /onRefreshJob=\{fetchJobForDrawer\}/)
    assert.match(dashboard, /onLoadJobCardDetails=\{fetchJobCardDetails\}/)
})

test('Customer Dashboard reconciles completed Jobs and Equipment state without a browser refresh', () => {
    const dashboard = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    assert.match(dashboard, /const authoritativeJobs = new Map\(operationalJobs\.map/)
    assert.match(dashboard, /jobs=\{visibleEquipmentJobs\}/)
    assert.match(dashboard, /await completeStandardJob\(\.\.\.args\)\s+await customerData\.refetch\(\)/)
    assert.match(dashboard, /await completeServiceJob\(\.\.\.args\)\s+await customerData\.refetch\(\)/)
    assert.match(dashboard, /await completeWofJob\(\.\.\.args\)\s+await customerData\.refetch\(\)/)
    assert.match(dashboard, /const currentEditingEquipment = editingEquipment/)
    assert.match(dashboard, /equipment=\{currentEditingEquipment\}/)
})

test('Customer Dashboard creates an Equipment Job without broadly reloading the workspace', () => {
    const dashboard = readFileSync(new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url), 'utf8')
    assert.match(dashboard, /onCreateJob=\{createJob\}/)
    assert.doesNotMatch(dashboard, /const jobId = await createJob\(input\)\s+await reload\(\)/)
    assert.match(dashboard, /const newlyCreated = operationalJobs\.filter/)
    assert.match(dashboard, /return \[\.\.\.reconciled, \.\.\.newlyCreated\]/)
})

test('Equipment Create Job applies exact defaults immediately and hydrates bounded relationships', () => {
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentJobCreateDrawer.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(drawer, /prepareJobEditorReferenceData/)
    assert.doesNotMatch(drawer, /referenceDataStatus !== 'ready'/)
    assert.match(drawer, /loadGlobalOperationalData: false/)
    assert.match(drawer, /equipment: \[equipment\]/)
    assert.match(drawer, /onSearchEquipment=\{searchEquipmentForEditor\}/)
    assert.match(drawer, /onLoadEquipment=\{loadEquipmentForEditor\}/)
    assert.match(drawer, /mechanicsLoading=\{mechanicsLoading\}/)
    assert.match(drawer, /equipmentId: equipment\.gr_equipmentid/)
    assert.match(drawer, /siteId,/)
    assert.match(drawer, /customerId: equipment\.gr_Site\?\.gr_Customer\?\.gr_customerid/)
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
    assert.match(drawer, /Usage estimate ·/)
    assert.match(drawer, /Default profile fallback · usage confidence below 40%/)
    assert.match(drawer, /calculateForecastAdjustedServicePlan\(plan,/)
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

test('Equipment Manager progressively loads register support instead of full startup directories', () => {
    const screen = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    const manager = readFileSync(new URL('../src/alpha/equipment/hooks/useEquipmentManager.ts', import.meta.url), 'utf8')
    const map = readFileSync(new URL('../src/alpha/equipment-map/EquipmentMapScreen.tsx', import.meta.url), 'utf8')

    assert.match(screen, /loadGlobalRelationships: false/)
    assert.match(screen, /loadGlobalServicePlans: false/)
    assert.match(screen, /item\.gr_Site\?\.gr_Customer/)
    assert.match(screen, /sortKey === 'dataStatus' \? preliminaryRows : preliminaryPage\.rows/)
    assert.match(screen, /loadEquipmentServicePlansForIds\(servicePlanEquipmentIds, signal\)/)
    assert.match(screen, /loadEquipmentCsvReferenceData\(\)/)
    assert.match(screen, /servicePlansUnavailable=\{Boolean\(servicePlansError\)\}/)
    assert.match(drawer, /resultLimit=\{8\}/)
    assert.match(drawer, /onSearchCustomers\(customerSearch, controller\.signal\)/)
    assert.match(drawer, /onLoadCustomerSites\(customerId, controller\.signal\)/)
    assert.match(manager, /loadGlobalRelationships \? getToken\(\)\.then\(fetchCustomers\) : Promise\.resolve\(\[\]\)/)
    assert.match(manager, /loadGlobalServicePlans \? getToken\(\)\.then\(fetchEquipmentServicePlans\) : Promise\.resolve\(\[\]\)/)
    assert.match(manager, /operationalDataClient\.fetchQuery\([\s\S]*?EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY/)
    assert.match(map, /loadGlobalServicePlans: false/)
})
