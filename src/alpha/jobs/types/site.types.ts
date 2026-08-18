import type { MaintenanceProfile } from '../../equipment/servicePlans/maintenanceConfiguration'

export type Site = {
    gr_siteid: string
    gr_name: string
    gr_address: string
    gr_geocodelatitude?: number | null
    gr_geocodelongitude?: number | null
    gr_geocodesourceaddress?: string | null
    gr_geocodeformattedaddress?: string | null
    gr_geocoderesolvedon?: string | null
    gr_defaultmaintenanceprofile?: MaintenanceProfile | null
    gr_inductionrequired?: boolean | null
    gr_inductionrequirements?: string | null
    gr_Customer?: {
        gr_customerid: string
        gr_name: string
    }
}

export type SiteInductionDocument = {
    id: string
    fileName: string
    contentType: string
    size: number
    createdOn: string
    subject: string
}

export type SiteUpdateInput = {
    name: string
    address: string
    defaultMaintenanceProfile?: MaintenanceProfile | null
    inductionRequired?: boolean | null
    inductionRequirements?: string | null
}
