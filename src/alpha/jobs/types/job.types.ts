import type { JobType } from './jobType.types'
import type { JobStatus } from './jobStatus.types'
import type { JobCardStatus } from './jobCardStatus.types'

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
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet: string
        gr_serial: string
        gr_make: string
        gr_model: string
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
