import type { Job } from '../jobs/types/job.types'
import type { JobStatus } from '../jobs/types/jobStatus.types'
import type { EquipmentMapCoordinate } from '../equipment-map/equipmentMap.types'

export type JobMapSite = {
    siteId: string
    siteName: string
    address: string
    customerId: string
    customerName: string
    jobs: Job[]
    statuses: JobStatus[]
    markerTone: 'allocated' | 'unallocated' | 'waiting' | 'mixed'
    coordinate?: EquipmentMapCoordinate | null
}
