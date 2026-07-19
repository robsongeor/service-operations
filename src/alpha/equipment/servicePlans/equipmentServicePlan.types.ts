export const SERVICE_TYPES = {
    NONE: 122830000,
    A: 122830001,
    B: 122830002,
    C: 122830003,
} as const

export type ServiceType = typeof SERVICE_TYPES[keyof typeof SERVICE_TYPES]
export type PlannedServiceType = Exclude<ServiceType, typeof SERVICE_TYPES.NONE>

export const SERVICE_TYPE_OPTIONS: { label: string; value: ServiceType }[] = [
    { label: 'None', value: SERVICE_TYPES.NONE },
    { label: 'A Service', value: SERVICE_TYPES.A },
    { label: 'B Service', value: SERVICE_TYPES.B },
    { label: 'C Service', value: SERVICE_TYPES.C },
]

export const SERVICE_INTERVAL_HOURS: Record<PlannedServiceType, number> = {
    [SERVICE_TYPES.A]: 250,
    [SERVICE_TYPES.B]: 1000,
    [SERVICE_TYPES.C]: 2000,
}

export type ServicePlanStatus = 'OK' | 'Due Soon' | 'Due' | 'Overdue'

export type EquipmentServicePlan = {
    gr_equipmentserviceplanid: string
    gr_servicetype: PlannedServiceType
    gr_intervalhours: number
    gr_lastcompleteddate?: string | null
    gr_lastcompletedhours?: number | null
    gr_nextduehours?: number | null
    gr_nextduedate?: string | null
    gr_active: boolean
    _gr_equipment_value?: string | null
    gr_LastCompletedJob?: { gr_jobid: string; gr_jobnumber?: string | null }
}

export type ServicePlanCompletion = {
    jobId: string
    completedDate: string
    hourMeter: number
    serviceType: PlannedServiceType
}
