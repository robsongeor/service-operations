import type { JobScheduleOption } from '../../jobs/types/jobSchedule.types'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types.ts'
import type { Equipment } from '../../jobs/types/equipment.types'
import { WOF_RESULTS, type QualificationStatus, type QualificationType, type TechnicianQualification, type TechnicianQualificationInput, type WofInspection, type WofWorkflowStatus } from '../types/wof.types.ts'
import { canBeAssignedJobs } from '../../mechanics/staffDirectory.ts'

export const WOF_DUE_SOON_DAYS = 30
export const WOF_QUALIFICATION_CODE = 'WOF_CERTIFIED'
export const WOF_PROVIDER_TYPE_CODE = 'WOF_INSPECTOR'

export function normalizeWofDateOnly(value?: string | null) {
    if (!value) return ''
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value.trim())
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const display = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
    return display ? `${display[3]}-${display[2]}-${display[1]}` : ''
}

export function wofDatesMatch(left?: string | null, right?: string | null) {
    const leftDate = normalizeWofDateOnly(left)
    return Boolean(leftDate) && leftDate === normalizeWofDateOnly(right)
}

export async function verifyWofExpiryWithRetry(
    readValues: () => Promise<Array<string | null | undefined>>,
    expected: string,
    attempts = 3,
    wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const values = await readValues()
        if (values.length > 0 && values.every((value) => wofDatesMatch(value, expected))) return
        if (attempt < attempts - 1) await wait(100)
    }
    throw new Error('Dataverse did not confirm the new WOF expiry. The Job was not completed.')
}

export function getWofDeletionBlockReason(inspection: WofInspection): string | null {
    if (!inspection.gr_wofinspectionid) {
        return 'This WOF cannot be deleted because its Inspection identifier is missing.'
    }
    if (inspection.linkedJobId || inspection.gr_Job) {
        return 'This WOF has a linked Job and cannot be deleted from the orphan-record cleanup workflow.'
    }
    if (inspection.gr_wofresult != null && inspection.gr_wofresult !== WOF_RESULTS.PLANNED) {
        return 'Only planned WOF records can be deleted. Passed, failed, or cancelled records retain compliance history.'
    }
    if (inspection.gr_inspectiondate || inspection.gr_newwofexpiry || inspection.gr_certificatenumber?.trim()) {
        return 'This WOF contains completed inspection information and cannot be deleted from the normal workflow.'
    }
    return null
}

const localDateOnly = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const todayDateOnly = () => localDateOnly(new Date())

export function getWofDueStatus(required?: boolean | null, expiry?: string | null, today = todayDateOnly(), dueSoonDays = WOF_DUE_SOON_DAYS) {
    if (!required) return 'not-required' as const
    if (!expiry) return 'unknown' as const
    if (expiry < today) return 'expired' as const
    const threshold = new Date(`${today}T12:00:00`)
    threshold.setDate(threshold.getDate() + dueSoonDays)
    return expiry <= localDateOnly(threshold) ? 'due-soon' as const : 'current' as const
}

export function getLatestWofInspection(inspections: WofInspection[], equipmentId: string) {
    return inspections
        .filter((inspection) => inspection.equipmentId?.toLowerCase() === equipmentId.toLowerCase())
        .sort((left, right) => (right.createdon || right.gr_inspectiondate || '').localeCompare(left.createdon || left.gr_inspectiondate || ''))[0]
}

export function getWofWorkflowStatus(
    equipment: Equipment,
    inspection: WofInspection | undefined,
    schedule: JobScheduleOption | undefined,
    dueSoonDays = WOF_DUE_SOON_DAYS,
): WofWorkflowStatus {
    if (!inspection?.gr_Job) return getWofDueStatus(true, equipment.gr_currentwofexpiry, undefined, dueSoonDays) as WofWorkflowStatus
    if (inspection.gr_wofresult === WOF_RESULTS.CANCELLED) {
        return getWofDueStatus(true, equipment.gr_currentwofexpiry, undefined, dueSoonDays) as WofWorkflowStatus
    }

    const administrationComplete = inspection.gr_wofresult === WOF_RESULTS.PASSED
        && Boolean(inspection.gr_inspectiondate)
        && wofDatesMatch(equipment.gr_currentwofexpiry, inspection.gr_newwofexpiry)
    if (administrationComplete) {
        return getWofDueStatus(true, normalizeWofDateOnly(equipment.gr_currentwofexpiry), undefined, dueSoonDays) as WofWorkflowStatus
    }
    if (inspection.gr_Job.gr_status === JOB_STATUSES.COMPLETE) {
        return inspection.gr_wofresult === WOF_RESULTS.PLANNED ? 'inspection-complete' : 'ready-to-issue'
    }
    if (inspection.gr_wofresult != null && inspection.gr_wofresult !== WOF_RESULTS.PLANNED) return 'ready-to-issue'
    if (schedule?.gr_scheduledate) return 'scheduled'
    return 'job-created'
}

export const WOF_WORKFLOW_LABELS: Record<WofWorkflowStatus, string> = {
    current: 'Current',
    'due-soon': 'Due Soon',
    expired: 'Expired',
    unknown: 'Expiry Not Recorded',
    'job-created': 'Job Created',
    scheduled: 'Scheduled',
    'inspection-complete': 'Inspection Complete',
    'ready-to-issue': 'Ready to Issue WOF',
    completed: 'Completed',
}

export function wofNeedsAdministration(status: WofWorkflowStatus) {
    return status === 'inspection-complete' || status === 'ready-to-issue'
}

export function wofCanCreateJob(status: WofWorkflowStatus) {
    return status === 'due-soon' || status === 'expired'
}

export function getWofJobCreationDisposition(hasActiveJob: boolean, hasLinkedInspection: boolean) {
    if (!hasActiveJob) return 'create' as const
    return hasLinkedInspection ? 'existing' as const : 'repair' as const
}

export function formatWofDateOnly(value?: string | null) {
    const normalized = normalizeWofDateOnly(value)
    if (!normalized) return ''
    const [year, month, day] = normalized.split('-')
    return `${day}/${month}/${year}`
}

export function isQualificationValid(qualification: TechnicianQualification, date = todayDateOnly()) {
    return getQualificationStatus(qualification, date) === 'valid'
        && qualification.gr_QualificationType?.gr_code === WOF_QUALIFICATION_CODE
        && Boolean(qualification.gr_Technician && canBeAssignedJobs(qualification.gr_Technician))
}

export function getQualificationStatus(qualification: TechnicianQualification, date = todayDateOnly()): QualificationStatus {
    if (!qualification.gr_active) return 'inactive'
    if (!qualification.gr_QualificationType) return 'missing-type'
    if (!qualification.gr_QualificationType.gr_active) return 'type-inactive'
    if (qualification.gr_validfrom && qualification.gr_validfrom > date) return 'future'
    if (qualification.gr_expirydate && qualification.gr_expirydate < date) return 'expired'
    return 'valid'
}

const periodsOverlap = (startA: string, endA: string, startB: string, endB: string) =>
    (endA || '9999-12-31') >= (startB || '0001-01-01')
    && (endB || '9999-12-31') >= (startA || '0001-01-01')

export function hasOverlappingQualification(input: TechnicianQualificationInput, existing: TechnicianQualification[], excludeId?: string) {
    if (!input.active) return false
    return existing.some((qualification) => qualification.gr_technicianqualificationid !== excludeId
        && qualification.gr_Technician?.gr_mechanicid === input.technicianId
        && qualification.gr_active
        && qualification.gr_QualificationType?.gr_qualificationtypeid === input.qualificationTypeId
        && periodsOverlap(input.validFrom, input.expiryDate, qualification.gr_validfrom || '', qualification.gr_expirydate || ''))
}

export function validateQualificationInput(input: TechnicianQualificationInput, existing: TechnicianQualification[], types: QualificationType[], excludeId?: string) {
    if (!input.technicianId) throw new Error('Save the technician before adding qualifications.')
    if (!input.qualificationTypeId) throw new Error('Select a qualification type.')
    const type = types.find((item) => item.gr_qualificationtypeid === input.qualificationTypeId)
    if (!type?.gr_active) throw new Error('The selected qualification type is no longer active.')
    if (input.validFrom && input.expiryDate && input.expiryDate < input.validFrom) throw new Error('Expiry Date must not be before Valid From.')
    if (hasOverlappingQualification(input, existing, excludeId)) throw new Error('This technician already has an overlapping active qualification of this type.')
}
