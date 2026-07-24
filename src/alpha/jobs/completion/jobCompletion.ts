import type { Equipment } from '../types/equipment.types.ts'
import type { Job } from '../types/job.types.ts'
import type { JobSaveInput } from '../types/jobSave.types.ts'
import { JOB_TYPES, jobRequiresMaintenance } from '../types/jobType.types.ts'
import { SERVICE_TYPES, type PlannedServiceType } from '../../equipment/servicePlans/equipmentServicePlan.types.ts'
import { newZealandDateOnly } from '../../shared/dates/dateOnly.ts'

export const LARGE_HOUR_METER_INCREASE = 1000

export type JobCompletionKind = 'standard' | 'service' | 'wof'

export type JobCompletionRequest = {
    kind: JobCompletionKind
    job: Job
    pendingSave?: JobSaveInput
}

export function getJobCompletionKind(jobType: Job['gr_jobtype']): JobCompletionKind {
    if (jobType === JOB_TYPES.WOF) return 'wof'
    return jobRequiresMaintenance(jobType) ? 'service' : 'standard'
}

export function validateWofCompletionExpiry(
    value: string,
    currentExpiry: string | null | undefined,
    completionDate: string,
) {
    if (!value) return 'Enter the new WOF expiry before completing this Job.'
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    const parsed = parts && new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
    if (!parts || !parsed
        || parsed.getUTCFullYear() !== Number(parts[1])
        || parsed.getUTCMonth() !== Number(parts[2]) - 1
        || parsed.getUTCDate() !== Number(parts[3])) {
        return 'Enter a valid new WOF expiry.'
    }
    if (currentExpiry && value < currentExpiry.slice(0, 10)) {
        return 'The new WOF expiry must be later than the current expiry.'
    }
    const localCompletionDate = newZealandDateOnly(completionDate)
    if (!localCompletionDate) return 'The Job completion date is invalid.'
    if (value < localCompletionDate) {
        const [year, month, day] = localCompletionDate.split('-')
        return `The new WOF expiry cannot be before today (${day}/${month}/${year}).`
    }
    return ''
}

export async function runWofCompletion(
    updateExpiry: () => Promise<void>,
    completeJob: () => Promise<void>,
) {
    await updateExpiry()
    await completeJob()
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
