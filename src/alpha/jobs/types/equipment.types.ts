export type Equipment = {
    gr_equipmentid: string
    gr_fleet: string
    gr_serial: string
    gr_make: string
    gr_model: string
    gr_Site?: {
        gr_siteid: string
        gr_name: string
        gr_Customer?: {
            gr_customerid: string
            gr_name: string
        }
    }
}
