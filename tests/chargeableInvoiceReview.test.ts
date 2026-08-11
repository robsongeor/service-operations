import assert from 'node:assert/strict'
import test from 'node:test'

import {
    CHARGEABLE_INVOICE_DISPOSITIONS,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    CHARGEABLE_INVOICE_WAITING_ON,
} from '../src/alpha/chargeable-invoices/types/chargeableInvoice.types.ts'
import {
    deriveChargeableInvoicePrimaryQueue,
    getReadyToProcessBlockers,
    validateChargeableInvoiceWaiting,
    validateDoNotProcess,
} from '../src/alpha/chargeable-invoices/domain/chargeableInvoiceState.ts'

test('queue state requires an explicit start and gives Waiting precedence while active', () => {
    assert.equal(deriveChargeableInvoicePrimaryQueue({}), 'new')
    assert.equal(deriveChargeableInvoicePrimaryQueue({ gr_reviewstartedon: '2026-08-11T01:00:00Z' }), 'in-progress')
    assert.equal(deriveChargeableInvoicePrimaryQueue({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
    }), 'waiting')
})

test('terminal dispositions derive Ready and History without another completion action', () => {
    assert.equal(deriveChargeableInvoicePrimaryQueue({
        gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.READY_TO_PROCESS,
    }), 'ready-to-process')
    assert.equal(deriveChargeableInvoicePrimaryQueue({
        gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.DO_NOT_PROCESS,
    }), 'history')
})

test('Waiting requires a useful note and cannot coexist with a terminal disposition', () => {
    assert.match(validateChargeableInvoiceWaiting({
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
    }) ?? '', /waiting note/i)
    assert.match(validateChargeableInvoiceWaiting({
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
        gr_waitingnote: 'Customer may trade the machine.',
        gr_disposition: CHARGEABLE_INVOICE_DISPOSITIONS.DO_NOT_PROCESS,
    }) ?? '', /cannot remain/i)
})

test('PO and photo prerequisites block Ready until the confirmed business events occur', () => {
    const started = { gr_reviewstartedon: '2026-08-11T01:00:00Z', gr_porequired: true }
    assert.deepEqual(getReadyToProcessBlockers(started), [
        'Record the customer PO number.',
        'Mark the customer PO as received.',
        'Decide whether supporting photos are required.',
    ])
    assert.deepEqual(getReadyToProcessBlockers({
        ...started,
        gr_ponumber: 'PO-123',
        gr_poreceivedon: '2026-08-11T02:00:00Z',
        gr_photosrequired: true,
        gr_photosstatus: CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED,
    }), [])
})

test('Do Not Process requires review, resolved Waiting, and an explanatory reason', () => {
    assert.match(validateDoNotProcess({}) ?? '', /start/i)
    assert.match(validateDoNotProcess({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_waitingon: CHARGEABLE_INVOICE_WAITING_ON.SALES,
        gr_dispositionreason: 'Machine was traded.',
    }) ?? '', /waiting/i)
    assert.equal(validateDoNotProcess({
        gr_reviewstartedon: '2026-08-11T01:00:00Z',
        gr_dispositionreason: 'Machine was traded and the invoice must not be charged.',
    }), null)
})
