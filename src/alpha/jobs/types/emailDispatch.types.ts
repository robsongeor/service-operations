export type EmailDispatchInput = {
    jobId: string
    assignmentId?: string
    recipientEmail: string
    recipientName: string
    subject: string
    body: string
}

export type EmailDispatchResult = {
    gr_emaildispatchid: string
    gr_emailsent: boolean
    gr_completedon?: string | null
    gr_errormessage?: string | null
}

export type JobEmailDispatch = EmailDispatchResult & {
    gr_recipientemail: string
    gr_recipientname: string
    gr_requestedon: string
    _gr_jobassignment_value?: string | null
}
