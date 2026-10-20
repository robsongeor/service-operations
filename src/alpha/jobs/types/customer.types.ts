export type Customer = {
    gr_customerid: string
    gr_name: string
    gr_accountscontact?: string | null
    gr_accountsphone?: string | null
    gr_accountsemail?: string | null
    gr_purchaseorderrequirements?: string | null
    gr_customernotes?: string | null
}

export type CustomerSaveInput = {
    name: string
    accountsContact?: string
    accountsPhone?: string
    accountsEmail?: string
    purchaseOrderRequirements?: string
    notes?: string
}
