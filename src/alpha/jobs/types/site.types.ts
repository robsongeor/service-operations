import type { MaintenanceProfile } from '../../equipment/servicePlans/maintenanceConfiguration'

export type Site = {
    gr_siteid: string
    gr_name: string
    gr_address: string
    gr_defaultmaintenanceprofile?: MaintenanceProfile | null
    gr_Customer?: {
        gr_customerid: string
        gr_name: string
    }
}

export type SiteUpdateInput = {
    name: string
    address: string
    defaultMaintenanceProfile?: MaintenanceProfile | null
}
