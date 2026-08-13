import assert from 'node:assert/strict'
import test from 'node:test'
import {
    canBeAssignedJobs,
    canReceiveInternalEmail,
    customerEmailCcRecipients,
    shouldCopyOnCustomerEmail,
    staffDepartmentLabel,
    STAFF_DEPARTMENTS,
} from '../src/alpha/mechanics/staffDirectory.ts'

test('legacy active mechanics remain assignable when the new flag is null or absent', () => {
    assert.equal(canBeAssignedJobs({ statecode: 0 }), true)
    assert.equal(canBeAssignedJobs({ statecode: 0, gr_jobassignmentenabled: null }), true)
})

test('office and inactive staff are excluded from technician assignments', () => {
    assert.equal(canBeAssignedJobs({ statecode: 0, gr_jobassignmentenabled: false }), false)
    assert.equal(canBeAssignedJobs({ statecode: 1, gr_jobassignmentenabled: true }), false)
})

test('active emailed office staff remain eligible as internal email recipients', () => {
    assert.equal(canReceiveInternalEmail({ statecode: 0, gr_email: 'accounts@liftrucks.co.nz' }), true)
    assert.equal(canReceiveInternalEmail({ statecode: 0, gr_email: '' }), false)
    assert.equal(canReceiveInternalEmail({ statecode: 1, gr_email: 'accounts@liftrucks.co.nz' }), false)
})

test('department labels use Service for legacy blank values', () => {
    assert.equal(staffDepartmentLabel(STAFF_DEPARTMENTS.ACCOUNTS), 'Accounts')
    assert.equal(staffDepartmentLabel(null), 'Service')
})

test('customer email CC includes only active opted-in staff with valid unique emails', () => {
    assert.equal(shouldCopyOnCustomerEmail({ statecode: 0, gr_email: 'manager@liftrucks.co.nz', gr_customeremailccenabled: true }), true)
    assert.equal(shouldCopyOnCustomerEmail({ statecode: 0, gr_email: 'manager@liftrucks.co.nz', gr_customeremailccenabled: false }), false)
    assert.deepEqual(customerEmailCcRecipients([
        { statecode: 0, gr_email: 'Manager@liftrucks.co.nz', gr_customeremailccenabled: true },
        { statecode: 0, gr_email: 'manager@liftrucks.co.nz', gr_customeremailccenabled: true },
        { statecode: 1, gr_email: 'inactive@liftrucks.co.nz', gr_customeremailccenabled: true },
        { statecode: 0, gr_email: '', gr_customeremailccenabled: true },
    ]), ['manager@liftrucks.co.nz'])
})
