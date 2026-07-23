import {
    SERVICE_INTERVAL_HOURS,
    type EquipmentServicePlan,
    type PlannedServiceType,
} from './equipmentServicePlan.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`
const PLAN_SELECT = 'gr_equipmentserviceplanid,gr_servicetype,gr_intervalhours,gr_lastcompleteddate,gr_lastcompletedhours,gr_nextduehours,gr_nextduedate,gr_active,_gr_equipment_value'

async function ensureSuccess(response: Response, action: string) {
    if (!response.ok) throw new Error(`${action}: ${await response.text() || `${response.status} ${response.statusText}`}`)
}

export async function fetchEquipmentServicePlans(token: string): Promise<EquipmentServicePlan[]> {
    const response = await fetch(`${API_URL}/gr_equipmentserviceplans?$select=${PLAN_SELECT}&$expand=gr_LastCompletedJob($select=gr_jobid,gr_jobnumber)`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    await ensureSuccess(response, 'Failed to fetch equipment service plans')
    return (await response.json()).value ?? []
}

export type MaintenanceHistoryPlanInput = {
    serviceType: PlannedServiceType
    lastCompletedDate?: string | null
    lastCompletedHours?: number | null
}

export type MaintenanceHistoryInput = {
    currentHourMeter: number
    plans: MaintenanceHistoryPlanInput[]
}

function calculateHistoryNextDueHours(serviceType: PlannedServiceType, intervalHours: number | null | undefined, lastCompletedHours: number | null | undefined) {
    if (lastCompletedHours == null) return null
    return lastCompletedHours + (intervalHours ?? SERVICE_INTERVAL_HOURS[serviceType])
}

export async function saveEquipmentMaintenanceHistory(
    token: string,
    equipmentId: string,
    existingPlans: EquipmentServicePlan[],
    input: MaintenanceHistoryInput,
): Promise<EquipmentServicePlan[]> {
    await updateEquipmentCurrentHourMeter(token, equipmentId, input.currentHourMeter)

    const nextPlans = await Promise.all(input.plans.map(async (planInput) => {
        const existingPlan = existingPlans.find((plan) => plan.gr_servicetype === planInput.serviceType)
        const intervalHours = existingPlan?.gr_intervalhours ?? SERVICE_INTERVAL_HOURS[planInput.serviceType]
        const nextDueHours = calculateHistoryNextDueHours(planInput.serviceType, intervalHours, planInput.lastCompletedHours)
        const payload = {
            gr_servicetype: planInput.serviceType,
            gr_intervalhours: intervalHours,
            gr_lastcompleteddate: planInput.lastCompletedDate || null,
            gr_lastcompletedhours: planInput.lastCompletedHours ?? null,
            gr_nextduehours: nextDueHours,
            gr_active: true,
        }

        if (existingPlan) {
            const response = await fetch(`${API_URL}/gr_equipmentserviceplans(${existingPlan.gr_equipmentserviceplanid})`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })
            await ensureSuccess(response, 'Failed to update equipment service plan')
            return {
                ...existingPlan,
                ...payload,
                _gr_equipment_value: equipmentId,
                gr_LastCompletedJob: undefined,
            }
        }

        const response = await fetch(`${API_URL}/gr_equipmentserviceplans`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify({
                ...payload,
                'gr_Equipment@odata.bind': `/gr_equipments(${equipmentId})`,
            }),
        })
        await ensureSuccess(response, 'Failed to create equipment service plan')
        const created = await response.json()
        return {
            gr_equipmentserviceplanid: created.gr_equipmentserviceplanid,
            gr_servicetype: planInput.serviceType,
            gr_intervalhours: intervalHours,
            gr_lastcompleteddate: planInput.lastCompletedDate || null,
            gr_lastcompletedhours: planInput.lastCompletedHours ?? null,
            gr_nextduehours: nextDueHours,
            gr_nextduedate: created.gr_nextduedate ?? null,
            gr_active: true,
            _gr_equipment_value: equipmentId,
        }
    }))

    return nextPlans
}

export async function updateEquipmentCurrentHourMeter(token: string, equipmentId: string, hourMeter: number) {
    const response = await fetch(`${API_URL}/gr_equipments(${equipmentId})`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ gr_currenthourmeter: hourMeter }),
    })
    await ensureSuccess(response, 'Failed to update equipment current hour meter')
}
