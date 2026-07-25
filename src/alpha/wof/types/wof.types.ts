import type { Equipment } from '../../jobs/types/equipment.types'
import type { Job } from '../../jobs/types/job.types'
import type { Mechanic } from '../../jobs/types/mechanic.types'

export const WOF_RESULTS = {
    PLANNED: 122830000,
    PASSED: 122830001,
    FAILED: 122830002,
    CANCELLED: 122830003,
} as const
export type WofResult = typeof WOF_RESULTS[keyof typeof WOF_RESULTS]

export type WofDueStatus = 'expired' | 'due-soon' | 'current' | 'unknown' | 'not-required'
export type WofTab = 'all' | 'due-soon' | 'expired' | 'in-progress' | 'ready'
export type WofAssignmentMode = 'internal' | 'external'

export type QualificationType = {
    gr_qualificationtypeid: string
    gr_name: string
    gr_code: string
    gr_active: boolean
}

export type TechnicianQualification = {
    gr_technicianqualificationid: string
    gr_name: string
    gr_certificatenumber?: string | null
    gr_validfrom?: string | null
    gr_expirydate?: string | null
    gr_active: boolean
    gr_notes?: string | null
    gr_Technician?: Mechanic
    gr_QualificationType?: QualificationType
}

export type TechnicianQualificationInput = {
    technicianId: string
    technicianName: string
    qualificationTypeId: string
    qualificationTypeName: string
    certificateNumber: string
    validFrom: string
    expiryDate: string
    active: boolean
    notes: string
}

export type QualificationStatus = 'valid' | 'future' | 'expired' | 'inactive' | 'type-inactive' | 'missing-type'

export type ServiceProvider = {
    gr_serviceproviderid: string
    gr_name: string
    gr_contactname?: string | null
    gr_phone?: string | null
    gr_email?: string | null
    gr_active: boolean
    statecode?: number
    gr_ProviderType?: { gr_serviceprovidertypeid: string; gr_name: string; gr_code: string; gr_active: boolean }
}

export type WofInspection = {
    gr_wofinspectionid: string
    createdon?: string
    linkedJobId: string | null
    equipmentId: string | null
    gr_name: string
    gr_registrationnumbersnapshot?: string | null
    gr_previouswofexpiry?: string | null
    gr_inspectiondate?: string | null
    gr_newwofexpiry?: string | null
    gr_wofresult?: WofResult | null
    gr_certificatenumber?: string | null
    gr_notes?: string | null
    gr_Job?: Job
    gr_Equipment?: Equipment
    gr_InternalInspector?: Mechanic
    gr_ExternalProvider?: ServiceProvider
}

export type WofWorkflowStatus =
    | 'current'
    | 'due-soon'
    | 'expired'
    | 'unknown'
    | 'job-created'
    | 'scheduled'
    | 'inspection-complete'
    | 'ready-to-issue'
    | 'completed'

export type CreateWofInput = {
    equipment: Equipment
    jobNumber: string
    description: string
    scheduledDate: string
    assignmentMode: WofAssignmentMode
    internalInspectorId?: string
    externalProviderId?: string
}

export type UpdateWofInput = CreateWofInput & {
    inspectionId: string
    jobId: string
    registrationNumberSnapshot: string
    previousWofExpiry: string
    inspectionDate: string
    newWofExpiry: string
    result: WofResult
    certificateNumber: string
    notes: string
    scheduleOptionId?: string
}
