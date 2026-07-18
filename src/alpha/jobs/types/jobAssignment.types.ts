import type { JobCardStatus } from './jobCardStatus.types'
import type { Mechanic } from './mechanic.types'

export type JobAssignment = {
    gr_jobassignmentid: string
    gr_name: string
    gr_workinstructions?: string | null
    gr_assignedon?: string | null
    gr_jobcardstatus?: JobCardStatus | null
    gr_emailsenton?: string | null
    gr_submittedon?: string | null
    gr_closedon?: string | null
    _gr_job_value?: string
    gr_Mechanic?: Mechanic
}

export type JobAssignmentInput = {
    jobId: string
    mechanicId: string
    mechanicName: string
    instructions?: string
}
