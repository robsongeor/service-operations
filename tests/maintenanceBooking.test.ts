import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { filterMaintenanceExclusions, maintenanceExclusionId, maintenanceSiteContactsKey, matchMaintenanceRow, parseMaintenanceExport, selectedMaintenanceRow } from '../src/alpha/maintenance-booking/maintenanceBooking.ts'
import { OperationalDataClient } from '../src/alpha/shared/data/OperationalDataClient.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'

test('detail selection stays inside visible rows across queue, search and status changes', () => {
    const first = { row: { id: 'first' } }
    const second = { row: { id: 'second' } }
    assert.equal(selectedMaintenanceRow([first, second], 'second'), second)
    assert.equal(selectedMaintenanceRow([first], 'second'), first)
    assert.equal(selectedMaintenanceRow([second], 'first'), second)
    assert.equal(selectedMaintenanceRow([], 'first'), null)
})

test('a late site-contact response cannot replace the newly selected Site or account', async () => {
    const client = new OperationalDataClient('environment:account-one')
    const otherAccount = new OperationalDataClient('environment:account-two')
    const oldKey = maintenanceSiteContactsKey('SITE-A')
    const newKey = maintenanceSiteContactsKey('site-b')
    assert.deepEqual(oldKey, maintenanceSiteContactsKey('site-a'))
    let finishOld!: (value: string[]) => void
    try {
        const oldRequest = client.fetchQuery(oldKey, () => new Promise<string[]>((resolve) => { finishOld = resolve }))
        await client.fetchQuery(newKey, async () => ['new-site-contact'])
        finishOld(['old-site-contact'])
        await oldRequest
        assert.deepEqual(client.getState<string[]>(newKey).data, ['new-site-contact'])
        assert.equal(otherAccount.getState(newKey).data, undefined)
    } finally {
        client.dispose()
        otherAccount.dispose()
    }
})

test('screen binds workspace state to account and contact failures are not empty-list success', () => {
    const screen = readFileSync(new URL('../src/alpha/maintenance-booking/MaintenanceBookingScreen.tsx', import.meta.url), 'utf8')
    assert.match(screen, /<MaintenanceBookingWorkspace key=\{storageKey\} storageKey=\{storageKey\}/)
    assert.match(screen, /selectedMaintenanceRow\(visibleRows, selectedId\)/)
    assert.match(screen, /maintenanceSiteContactsKey\(selectedSiteId\)/)
    assert.match(screen, /useOperationalQuery<SiteContact\[\]>/)
    assert.match(screen, /!contactsLoading && !contactsError && !contacts\.length/)
    assert.match(screen, /Retry contacts/)
    assert.doesNotMatch(screen, /setContactsRefresh|setContacts\(/)
})

test('Greentree maintenance paste imports the exact six-column export format', () => {
    const [row] = parseMaintenanceExport('Code\tDescription\tCustomer\tContact\tPhone\tPM Due Date\nFN1651\tFleet Number 1651\tNuzest New Zealand Ltd\tRosemary Qi\t09 448 2773\t9/03/2026')
    assert.deepEqual(row, {
        id: 'fn1651:nuzestnewzealandltd:2026-03-09:1',
        code: 'FN1651',
        description: 'Fleet Number 1651',
        customer: 'Nuzest New Zealand Ltd',
        contact: 'Rosemary Qi',
        phone: '09 448 2773',
        dueDate: '2026-03-09',
        sourceDueDate: '9/03/2026',
    })
})

test('blank Greentree contact fields do not shift the PM due date', () => {
    const [row] = parseMaintenanceExport('Code\tDescription\tCustomer\tContact\tPhone\tPM Due Date\nFN1601\tFleet Number 1601\tSchenker (NZ) Limited\t\t\t19/01/2026')
    assert.equal(row.contact, '')
    assert.equal(row.phone, '')
    assert.equal(row.dueDate, '2026-01-19')
})

test('Greentree code matches primary and alternate Equipment fleet numbers', () => {
    const equipment = [{
        gr_equipmentid: 'equipment-1',
        gr_fleet: '1800',
        gr_alternatefleetnumbers: 'FN1800\nOLD-1800',
        gr_serial: null,
        gr_make: null,
        gr_model: null,
        gr_Site: { gr_siteid: 'site-1', gr_name: 'Site', gr_Customer: { gr_customerid: 'customer-1', gr_name: 'Example Ltd' } },
    }] satisfies Equipment[]
    const [row] = parseMaintenanceExport('Code\tDescription\tCustomer\tContact\tPhone\tPM Due Date\nFN1800\tFleet Number 1800\tExample Ltd\t\t\t1/08/2026')
    assert.equal(matchMaintenanceRow(row, equipment).equipment?.gr_equipmentid, 'equipment-1')
    assert.equal(matchMaintenanceRow(row, equipment).kind, 'exact')
})

test('customer exclusions survive changed equipment codes and due dates on later imports', () => {
    const rows = parseMaintenanceExport('Code\tDescription\tCustomer\tContact\tPhone\tPM Due Date\nGB-NEW\tGeneral Bearings\tGeneral Bearings * Debt Collectors *\t\t\t1/09/2027\nOTHER\tOther\tOther Customer\t\t\t1/09/2027')
    const result = filterMaintenanceExclusions(rows, [{
        id: maintenanceExclusionId('customer', 'GB', 'General Bearings * Debt Collectors *'),
        scope: 'customer',
        customer: 'General Bearings * Debt Collectors *',
        reason: 'Debt collection',
        createdAt: '2026-08-24T00:00:00.000Z',
    }])
    assert.deepEqual(result.excluded.map((row) => row.code), ['GB-NEW'])
    assert.deepEqual(result.included.map((row) => row.code), ['OTHER'])
})

test('equipment exclusions leave other equipment for the same customer available', () => {
    const rows = parseMaintenanceExport('Code\tDescription\tCustomer\tContact\tPhone\tPM Due Date\nGB1\tOne\tGeneral Bearings\t\t\t1/09/2027\nGB2\tTwo\tGeneral Bearings\t\t\t1/09/2027')
    const result = filterMaintenanceExclusions(rows, [{
        id: maintenanceExclusionId('equipment', 'GB1', 'General Bearings'),
        scope: 'equipment',
        code: 'GB1',
        customer: 'General Bearings',
        reason: 'Equipment sold or disposed',
        createdAt: '2026-08-24T00:00:00.000Z',
    }])
    assert.deepEqual(result.excluded.map((row) => row.code), ['GB1'])
    assert.deepEqual(result.included.map((row) => row.code), ['GB2'])
})
