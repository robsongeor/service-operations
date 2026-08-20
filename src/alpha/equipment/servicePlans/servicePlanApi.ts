import {
    SERVICE_INTERVAL_HOURS,
    type EquipmentServicePlan,
    type PlannedServiceType,
} from './equipmentServicePlan.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Job } from '../../jobs/types/job.types'
import { invalidateSharedEquipmentDataCache } from '../services/equipmentDataCache'
import { calculateNextDueDate, resolveMaintenanceConfiguration } from './maintenanceConfiguration'
import { shouldAdvanceCurrentHourMeter } from './equipmentUsageForecast'
import { cascadeServiceHistoryBaselines, recalculateServicePlanDueDates } from './servicePlanCalculations'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { buildDataverseIdFilterBatches } from '../../shared/dataverse/boundedDataverseFilters.ts'
import { invalidateOperationalQueries } from '../../shared/data/OperationalDataClient.ts'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`
const PLAN_SELECT = 'gr_equipmentserviceplanid,gr_servicetype,gr_intervalhours,gr_lastcompleteddate,gr_lastcompletedhours,gr_nextduehours,gr_nextduedate,gr_active,_gr_equipment_value'

async function ensureSuccess(response: Response, action: string) {
    if (!response.ok) throw new Error(`${action}: ${await response.text() || `${response.status} ${response.statusText}`}`)
}

function invalidateMaintenanceQueries() {
    invalidateOperationalQueries((key) =>
        key[0] === 'customer-dashboard'
        || (key[0] === 'equipment' && key[2] === 'service-plans-v1')
        || key[0] === 'equipment-register'
        || (key[0] === 'equipment' && key[1] === 'operational-list'))
}

export async function fetchEquipmentServicePlans(token: string): Promise<EquipmentServicePlan[]> {
    return fetchAllDataversePages<EquipmentServicePlan>(
        `${API_URL}/gr_equipmentserviceplans?$select=${PLAN_SELECT}&$expand=gr_LastCompletedJob($select=gr_jobid,gr_jobnumber)`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        (response) => ensureSuccess(response, 'Failed to fetch equipment service plans'),
    )
}

export async function fetchEquipmentServicePlansForEquipment(
    token: string,
    equipmentIds: readonly string[],
    signal?: AbortSignal,
): Promise<EquipmentServicePlan[]> {
    const filters = buildDataverseIdFilterBatches('_gr_equipment_value', equipmentIds)
    if (!filters.length) return []
    const rows: EquipmentServicePlan[] = []
    for (const filter of filters) {
        rows.push(...await fetchAllDataversePages<EquipmentServicePlan>(
            `${API_URL}/gr_equipmentserviceplans?$select=${PLAN_SELECT}&$expand=gr_LastCompletedJob($select=gr_jobid,gr_jobnumber)&$filter=${encodeURIComponent(filter)}`,
            { signal, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
            (response) => ensureSuccess(response, 'Failed to fetch Customer Equipment service plans'),
        ))
    }
    return rows
}

export async function refreshEquipmentServicePlanDueDates(
    token: string,
    equipment: Equipment,
    existingPlans: EquipmentServicePlan[],
    jobs: readonly Job[],
) {
    const equipmentId = equipment.gr_equipmentid.toLowerCase()
    const equipmentPlans = existingPlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === equipmentId)
    const recalculated = recalculateServicePlanDueDates(equipment, equipmentPlans, jobs)
    await Promise.all(recalculated.map(async (plan) => {
        const existing = equipmentPlans.find((item) => item.gr_equipmentserviceplanid === plan.gr_equipmentserviceplanid)
        if (existing?.gr_nextduedate === plan.gr_nextduedate) return
        const response = await fetch(`${API_URL}/gr_equipmentserviceplans(${plan.gr_equipmentserviceplanid})`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ gr_nextduedate: plan.gr_nextduedate ?? null }),
        })
        await ensureSuccess(response, 'Failed to update the estimated service due date')
    }))
    const recalculatedById = new Map(recalculated.map((plan) => [plan.gr_equipmentserviceplanid, plan]))
    invalidateMaintenanceQueries()
    return existingPlans.map((plan) => recalculatedById.get(plan.gr_equipmentserviceplanid) ?? plan)
}

export type MaintenanceHistoryPlanInput = {
    serviceType: PlannedServiceType
    lastCompletedDate?: string | null
    lastCompletedHours?: number | null
}

export type MaintenanceHistoryInput = {
    currentHourMeter: number
    readingRecordedDate: string
    plans: MaintenanceHistoryPlanInput[]
}

function calculateHistoryNextDueHours(serviceType: PlannedServiceType, intervalHours: number | null | undefined, lastCompletedHours: number | null | undefined) {
    if (lastCompletedHours == null) return null
    return lastCompletedHours + (intervalHours ?? SERVICE_INTERVAL_HOURS[serviceType])
}

export async function saveEquipmentMaintenanceHistory(
    token: string,
    equipmentId: string,
    equipment: Equipment,
    existingPlans: EquipmentServicePlan[],
    input: MaintenanceHistoryInput,
): Promise<EquipmentServicePlan[]> {
    await updateEquipmentCurrentHourMeter(token, equipmentId, input.currentHourMeter, input.readingRecordedDate)
    const configuration = resolveMaintenanceConfiguration(equipment)
    const effectivePlanInputs = cascadeServiceHistoryBaselines(input.plans, equipment)

    const nextPlans = await Promise.all(effectivePlanInputs.map(async (planInput) => {
        const existingPlan = existingPlans.find((plan) => plan.gr_servicetype === planInput.serviceType)
        const intervalHours = existingPlan?.gr_intervalhours ?? SERVICE_INTERVAL_HOURS[planInput.serviceType]
        const nextDueHours = calculateHistoryNextDueHours(planInput.serviceType, intervalHours, planInput.lastCompletedHours)
        const level = configuration.serviceLevels[planInput.serviceType]
        const nextDueDate = planInput.lastCompletedDate && level
            ? calculateNextDueDate(planInput.lastCompletedDate, level.timeInterval)
            : null
        const payload = {
            gr_servicetype: planInput.serviceType,
            gr_intervalhours: intervalHours,
            gr_lastcompleteddate: planInput.lastCompletedDate || null,
            gr_lastcompletedhours: planInput.lastCompletedHours ?? null,
            gr_nextduehours: nextDueHours,
            gr_nextduedate: nextDueDate,
            gr_active: Boolean(level),
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
            gr_nextduedate: nextDueDate ?? created.gr_nextduedate ?? null,
            gr_active: Boolean(level),
            _gr_equipment_value: equipmentId,
        }
    }))

    invalidateMaintenanceQueries()
    return nextPlans
}

export async function updateEquipmentCurrentHourMeter(
    token: string,
    equipmentId: string,
    hourMeter: number,
    readingRecordedDate: string,
    authoritativeCurrentRecordedDate?: string | null,
) {
    const equipmentUrl = `${API_URL}/gr_equipments(${equipmentId})`

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const currentResponse = await fetch(
            `${equipmentUrl}?$select=gr_currenthourmeter,gr_currenthourmeterrecordeddate`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        )
        await ensureSuccess(currentResponse, 'Failed to verify equipment current hour meter')
        const current = await currentResponse.json() as {
            '@odata.etag'?: string
            gr_currenthourmeter?: number | null
            gr_currenthourmeterrecordeddate?: string | null
        }

        const currentRecordedDate = authoritativeCurrentRecordedDate ?? current.gr_currenthourmeterrecordeddate
        if (!shouldAdvanceCurrentHourMeter(readingRecordedDate, currentRecordedDate)) {
            return
        }
        if (current.gr_currenthourmeter === hourMeter
            && current.gr_currenthourmeterrecordeddate?.slice(0, 10) === readingRecordedDate.slice(0, 10)) {
            return
        }
        const etag = current['@odata.etag']
        if (!etag) throw new Error('Failed to verify equipment current hour meter version. Refresh and retry.')

        const response = await fetch(equipmentUrl, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'If-Match': etag,
            },
            body: JSON.stringify({
                gr_currenthourmeter: hourMeter,
                gr_currenthourmeterrecordeddate: readingRecordedDate,
            }),
        })
        if (response.status === 412 && attempt === 0) continue
        await ensureSuccess(response, 'Failed to update equipment current hour meter')
        invalidateSharedEquipmentDataCache(token)
        invalidateMaintenanceQueries()
        return
    }

    throw new Error('Failed to update equipment current hour meter because the Equipment changed. Refresh and retry.')
}

export async function syncEquipmentServiceProgramme(
    token: string,
    equipment: Equipment,
    existingPlans: EquipmentServicePlan[],
) {
    const configuration = resolveMaintenanceConfiguration(equipment)
    const activeTypes = new Set(configuration.activeServiceTypes)
    const updates = existingPlans.map(async (plan) => {
        const shouldBeActive = activeTypes.has(plan.gr_servicetype)
        if (plan.gr_active === shouldBeActive) return plan
        const response = await fetch(`${API_URL}/gr_equipmentserviceplans(${plan.gr_equipmentserviceplanid})`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ gr_active: shouldBeActive }),
        })
        await ensureSuccess(response, 'Failed to update service-plan applicability')
        return { ...plan, gr_active: shouldBeActive }
    })
    const existingTypes = new Set(existingPlans.map((plan) => plan.gr_servicetype))
    for (const serviceType of configuration.activeServiceTypes.filter((type) => !existingTypes.has(type))) {
        updates.push((async () => {
            const response = await fetch(`${API_URL}/gr_equipmentserviceplans`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify({
                    gr_servicetype: serviceType,
                    gr_intervalhours: SERVICE_INTERVAL_HOURS[serviceType],
                    gr_active: true,
                    'gr_Equipment@odata.bind': `/gr_equipments(${equipment.gr_equipmentid})`,
                }),
            })
            await ensureSuccess(response, 'Failed to create an active service plan')
            const created = await response.json()
            return {
                gr_equipmentserviceplanid: created.gr_equipmentserviceplanid,
                gr_servicetype: serviceType,
                gr_intervalhours: SERVICE_INTERVAL_HOURS[serviceType],
                gr_active: true,
                _gr_equipment_value: equipment.gr_equipmentid,
            }
        })())
    }
    const plans = await Promise.all(updates)
    invalidateMaintenanceQueries()
    return plans
}
