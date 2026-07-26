import type { JobStatus } from '../../jobs/types/jobStatus.types.ts'
import type { EquipmentSiteCheckAvailability } from '../../equipment/types/equipmentSiteCheckAvailability.types.ts'

export const SITE_CHECK_FREQUENCIES = {
    WEEKLY: 122830000,
    FORTNIGHTLY: 122830001,
    MONTHLY: 122830002,
} as const

export type SiteCheckFrequency =
    typeof SITE_CHECK_FREQUENCIES[keyof typeof SITE_CHECK_FREQUENCIES]

export const SITE_CHECK_EQUIPMENT_SCOPES = {
    ALL_EQUIPMENT: 122830000,
    LIFTRUCKS_RENTALS_ONLY: 122830001,
    MANUAL_SELECTION: 122830002,
} as const

export type SiteCheckEquipmentScope =
    typeof SITE_CHECK_EQUIPMENT_SCOPES[keyof typeof SITE_CHECK_EQUIPMENT_SCOPES]

export const SITE_CHECK_EQUIPMENT_SCOPE_OPTIONS: Array<{
    label: string
    value: SiteCheckEquipmentScope
}> = [
    { label: 'All equipment', value: SITE_CHECK_EQUIPMENT_SCOPES.ALL_EQUIPMENT },
    { label: 'Liftrucks rentals only', value: SITE_CHECK_EQUIPMENT_SCOPES.LIFTRUCKS_RENTALS_ONLY },
    { label: 'Manual selection', value: SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION },
]

export function resolveSiteCheckEquipmentScope(
    value?: SiteCheckEquipmentScope | null,
): SiteCheckEquipmentScope {
    return value === SITE_CHECK_EQUIPMENT_SCOPES.LIFTRUCKS_RENTALS_ONLY
        || value === SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION
        ? value
        : SITE_CHECK_EQUIPMENT_SCOPES.ALL_EQUIPMENT
}

export const SITE_CHECK_FREQUENCY_OPTIONS: {
    label: string
    value: SiteCheckFrequency
}[] = [
    { label: 'Weekly', value: SITE_CHECK_FREQUENCIES.WEEKLY },
    { label: 'Fortnightly', value: SITE_CHECK_FREQUENCIES.FORTNIGHTLY },
    { label: 'Monthly', value: SITE_CHECK_FREQUENCIES.MONTHLY },
]

export const SITE_CHECK_STATUSES = {
    IN_PROGRESS: 122830000,
    COMPLETE: 122830001,
} as const

export type SiteCheckStatus =
    typeof SITE_CHECK_STATUSES[keyof typeof SITE_CHECK_STATUSES]

export type SiteCheckScheduleState =
    | 'disabled'
    | 'invalid'
    | 'in-progress'
    | 'overdue'
    | 'due'
    | 'up-to-date'

export type SiteCheckSchedule = {
    gr_sitecheckscheduleid: string
    gr_name: string
    gr_enabled: boolean
    gr_frequency?: SiteCheckFrequency | null
    gr_equipmentscope?: SiteCheckEquipmentScope | null
    gr_nextduedate?: string | null
    gr_lastcompleteddate?: string | null
    _gr_site_value: string
    _gr_activesitecheck_value?: string | null
    _gr_checklisttemplate_value?: string | null
    '@odata.etag'?: string
}

export type SiteCheck = {
    gr_sitecheckid: string
    gr_name: string
    gr_status: SiteCheckStatus
    gr_startedon: string
    gr_completedon?: string | null
    gr_frequencysnapshot: SiteCheckFrequency
    gr_duedatesnapshot: string
    gr_expectedjobcount: number
    gr_creationrequestkey: string
    _gr_sitecheckschedule_value: string
    _gr_site_value: string
    _gr_assignedtechnician_value: string
    '@odata.etag'?: string
}

export type SiteCheckScheduleEquipment = {
    gr_sitecheckscheduleequipmentid: string
    gr_name: string
    _gr_sitecheckschedule_value: string
    _gr_equipment_value: string
    '@odata.etag'?: string
}

export type SiteCheckJobProgressInput = {
    gr_jobid?: string
    gr_status: JobStatus
    _gr_sitecheck_value?: string
}

export type SiteCheckProgress = {
    total: number
    completed: number
    remaining: number
    expected: number
    hasIntegrityMismatch: boolean
    isComplete: boolean
}

export type SiteCheckScheduleValidation = {
    valid: boolean
    errors: string[]
}

export type SiteCheckScheduleSaveInput = {
    siteId: string
    siteName: string
    enabled: boolean
    frequency?: SiteCheckFrequency | null
    equipmentScope?: SiteCheckEquipmentScope | null
    selectedEquipmentIds?: string[]
    nextDueDate?: string | null
}

export type SiteCheckStartValidation = {
    valid: boolean
    errors: string[]
}

export type SiteCheckCreationConflict = 'replay' | 'active-check-conflict'

export type SiteCheckDetailJob = Required<SiteCheckJobProgressInput> & {
    gr_jobnumber?: string | null
    gr_description?: string | null
    gr_completeddate?: string | null
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet?: string | null
        gr_serial?: string | null
        gr_make?: string | null
        gr_model?: string | null
    } | null
    gr_Mechanic?: {
        gr_mechanicid: string
        gr_name: string
    } | null
    '@odata.etag'?: string
}

export type SiteCheckPage<T> = {
    records: T[]
    nextLink?: string
}

export type SiteCheckEquipmentExclusion = {
    gr_sitecheckequipmentexclusionid: string
    gr_name: string
    gr_availabilitysnapshot: EquipmentSiteCheckAvailability
    _gr_sitecheck_value: string
    _gr_equipment_value: string
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet?: string | null
        gr_serial?: string | null
        gr_make?: string | null
        gr_model?: string | null
    } | null
    '@odata.etag'?: string
}
