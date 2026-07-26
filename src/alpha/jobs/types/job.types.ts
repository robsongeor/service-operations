import type { JobType } from './jobType.types'
import type { JobStatus } from './jobStatus.types'
import type { JobCardStatus } from './jobCardStatus.types'
import type { ServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { OfficeAction } from './officeAction.types'

export type Job = {
    gr_jobid: string
    createdon: string
    gr_jobnumber: string | null
    gr_status: JobStatus
    gr_ordernumber: string | null
    gr_description: string | null
    gr_jobtype?: JobType
    gr_jobcardstatus?: JobCardStatus | null
    gr_jobcardsenton?: string | null
    gr_jobcardsubmittedon?: string | null
    gr_jobcardclosedon?: string | null
    gr_techniciansubmissiontokenhash?: string | null
    gr_techniciansubmissiontokencreatedon?: string | null
    gr_techniciansubmissiontokenexpireson?: string | null
    gr_techniciansubmissiontokenused?: boolean | null
    gr_techniciansubmissionsubmittedon?: string | null
    gr_techniciansubmissionhourmeter?: number | null
    gr_techniciansubmissionstory?: string | null
    gr_techniciansubmissionfurtherworkrequired?: boolean | null
    gr_techniciansubmissionfurtherworkdetails?: string | null
    gr_techniciansubmissionsafetyissueidentified?: boolean | null
    gr_techniciansubmissionsafetyissuedetails?: string | null
    technicianSubmissionTimeEntries?: {
        id: string
        date: string
        hours: number
        kilometres: number
    }[]
    technicianSubmissionParts?: {
        id: string
        part: string
    }[]
    jobPhotos?: {
        id: string
        fileName: string
        uploadedOn: string
        displayOrder: number
        previewUrl: string
    }[]
    gr_hourmeter?: number | null
    gr_completeddate?: string | null
    _gr_sitecheck_value?: string | null
    gr_servicetype?: ServiceType | null
    gr_currentofficeaction?: OfficeAction | null
    gr_officeactionowner?: string | null
    gr_officeattentionrequired?: boolean | null
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet: string | null
        gr_serial: string | null
        gr_make: string | null
        gr_model: string | null
    }
    gr_Mechanic?: {
        gr_mechanicid: string
        gr_name: string
        gr_phone: string
        gr_email: string
    }
    gr_Site?: {
        gr_siteid: string
        gr_name: string
        gr_address: string
        gr_Customer?: {
            gr_customerid: string
            gr_name: string
        }
    }
    gr_Contact?: {
        gr_contactid: string
        gr_name: string
        gr_phone?: string
        gr_email?: string
    }
}
