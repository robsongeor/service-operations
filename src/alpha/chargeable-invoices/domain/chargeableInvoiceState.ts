import {
    CHARGEABLE_INVOICE_DISPOSITIONS,
    CHARGEABLE_INVOICE_PHOTO_STATUSES,
    type ChargeableInvoiceReview,
    type ChargeableInvoicePhotoStatus,
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
    review: Pick<ChargeableInvoiceReview, 'gr_reviewstartedon' | 'gr_waitingon' | 'gr_waitingnote' | 'gr_disposition'>,
) {
    if (review.gr_disposition != null && review.gr_waitingon != null) {
        return 'A historical invoice review cannot remain in Waiting.'
    }
    if (review.gr_waitingon != null && !review.gr_reviewstartedon) return 'Start the review before setting Waiting.'
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
        | 'gr_porequestpreparedon'
        | 'gr_photosrequired'
        | 'gr_photosstatus'>,
    hasActiveAmendments = false,
) {
    const blockers: string[] = []
    if (!review.gr_reviewstartedon) blockers.push('Start the review first.')
    if (review.gr_waitingon != null) blockers.push('Resolve the current Waiting state.')
    if (!hasActiveAmendments && review.gr_porequired == null) blockers.push('Decide whether a PO is required.')
    if (!hasActiveAmendments && review.gr_photosrequired == null) blockers.push('Decide whether supporting photos are required.')
    if (review.gr_photosrequired && review.gr_photosstatus !== CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED) {
        blockers.push('Receive the required supporting photos.')
    }
    if (review.gr_porequired && !review.gr_porequestpreparedon) {
        blockers.push('Prepare the customer PO request email.')
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

export type ChargeableInvoiceRequirementsDraft = {
    poRequired: boolean | null
    poNumber: string
    poReceived: boolean
    photosRequired: boolean | null
    photosStatus: ChargeableInvoicePhotoStatus | null
}

export function validateChargeableInvoiceRequirements(draft: ChargeableInvoiceRequirementsDraft) {
    if (draft.poReceived && draft.poRequired !== true) return 'PO receipt can be recorded only when a PO is required.'
    if (draft.poReceived && !draft.poNumber.trim()) return 'Enter the confirmed customer PO number before marking it received.'
    if (draft.poNumber.trim().length > 100) return 'PO Number must be 100 characters or fewer.'
    if (draft.photosStatus === CHARGEABLE_INVOICE_PHOTO_STATUSES.RECEIVED && draft.photosRequired !== true) {
        return 'Photos can be marked received only when supporting photos are required.'
    }
    return null
}
