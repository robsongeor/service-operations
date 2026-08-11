export const CHARGEABLE_INVOICE_MATCH_STATUSES = {
    MATCHED_EXACTLY: 122830000,
    MATCHED_MANUALLY: 122830001,
    UNMATCHED: 122830002,
    AMBIGUOUS: 122830003,
} as const

export const CHARGEABLE_INVOICE_IMPORT_STATUSES = {
    STAGING: 122830000,
    ACTIVE: 122830001,
    FAILED: 122830002,
} as const

export const CHARGEABLE_INVOICE_WAITING_ON = {
    TECHNICIAN: 122830000,
    CUSTOMER: 122830001,
    ACCOUNTS: 122830002,
    SALES: 122830003,
    MANAGEMENT: 122830004,
    OTHER: 122830005,
} as const

export const CHARGEABLE_INVOICE_PHOTO_STATUSES = {
    NOT_REQUESTED: 122830000,
    REQUESTED: 122830001,
    RECEIVED: 122830002,
} as const

export const CHARGEABLE_INVOICE_DISPOSITIONS = {
    READY_TO_PROCESS: 122830000,
    DO_NOT_PROCESS: 122830001,
} as const

export const CHARGEABLE_INVOICE_LINE_TYPES = {
    LABOUR: 122830000,
    PARTS: 122830001,
    OTHER: 122830002,
} as const

export const CHARGEABLE_INVOICE_CORRECTION_TYPES = {
    HEADER_FIELD: 122830000,
    STORY: 122830001,
    CHANGE_LINE: 122830002,
    ADD_LINE: 122830003,
    REMOVE_LINE: 122830004,
} as const

export const CHARGEABLE_INVOICE_CORRECTION_COMPARISONS = {
    OUTSTANDING: 122830000,
    MATCHED_IN_REVISION: 122830001,
    NOT_MADE: 122830002,
    SUPERSEDED: 122830003,
} as const

export const CHARGEABLE_INVOICE_DOCUMENT_TYPES = {
    GREENTREE_INVOICE: 122830000,
    APPROVAL_PDF: 122830001,
    SUPPORTING_PHOTO: 122830002,
    CUSTOMER_PO: 122830003,
    JOB_CARD: 122830004,
    OTHER: 122830005,
} as const

export const CHARGEABLE_INVOICE_UPLOAD_STATUSES = {
    PENDING: 122830000,
    COMPLETE: 122830001,
    FAILED: 122830002,
} as const

type ValueOf<T> = T[keyof T]

export type ChargeableInvoiceMatchStatus = ValueOf<typeof CHARGEABLE_INVOICE_MATCH_STATUSES>
export type ChargeableInvoiceImportStatus = ValueOf<typeof CHARGEABLE_INVOICE_IMPORT_STATUSES>
export type ChargeableInvoiceWaitingOn = ValueOf<typeof CHARGEABLE_INVOICE_WAITING_ON>
export type ChargeableInvoicePhotoStatus = ValueOf<typeof CHARGEABLE_INVOICE_PHOTO_STATUSES>
export type ChargeableInvoiceDisposition = ValueOf<typeof CHARGEABLE_INVOICE_DISPOSITIONS>
export type ChargeableInvoiceLineType = ValueOf<typeof CHARGEABLE_INVOICE_LINE_TYPES>
export type ChargeableInvoiceCorrectionType = ValueOf<typeof CHARGEABLE_INVOICE_CORRECTION_TYPES>
export type ChargeableInvoiceCorrectionComparison = ValueOf<typeof CHARGEABLE_INVOICE_CORRECTION_COMPARISONS>
export type ChargeableInvoiceDocumentType = ValueOf<typeof CHARGEABLE_INVOICE_DOCUMENT_TYPES>
export type ChargeableInvoiceUploadStatus = ValueOf<typeof CHARGEABLE_INVOICE_UPLOAD_STATUSES>

export type ChargeableInvoiceReview = {
    gr_chargeableinvoicereviewid: string
    gr_name: string
    gr_invoicenumber: string
    gr_invoicedate: string
    gr_greentreereference: string
    gr_matchstatus: ChargeableInvoiceMatchStatus
    gr_importstatus: ChargeableInvoiceImportStatus
    gr_reviewstartedon?: string | null
    gr_waitingon?: ChargeableInvoiceWaitingOn | null
    gr_waitingnote?: string | null
    gr_porequired?: boolean | null
    gr_ponumber?: string | null
    gr_poreceivedon?: string | null
    gr_photosrequired?: boolean | null
    gr_photosstatus?: ChargeableInvoicePhotoStatus | null
    _gr_photorequesttechnician_value?: string | null
    gr_photorequestpreparedon?: string | null
    gr_porequestpreparedon?: string | null
    gr_disposition?: ChargeableInvoiceDisposition | null
    gr_dispositionon?: string | null
    gr_dispositionreason?: string | null
    _gr_job_value?: string | null
    _gr_customer_value?: string | null
    _gr_site_value?: string | null
    _gr_equipment_value?: string | null
    _gr_currentrevision_value?: string | null
    '@odata.etag'?: string
    createdon?: string
    modifiedon?: string
    gr_CurrentRevision?: ChargeableInvoiceRevision | null
    gr_Job?: { gr_jobid: string; gr_jobnumber?: string | null; gr_description?: string | null } | null
    gr_Customer?: { gr_customerid: string; gr_name: string } | null
    gr_Site?: { gr_siteid: string; gr_name: string } | null
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet?: string | null
        gr_make?: string | null
        gr_model?: string | null
        gr_serial?: string | null
    } | null
}

export type ChargeableInvoiceTechnician = {
    gr_mechanicid: string
    gr_name: string
    gr_email?: string | null
    statecode?: number
}

export type ChargeableInvoiceDocument = {
    gr_chargeableinvoicedocumentid: string
    gr_name: string
    _gr_review_value: string
    _gr_revision_value?: string | null
    gr_documenttype: ChargeableInvoiceDocumentType
    gr_contenttype: string
    gr_bytecount: number
    gr_templateversion?: string | null
    gr_sourcesnapshothash?: string | null
    gr_uploadstatus: ChargeableInvoiceUploadStatus
    gr_uploaderror?: string | null
    gr_filename?: string | null
    '@odata.etag'?: string
    createdon?: string
}

export type ChargeableInvoiceLine = {
    gr_chargeableinvoicelineid: string
    _gr_revision_value: string
    gr_linekey: string
    gr_linetype: ChargeableInvoiceLineType
    gr_description: string
    gr_quantity?: number | null
    gr_unitprice?: number | null
    gr_extendedprice?: number | null
    gr_sortorder: number
    gr_confidence?: number | null
    gr_rawtext?: string | null
}

export type ChargeableInvoiceLineDraft = Omit<
    ChargeableInvoiceLine,
    'gr_chargeableinvoicelineid' | '_gr_revision_value'
>

export type ChargeableInvoiceRevisionSnapshot = {
    gr_revisionnumber?: number
    gr_extractionversion: string
    gr_extractionconfidence?: number | null
    gr_invoicenumber: string
    gr_invoicedate: string
    gr_rawordernumber?: string | null
    gr_greentreereference: string
    gr_accountsnapshot?: string | null
    gr_customersnapshot?: string | null
    gr_sitesnapshot?: string | null
    gr_headline?: string | null
    gr_fleet?: string | null
    gr_make?: string | null
    gr_model?: string | null
    gr_serial?: string | null
    gr_meter?: number | null
    gr_dateofjob?: string | null
    gr_serviceinterval?: string | null
    gr_nextdue?: string | null
    gr_repairdescription?: string | null
    gr_workcompleted?: string | null
    gr_subtotal?: number | null
    gr_gstrate?: number | null
    gr_gstamount?: number | null
    gr_total?: number | null
    gr_extractionjson: string
}

export type ChargeableInvoiceRevision = ChargeableInvoiceRevisionSnapshot & {
    gr_chargeableinvoicerevisionid: string
    gr_name: string
    _gr_review_value: string
    _gr_sourcedocument_value: string
    gr_revisionnumber: number
    createdon?: string
}

export type ChargeableInvoiceCorrection = {
    gr_chargeableinvoicecorrectionid: string
    _gr_review_value: string
    _gr_sourcerevision_value: string
    _gr_sourceline_value?: string | null
    gr_correctiontype: ChargeableInvoiceCorrectionType
    gr_fieldkey?: string | null
    gr_originalsnapshot?: string | null
    gr_requestedtext?: string | null
    gr_requestedlinetype?: ChargeableInvoiceLineType | null
    gr_requesteddescription?: string | null
    gr_requestedquantity?: number | null
    gr_requestedunitprice?: number | null
    gr_comparisonstatus: ChargeableInvoiceCorrectionComparison
    _gr_matchedrevision_value?: string | null
    createdon?: string
}

export type ChargeableInvoiceActivity = {
    gr_chargeableinvoiceactivityid: string
    gr_name: string
    _gr_review_value: string
    _gr_revision_value?: string | null
    _gr_document_value?: string | null
    _gr_correction_value?: string | null
    gr_event: number
    gr_detail?: string | null
    gr_occurredon: string
    createdon?: string
    _createdby_value?: string | null
    '_createdby_value@OData.Community.Display.V1.FormattedValue'?: string
}

export type ChargeableInvoiceWorkspace = {
    review: ChargeableInvoiceReview
    revisions: ChargeableInvoiceRevision[]
    lines: ChargeableInvoiceLine[]
    corrections: ChargeableInvoiceCorrection[]
    documents: ChargeableInvoiceDocument[]
    activities: ChargeableInvoiceActivity[]
    technicians: ChargeableInvoiceTechnician[]
}
