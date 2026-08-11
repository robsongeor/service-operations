import {
    CHARGEABLE_INVOICE_DISPOSITIONS,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    type ChargeableInvoiceReview,
} from '../types/chargeableInvoice.types.ts'

export type ChargeableInvoicePrimaryQueue = 'new' | 'in-progress' | 'waiting' | 'ready-to-process' | 'history'

export function deriveChargeableInvoicePrimaryQueue(
    review: Pick<ChargeableInvoiceReview, 'gr_reviewstartedon' | 'gr_waitingon' | 'gr_disposition'>,
): ChargeableInvoicePrimaryQueue {
    if (review.gr_disposition === CHARGEABLE_INVOICE_DISPOSITIONS.READY_TO_PROCESS) {
        return 'ready-to-process'
    }
    if (review.gr_disposition === CHARGEABLE_INVOICE_DISPOSITIONS.DO_NOT_PROCESS) {
        return 'history'
    }
    if (review.gr_waitingon != null) return 'waiting'
    if (review.gr_reviewstartedon) return 'in-progress'
    return 'new'
}

export function validateChargeableInvoiceWaiting(
    review: Pick<ChargeableInvoiceReview, 'gr_waitingon' | 'gr_waitingnote' | 'gr_disposition'>,
) {
    if (review.gr_disposition != null && review.gr_waitingon != null) {
        return 'A historical invoice review cannot remain in Waiting.'
    }
    if (review.gr_waitingon != null && !review.gr_waitingnote?.trim()) {
        return 'Enter a waiting note describing what is outstanding.'
    }
    return null
}

export function getReadyToProcessBlockers(
    review: Pick<ChargeableInvoiceReview,
        | 'gr_reviewstartedon'
        | 'gr_waitingon'
        | 'gr_porequired'
        | 'gr_ponumber'
        | 'gr_poreceivedon'
        | 'gr_photosrequired'
        | 'gr_photosstatus'>,
) {
    const blockers: string[] = []
    if (!review.gr_reviewstartedon) blockers.push('Start the review first.')
    if (review.gr_waitingon != null) blockers.push('Resolve the current Waiting state.')
    if (review.gr_porequired == null) blockers.push('Decide whether a PO is required.')
    if (review.gr_porequired) {
        if (!review.gr_ponumber?.trim()) blockers.push('Record the customer PO number.')
        if (!review.gr_poreceivedon) blockers.push('Mark the customer PO as received.')
        if (review.gr_photosrequired == null) blockers.push('Decide whether supporting photos are required.')
    }
    if (review.gr_photosrequired && review.gr_photosstatus !== CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED) {
        blockers.push('Receive the required supporting photos.')
    }
    return blockers
}

export function validateDoNotProcess(
    review: Pick<ChargeableInvoiceReview, 'gr_reviewstartedon' | 'gr_waitingon' | 'gr_dispositionreason'>,
) {
    if (!review.gr_reviewstartedon) return 'Start the review first.'
    if (review.gr_waitingon != null) return 'Resolve the current Waiting state.'
    if (!review.gr_dispositionreason?.trim()) return 'Enter the reason this invoice must not be processed.'
    return null
}
