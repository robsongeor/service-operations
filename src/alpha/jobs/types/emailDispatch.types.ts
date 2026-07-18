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
