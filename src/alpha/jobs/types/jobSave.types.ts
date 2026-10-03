import type { JobType } from './jobType.types'
import type { JobStatus } from './jobStatus.types'
import type { ServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types'
import type { OfficeAction } from './officeAction.types'
import type { HourMeterReadingType } from '../../equipment/hourMeter/hourMeterReading.types'

export type JobSaveInput = {
    jobNumber: string
    orderNumber: string
    description: string
    jobType: JobType
    status: JobStatus
    equipmentId?: string
    /** Creation drawer has explicitly managed the asset location; never move it again on Job save. */
    equipmentLocationHandled?: boolean
    mechanicId?: string
    siteId?: string
    /** Consistency check for corrections; the Job's Customer is stored through its Site. */
    customerId?: string
    contactId?: string
    hourMeter?: number
    hourMeterReadingType?: HourMeterReadingType
    hourMeterRecordedDate?: string
    completedDate?: string
    serviceType: ServiceType
    currentOfficeAction?: OfficeAction
    officeActionOwner?: string
    officeAttentionRequired?: boolean
}
