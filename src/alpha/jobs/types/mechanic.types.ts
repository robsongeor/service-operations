export type Mechanic = {
    gr_mechanicid: string
    gr_name: string
    gr_email: string
    gr_phone: string
    gr_camnumber?: string | null
    gr_rego?: string | null
    gr_region?: string | null
    gr_department?: number | null
    gr_jobassignmentenabled?: boolean | null
    gr_customeremailccenabled?: boolean | null
    statecode?: number
}
