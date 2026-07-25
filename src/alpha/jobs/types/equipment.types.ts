import type { EquipmentComplianceStatus } from '../../equipment/compliance/equipmentCompliance'
import type { MaintenanceProfile, PowerType, ServiceProgramme } from '../../equipment/servicePlans/maintenanceConfiguration'

export type Equipment = {
    gr_equipmentid: string
    gr_fleet: string | null
    gr_serial: string | null
    gr_make: string | null
    gr_model: string | null
    statecode?: number
    statuscode?: number
    gr_currenthourmeter?: number | null
    gr_currenthourmeterrecordeddate?: string | null
    gr_servicetrackingenabled?: boolean | null
    gr_registrationnumber?: string | null
    gr_compliancestatus?: EquipmentComplianceStatus | null
    gr_wofrequired?: boolean | null
    gr_currentwofexpiry?: string | null
    gr_lastwofcompleted?: string | null
    gr_regoexpiry?: string | null
    gr_powertype?: PowerType | null
    gr_serviceprogramme?: ServiceProgramme | null
    gr_maintenanceprofile?: MaintenanceProfile | null
    gr_customaenabled?: boolean | null
    gr_custombenabled?: boolean | null
    gr_customcenabled?: boolean | null
    gr_customaintervaldays?: number | null
    gr_custombintervaldays?: number | null
    gr_customcintervaldays?: number | null
    gr_Site?: {
        gr_siteid: string
        gr_name: string
        gr_address?: string
        gr_Customer?: {
            gr_customerid: string
            gr_name: string
        }
    }
}
