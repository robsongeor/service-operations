import type { JobType } from './jobType.types'
import type { JobStatus } from './jobStatus.types'
import type { ServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { OfficeAction } from './officeAction.types'

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
    hourMeter?: number
    completedDate?: string
    serviceType: ServiceType
    currentOfficeAction?: OfficeAction
    officeActionOwner?: string
    officeAttentionRequired?: boolean
}
