import type { JobType } from './jobType.types'

export type Job = {
    gr_jobid: string
    createdon: string
    gr_jobnumber: string
    gr_status: number
    gr_ordernumber: string
    gr_description: string
    gr_jobtype?: JobType
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
