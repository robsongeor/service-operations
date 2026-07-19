export type Equipment = {
    gr_equipmentid: string
    gr_fleet: string | null
    gr_serial: string | null
    gr_make: string | null
    gr_model: string | null
    statecode?: number
    statuscode?: number
    gr_Site?: {
        gr_siteid: string
        gr_name: string
        gr_Customer?: {
            gr_customerid: string
            gr_name: string
        }
    }
}
