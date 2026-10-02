import assert from 'node:assert/strict'
import test from 'node:test'
import { parseJobSpreadsheetPaste, resolveJobSpreadsheetRows } from '../src/alpha/job-import/jobSpreadsheetImport.ts'
import { buildJobCreateChangeSet } from '../src/alpha/jobs/services/jobsApi.ts'
import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'
import { JOB_TYPES } from '../src/alpha/jobs/types/jobType.types.ts'
import { SERVICE_TYPES } from '../src/alpha/equipment/servicePlans/equipmentServicePlan.types.ts'

const header = 'Job Number\tDate\tMechanic\tModel\tFleet\tCustomer\tDescription\n'
const customers = [
    { gr_customerid: 'customer-suntory', gr_name: 'Suntory Beverage & Food NZ Ltd' },
    { gr_customerid: 'customer-other', gr_name: 'Other Customer' },
]
const equipment = [
    {
        gr_equipmentid: 'equipment-2638', gr_fleet: 'FN2638', gr_alternatefleetnumbers: 'OLD2638', gr_serial: 'SERIAL-1', gr_make: 'EP', gr_model: 'TPL251',
        gr_Site: { gr_siteid: 'site-suntory', gr_name: 'Suntory', gr_Customer: customers[0] },
    },
    {
        gr_equipmentid: 'equipment-2433', gr_fleet: 'FN2433', gr_serial: 'SERIAL-2', gr_make: 'Still', gr_model: 'FM-X17',
        gr_Site: { gr_siteid: 'site-suntory', gr_name: 'Suntory', gr_Customer: customers[0] },
    },
    {
        gr_equipmentid: 'equipment-2434', gr_fleet: 'FN2434', gr_serial: 'SERIAL-3', gr_make: 'Still', gr_model: 'FM-X17',
        gr_Site: { gr_siteid: 'site-suntory', gr_name: 'Suntory', gr_Customer: customers[0] },
    },
]
const mechanics = [{ gr_mechanicid: 'mechanic-fotu', gr_name: 'Fotu', gr_email: '', gr_phone: '' }]

test('spreadsheet paste reads Excel TSV and converts New Zealand dates without timezone shifts', () => {
    const [row] = parseJobSpreadsheetPaste(`${header}141793\t17/02/2026\tFotu\tTPL251\tFN2638\tSuntory\tUplift unit`)
    assert.equal(row.jobNumber, '141793')
    assert.equal(row.completedDate, '2026-02-17')
    assert.equal(row.description, 'Uplift unit')
})

test('spreadsheet paste requires the named seven-column contract', () => {
    assert.throws(() => parseJobSpreadsheetPaste('Job Number\tDate\n1\t1/01/2026'), /missing/i)
    assert.throws(() => parseJobSpreadsheetPaste(''), /Paste the spreadsheet header/)
})

test('review resolves Equipment and uses its authoritative Customer', () => {
    const rows = parseJobSpreadsheetPaste(`${header}141793\t17/02/2026\tFotu\tTPL251\told2638\tSuntory\tUplift unit`)
    const [review] = resolveJobSpreadsheetRows(rows, { equipment, mechanics, jobs: [] })
    assert.equal(review.ready, true)
    assert.equal(review.equipment?.gr_equipmentid, 'equipment-2638')
    assert.equal(review.customer?.gr_customerid, 'customer-suntory')
    assert.deepEqual(review.issues, [])
})

test('review blocks multi-Equipment rows, missing staff, and duplicate Jobs', () => {
    const rows = parseJobSpreadsheetPaste(`${header}141793\t17/02/2026\tUnknown\tFM-X17\tFN2433/FN2434\tOther Customer\tAdjust units`)
    const [review] = resolveJobSpreadsheetRows(rows, { equipment, mechanics, jobs: [{ gr_jobid: 'existing', createdon: '', gr_jobnumber: '141793', gr_status: JOB_STATUSES.COMPLETE, gr_ordernumber: null, gr_description: '' }] })
    assert.equal(review.ready, false)
    const messages = review.issues.map((issue) => issue.message).join(' ')
    assert.match(messages, /already exists/)
    assert.match(messages, /contains more than one Fleet Number/)
    assert.match(messages, /Staff member Unknown was not found/)
})

test('Customer and Model spreadsheet differences are ignored', () => {
    const rows = parseJobSpreadsheetPaste(`${header}141793\t17/02/2026\tFotu\tDifferent Model\tFN2638\tOther Customer\tUplift unit`)
    const [review] = resolveJobSpreadsheetRows(rows, { equipment, mechanics, jobs: [] })
    assert.equal(review.customer?.gr_customerid, 'customer-suntory')
    assert.equal(review.ready, true)
    assert.deepEqual(review.issues, [])
})

test('review blocks Equipment that has no Customer through its Site', () => {
    const rows = parseJobSpreadsheetPaste(`${header}141793\t17/02/2026\tFotu\tTPL251\tFN2638\tIgnored Customer\tUplift unit`)
    const equipmentWithoutCustomer = [{ ...equipment[0], gr_Site: { gr_siteid: 'site-without-customer', gr_name: 'Unassigned Site' } }]
    const [review] = resolveJobSpreadsheetRows(rows, { equipment: equipmentWithoutCustomer, mechanics, jobs: [] })
    assert.equal(review.ready, false)
    assert.match(review.issues.map((issue) => issue.message).join(' '), /no Customer through its Site/)
})

test('atomic Job import change set creates complete linked Jobs in one transaction', () => {
    const batch = buildJobCreateChangeSet([{
        jobNumber: '141793', orderNumber: '', description: 'Uplift unit', jobType: JOB_TYPES.BREAKDOWN,
        status: JOB_STATUSES.COMPLETE, equipmentId: 'equipment-2638', mechanicId: 'mechanic-fotu',
        siteId: 'site-suntory', completedDate: '2026-02-17', serviceType: SERVICE_TYPES.NONE,
    }], 'request-1')
    assert.equal(batch.operationCount, 1)
    assert.match(batch.contentType, /batch_job_import_request1/)
    assert.match(batch.body, /POST \/api\/data\/v9\.2\/gr_jobs/)
    assert.match(batch.body, /"gr_jobnumber":"141793"/)
    assert.match(batch.body, /"gr_completeddate":"2026-02-17"/)
    assert.match(batch.body, /gr_Equipment@odata\.bind/)
})
