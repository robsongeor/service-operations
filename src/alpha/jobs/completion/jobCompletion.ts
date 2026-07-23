import type { Equipment } from '../types/equipment.types'
import type { Job } from '../types/job.types'
import type { JobSaveInput } from '../types/jobSave.types'
import { jobRequiresMaintenance } from '../types/jobType.types'
import { SERVICE_TYPES, type PlannedServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types'

export const LARGE_HOUR_METER_INCREASE = 1000

export type JobCompletionKind = 'standard' | 'service'

export type JobCompletionRequest = {
    kind: JobCompletionKind
    job: Job
    pendingSave?: JobSaveInput
}

export function getJobCompletionKind(jobType: Job['gr_jobtype']): JobCompletionKind {
    return jobRequiresMaintenance(jobType) ? 'service' : 'standard'
}

export function validateServiceCompletionContext(job: Job, pendingSave?: JobSaveInput) {
    const equipmentId = pendingSave?.equipmentId ?? job.gr_Equipment?.gr_equipmentid
    const serviceType = pendingSave?.serviceType ?? job.gr_servicetype
    if (!equipmentId) return 'Select equipment before completing a service job.'
    if (!serviceType || serviceType === SERVICE_TYPES.NONE) return 'Select a service type before completing a service job.'
    return ''
}

export function validateCompletionHourMeter(value: string, currentHourMeter: number) {
    if (!value.trim()) return 'Hour meter is required.'
    if (!/^\d+$/.test(value.trim())) return 'Hour meter must be a whole number.'
    const reading = Number(value)
    if (!Number.isSafeInteger(reading) || reading < 0) return 'Hour meter must be a non-negative whole number.'
    if (reading < currentHourMeter) return 'Hour meter cannot be lower than the current equipment hour meter.'
    return ''
}

export function isLargeHourMeterIncrease(reading: number, currentHourMeter: number) {
    return reading - currentHourMeter >= LARGE_HOUR_METER_INCREASE
}

export function resolveCompletionEquipment(
    request: JobCompletionRequest,
    equipment: Equipment[],
) {
    const equipmentId = request.pendingSave?.equipmentId ?? request.job.gr_Equipment?.gr_equipmentid
    return equipment.find((item) => item.gr_equipmentid === equipmentId)
}

export function resolveCompletionServiceType(request: JobCompletionRequest): PlannedServiceType | null {
    const serviceType = request.pendingSave?.serviceType ?? request.job.gr_servicetype
    return serviceType && serviceType !== SERVICE_TYPES.NONE ? serviceType : null
}
