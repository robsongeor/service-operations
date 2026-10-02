import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CUSTOMER_SITE_EQUIPMENT_CSV_COLUMNS,
    customerSiteEquipmentCsvFilename,
    customerSiteEquipmentCsvText,
} from '../src/alpha/customers/customerSiteEquipmentCsv.ts'

test('Site Equipment CSV exports the focused operational columns with authoritative Site data', () => {
    const csv = customerSiteEquipmentCsvText([{
        gr_equipmentid: 'equipment-1',
        gr_fleet: 'FN2433',
        gr_serial: 'SERIAL-1',
        gr_make: '=unsafe',
        gr_model: 'FM-X17',
        statecode: 1,
        gr_currenthourmeter: 12345,
        gr_currenthourmeterrecordeddate: '2026-09-12T00:00:00Z',
        gr_Site: {
            gr_siteid: 'site-1',
            gr_name: 'Main, Warehouse',
            gr_address: '1 Example Road\nAuckland',
            gr_Customer: { gr_customerid: 'customer-1', gr_name: 'Example "Customer"' },
        },
    }])

    assert.ok(csv.startsWith(`\uFEFF${CUSTOMER_SITE_EQUIPMENT_CSV_COLUMNS.join(',')}\r\n`))
    assert.match(csv, /FN2433,SERIAL-1,'=unsafe,FM-X17,Inactive/)
    assert.match(csv, /"Example ""Customer"""/)
    assert.match(csv, /"Main, Warehouse"/)
    assert.match(csv, /"1 Example Road\nAuckland"/)
    assert.match(csv, /,12345,2026-09-12\r\n$/)
})

test('Site Equipment CSV includes blank hour fields and sorts by Fleet Number', () => {
    const sharedSite = {
        gr_siteid: 'site-1',
        gr_name: 'Main',
        gr_address: '1 Example Road',
        gr_Customer: { gr_customerid: 'customer-1', gr_name: 'Example Customer' },
    }
    const csv = customerSiteEquipmentCsvText([
        { gr_equipmentid: 'equipment-10', gr_fleet: 'FN10', gr_serial: null, gr_make: null, gr_model: null, statecode: 0, gr_Site: sharedSite },
        { gr_equipmentid: 'equipment-2', gr_fleet: 'FN2', gr_serial: null, gr_make: null, gr_model: null, statecode: 0, gr_Site: sharedSite },
    ])
    const rows = csv.trim().split('\r\n')

    assert.match(rows[1], /^FN2,/)
    assert.match(rows[2], /^FN10,/)
    assert.match(rows[1], /,Active,Example Customer,Main,1 Example Road,,$/)
})

test('Site Equipment CSV filename is readable and removes invalid filename characters', () => {
    assert.equal(
        customerSiteEquipmentCsvFilename('Example / Customer', 'Main: Site', '2026-09-14'),
        'Example - Customer - Main- Site - Equipment - 2026-09-14.csv',
    )
})
