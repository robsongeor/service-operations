import type { JobType } from './jobType.types'
import type { JobStatus } from './jobStatus.types'

export type JobSaveInput = {
    jobNumber: string
    orderNumber: string
    description: string
    jobType: JobType
    status: JobStatus
    equipmentId?: string
    mechanicId?: string
    siteId?: string
    contactId?: string
}
