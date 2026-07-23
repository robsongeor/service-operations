import { WOF_RESULTS, type QualificationStatus, type QualificationType, type TechnicianQualification, type TechnicianQualificationInput, type WofInspection } from '../types/wof.types'

export const WOF_DUE_SOON_DAYS = 30
export const WOF_QUALIFICATION_CODE = 'WOF_CERTIFIED'
export const WOF_PROVIDER_TYPE_CODE = 'WOF_INSPECTOR'

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

export function formatWofDateOnly(value?: string | null) {
    if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return ''
    const [year, month, day] = value.slice(0, 10).split('-')
    return `${day}/${month}/${year}`
}

export function isQualificationValid(qualification: TechnicianQualification, date = todayDateOnly()) {
    return getQualificationStatus(qualification, date) === 'valid'
        && qualification.gr_QualificationType?.gr_code === WOF_QUALIFICATION_CODE
        && qualification.gr_Technician?.statecode !== 1
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
