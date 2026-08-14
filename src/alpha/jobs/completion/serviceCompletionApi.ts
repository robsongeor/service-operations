import { calculateNextDueHours, selectSatisfiedServicePlans } from '../../equipment/servicePlans/servicePlanCalculations'
import {
    SERVICE_TYPES,
    type PlannedServiceType,
} from '../../equipment/servicePlans/equipmentServicePlan.types'
import { buildJobUpdateFields } from '../services/jobsApi'
import type { JobSaveInput } from '../types/jobSave.types'
import { JOB_STATUSES } from '../types/jobStatus.types'
import { JOB_TYPES } from '../types/jobType.types'
import { isHistoricalHourMeterReading, validateCompletionHourMeter, validateHourMeterRecordedDate, validateJobCompletionDate } from './jobCompletion'
import { calculateNextDueDate, isServiceTypeEnabled, resolveMaintenanceConfiguration } from '../../equipment/servicePlans/maintenanceConfiguration'
import type { MaintenanceProfile, ServiceProgramme } from '../../equipment/servicePlans/maintenanceConfiguration'
import { HOUR_METER_CLASSIFICATION_ENABLED, type HourMeterReadingType } from '../../equipment/hourMeter/hourMeterReading.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`

type DataverseRecord = {
    '@odata.etag': string
}

type CompletionJob = DataverseRecord & {
    gr_jobid: string
    gr_jobtype: number
    gr_status: number
    gr_servicetype?: number | null
    gr_hourmeter?: number | null
    gr_completeddate?: string | null
    gr_hourmeterrecordeddate?: string | null
    _gr_equipment_value?: string | null
}

type CompletionEquipment = DataverseRecord & {
    gr_equipmentid: string
    gr_currenthourmeter?: number | null
    gr_currenthourmeterrecordeddate?: string | null
    gr_serviceprogramme?: ServiceProgramme | null
    gr_maintenanceprofile?: MaintenanceProfile | null
    gr_customaenabled?: boolean | null
    gr_custombenabled?: boolean | null
    gr_customcenabled?: boolean | null
    gr_customaintervaldays?: number | null
    gr_custombintervaldays?: number | null
    gr_customcintervaldays?: number | null
}

type CompletionPlan = DataverseRecord & {
    gr_equipmentserviceplanid: string
    gr_servicetype: PlannedServiceType
    gr_lastcompleteddate?: string | null
    gr_lastcompletedhours?: number | null
    gr_nextduehours?: number | null
    _gr_equipment_value?: string | null
    _gr_lastcompletedjob_value?: string | null
}

export type AtomicServiceCompletionInput = {
    jobId: string
    equipmentId: string
    hourMeter: number
    hourMeterReadingType?: HourMeterReadingType
    hourMeterRecordedDate: string
    currentHourMeterRecordedDateHint?: string | null
    currentHourMeterHint?: number | null
    completedDate: string
    expectedServiceType: PlannedServiceType
    pendingSave?: JobSaveInput
}

export type AtomicServiceCompletionResult = {
    completedDate: string
    alreadyCompleted: boolean
}

type CompletionContext = {
    job: CompletionJob
    equipment: CompletionEquipment
    plans: CompletionPlan[]
}

type ChangeRequest = {
    entityPath: string
    etag: string
    fields: Record<string, string | number | boolean | null>
}

function recordId(value: string, label: string) {
    const normalized = value.trim().replace(/[{}]/g, '').toLowerCase()
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(normalized)) {
        throw new Error(`${label} is invalid. Refresh the page and try again.`)
    }
    return normalized
}

function requireEtag(record: DataverseRecord, label: string) {
    if (!record['@odata.etag']) {
        throw new Error(`${label} does not include a concurrency version. Refresh and try again.`)
    }
    return record['@odata.etag']
}

function sameId(first?: string | null, second?: string | null) {
    return Boolean(first && second && first.toLowerCase() === second.toLowerCase())
}

async function dataverseJson<T>(token: string, path: string, action: string): Promise<T> {
    const response = await fetch(`${API_URL}/${path}`, {
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
        },
    })
    if (!response.ok) {
        throw new Error(`${action} Refresh the page and try again.`)
    }
    return response.json() as Promise<T>
}

async function loadCompletionContext(
    token: string,
    jobId: string,
    expectedEquipmentId: string,
): Promise<CompletionContext> {
    const job = await dataverseJson<CompletionJob>(
        token,
        `gr_jobs(${jobId})?$select=gr_jobid,gr_jobtype,gr_status,gr_servicetype,gr_hourmeter,gr_completeddate${HOUR_METER_CLASSIFICATION_ENABLED ? ',gr_hourmeterrecordeddate' : ''},_gr_equipment_value`,
        'The authoritative Service Job could not be loaded.',
    )
    if (!sameId(job._gr_equipment_value, expectedEquipmentId)) {
        throw new Error('The Job Equipment changed. Refresh the Job before completing it.')
    }

    const planFilter = encodeURIComponent(`_gr_equipment_value eq ${expectedEquipmentId}`)
    const [equipment, plansResponse] = await Promise.all([
        dataverseJson<CompletionEquipment>(
            token,
            `gr_equipments(${expectedEquipmentId})?$select=gr_equipmentid,gr_currenthourmeter,gr_currenthourmeterrecordeddate,gr_serviceprogramme,gr_maintenanceprofile,gr_customaenabled,gr_custombenabled,gr_customcenabled,gr_customaintervaldays,gr_custombintervaldays,gr_customcintervaldays`,
            'The authoritative Equipment record could not be loaded.',
        ),
        dataverseJson<{ value?: CompletionPlan[] }>(
            token,
            `gr_equipmentserviceplans?$select=gr_equipmentserviceplanid,gr_servicetype,gr_lastcompleteddate,gr_lastcompletedhours,gr_nextduehours,_gr_equipment_value,_gr_lastcompletedjob_value&$filter=${planFilter}`,
            'The authoritative service plans could not be loaded.',
        ),
    ])

    return { job, equipment, plans: plansResponse.value ?? [] }
}

function validateContext(context: CompletionContext, input: AtomicServiceCompletionInput) {
    if (context.job.gr_jobtype !== JOB_TYPES.SERVICE) {
        throw new Error('Only an authoritative Service Job can use Service completion.')
    }
    if (context.job.gr_status === JOB_STATUSES.COMPLETE) return
    const completionDateError = validateJobCompletionDate(input.completedDate.slice(0, 10))
    if (completionDateError) throw new Error(completionDateError)
    if (context.job.gr_servicetype == null || context.job.gr_servicetype === SERVICE_TYPES.NONE) {
        throw new Error('Select and save a Service Type before completing this Service Job.')
    }
    if (context.job.gr_servicetype !== input.expectedServiceType) {
        throw new Error('The Service Type changed. Save or refresh the Job before completing it.')
    }
    if (!isServiceTypeEnabled(context.equipment, input.expectedServiceType)) {
        const historicalPlan = context.plans.find((plan) => plan.gr_servicetype === input.expectedServiceType)
        if (!historicalPlan) throw new Error('This Service Type is not active for the Equipment programme.')
    }
    if (input.pendingSave) {
        if (input.pendingSave.jobType !== JOB_TYPES.SERVICE) {
            throw new Error('The Job Type changed. Save or refresh the Job before completing it.')
        }
        if (!sameId(input.pendingSave.equipmentId, input.equipmentId)) {
            throw new Error('Save the Equipment change before completing this Service Job.')
        }
        if (input.pendingSave.serviceType !== context.job.gr_servicetype) {
            throw new Error('Save the Service Type change before completing this Service Job.')
        }
    }
    const currentRecordedDate = input.currentHourMeterRecordedDateHint
        ?? context.equipment.gr_currenthourmeterrecordeddate?.slice(0, 10)
    const meterError = validateHourMeterRecordedDate(input.hourMeterRecordedDate) || validateCompletionHourMeter(
        String(input.hourMeter),
        input.currentHourMeterHint ?? context.equipment.gr_currenthourmeter ?? 0,
        input.hourMeterRecordedDate,
        currentRecordedDate,
    )
    if (meterError) throw new Error(meterError)
}

function completionAlreadyCommitted(context: CompletionContext, input: AtomicServiceCompletionInput) {
    if (context.job.gr_status !== JOB_STATUSES.COMPLETE) return false
    if (context.job.gr_hourmeter !== input.hourMeter || !context.job.gr_completeddate) return false
    if (HOUR_METER_CLASSIFICATION_ENABLED && context.job.gr_hourmeterrecordeddate !== input.hourMeterRecordedDate) return false
    if (context.job.gr_servicetype !== input.expectedServiceType) return false
    if (!sameId(context.job._gr_equipment_value, input.equipmentId)) return false
    const currentRecordedDate = input.currentHourMeterRecordedDateHint
        ?? context.equipment.gr_currenthourmeterrecordeddate?.slice(0, 10)
    if (!isHistoricalHourMeterReading(input.hourMeterRecordedDate, currentRecordedDate)
        && (input.currentHourMeterHint ?? context.equipment.gr_currenthourmeter ?? 0) < input.hourMeter) return false

    const requiredPlans = selectSatisfiedServicePlans(context.plans, input.expectedServiceType, context.equipment)
    return requiredPlans.every((plan) => (plan.gr_lastcompleteddate
        && plan.gr_lastcompleteddate.slice(0, 10) > input.hourMeterRecordedDate) || (
            sameId(plan._gr_lastcompletedjob_value, input.jobId)
            && plan.gr_lastcompletedhours === input.hourMeter
            && plan.gr_nextduehours === calculateNextDueHours(plan.gr_servicetype, input.hourMeter)
        ))
}

function buildChangeSet(requests: ChangeRequest[]) {
    const batchBoundary = `batch_${crypto.randomUUID()}`
    const changeBoundary = `changeset_${crypto.randomUUID()}`
    const lines = [
        `--${batchBoundary}`,
        `Content-Type: multipart/mixed; boundary=${changeBoundary}`,
        '',
    ]

    requests.forEach((request, index) => {
        lines.push(
            `--${changeBoundary}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${index + 1}`,
            '',
            `PATCH /api/data/v9.2/${request.entityPath} HTTP/1.1`,
            'Accept: application/json',
            'Content-Type: application/json; type=entry',
            `If-Match: ${request.etag}`,
            '',
            JSON.stringify(request.fields),
            '',
        )
    })

    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')
    return {
        body: lines.join('\r\n'),
        contentType: `multipart/mixed; boundary=${batchBoundary}`,
    }
}

function batchFailureStatus(body: string) {
    const statuses = [...body.matchAll(/HTTP\/1\.1\s+(\d{3})/g)].map((match) => Number(match[1]))
    return statuses.find((status) => status >= 400)
}

async function executeAtomicChanges(token: string, requests: ChangeRequest[]) {
    const batch = buildChangeSet(requests)
    const response = await fetch(`${API_URL}/$batch`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': batch.contentType,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'If-None-Match': 'null',
        },
        body: batch.body,
    })
    const responseBody = await response.text()
    const nestedFailure = batchFailureStatus(responseBody)
    if (!response.ok || nestedFailure) {
        if (response.status === 412 || nestedFailure === 412) {
            throw new Error('The Job, Equipment, or service plans changed while completion was being saved.')
        }
        throw new Error('Dataverse rejected the atomic Service completion transaction.')
    }
    if (!/HTTP\/1\.1\s+2\d{2}/.test(responseBody)) {
        throw new Error('Dataverse did not confirm the Service completion transaction.')
    }
}

function completionRequests(
    context: CompletionContext,
    input: AtomicServiceCompletionInput,
    completedDate: string,
): ChangeRequest[] {
    const jobFields = input.pendingSave
        ? buildJobUpdateFields({
            ...input.pendingSave,
            status: JOB_STATUSES.COMPLETE,
            hourMeter: input.hourMeter,
            hourMeterReadingType: input.hourMeterReadingType,
            hourMeterRecordedDate: input.hourMeterRecordedDate,
            completedDate,
        })
        : {
            gr_status: JOB_STATUSES.COMPLETE,
            gr_hourmeter: input.hourMeter,
            gr_completeddate: completedDate,
            ...(HOUR_METER_CLASSIFICATION_ENABLED && input.hourMeterReadingType != null
                ? { gr_hourmeterreadingtype: input.hourMeterReadingType }
                : {}),
            ...(HOUR_METER_CLASSIFICATION_ENABLED
                ? { gr_hourmeterrecordeddate: input.hourMeterRecordedDate }
                : {}),
        }

    const currentRecordedDate = input.currentHourMeterRecordedDateHint
        ?? context.equipment.gr_currenthourmeterrecordeddate?.slice(0, 10)
    const equipmentFields: Record<string, string | number | boolean | null> = isHistoricalHourMeterReading(
        input.hourMeterRecordedDate,
        currentRecordedDate,
    ) ? {} : {
        gr_currenthourmeter: input.hourMeter,
        gr_currenthourmeterrecordeddate: input.hourMeterRecordedDate,
    }
    if (input.pendingSave?.siteId) {
        equipmentFields['gr_Site@odata.bind'] = `/gr_sites(${recordId(input.pendingSave.siteId, 'Site identifier')})`
    }

    const requests: ChangeRequest[] = [{
        entityPath: `gr_jobs(${input.jobId})`,
        etag: requireEtag(context.job, 'The Job'),
        fields: jobFields,
    }]
    if (Object.keys(equipmentFields).length) requests.push({
            entityPath: `gr_equipments(${input.equipmentId})`,
            etag: requireEtag(context.equipment, 'The Equipment'),
            fields: equipmentFields,
        })

    const configuration = resolveMaintenanceConfiguration(context.equipment)
    const requiredPlans = selectSatisfiedServicePlans(context.plans, input.expectedServiceType, context.equipment)
    requiredPlans.filter((plan) => !plan.gr_lastcompleteddate
        || input.hourMeterRecordedDate >= plan.gr_lastcompleteddate.slice(0, 10)).forEach((plan) => requests.push({
            entityPath: `gr_equipmentserviceplans(${recordId(plan.gr_equipmentserviceplanid, 'Service plan identifier')})`,
            etag: requireEtag(plan, 'A service plan'),
            fields: {
                gr_lastcompleteddate: input.hourMeterRecordedDate,
                gr_lastcompletedhours: input.hourMeter,
                gr_nextduehours: calculateNextDueHours(plan.gr_servicetype, input.hourMeter),
                gr_nextduedate: calculateNextDueDate(input.hourMeterRecordedDate, configuration.serviceLevels[plan.gr_servicetype]?.timeInterval ?? { unit: 'months', value: 12 }),
                'gr_LastCompletedJob@odata.bind': `/gr_jobs(${input.jobId})`,
            },
        }))

    return requests
}

export async function completeServiceJobAtomically(
    token: string,
    rawInput: AtomicServiceCompletionInput,
): Promise<AtomicServiceCompletionResult> {
    const input = {
        ...rawInput,
        jobId: recordId(rawInput.jobId, 'Job identifier'),
        equipmentId: recordId(rawInput.equipmentId, 'Equipment identifier'),
    }
    let context = await loadCompletionContext(token, input.jobId, input.equipmentId)
    validateContext(context, input)

    if (context.job.gr_status === JOB_STATUSES.COMPLETE) {
        if (completionAlreadyCommitted(context, input)) {
            return { completedDate: context.job.gr_completeddate!, alreadyCompleted: true }
        }
        throw new Error('This Service Job is already complete with different completion data. Refresh before continuing.')
    }

    const completedDate = input.completedDate
    try {
        await executeAtomicChanges(token, completionRequests(context, input, completedDate))
        return { completedDate, alreadyCompleted: false }
    } catch (error) {
        try {
            context = await loadCompletionContext(token, input.jobId, input.equipmentId)
            if (completionAlreadyCommitted(context, input)) {
                return { completedDate: context.job.gr_completeddate!, alreadyCompleted: true }
            }
        } catch {
            throw new Error(
                'The Service completion result could not be confirmed. Refresh the Job before retrying; the same completed Job and hour meter will not be applied twice.',
                { cause: error },
            )
        }
        throw new Error(
            `${error instanceof Error ? error.message : 'The Service completion transaction failed.'} No partial completion changes were committed. Refresh and retry.`,
            { cause: error },
        )
    }
}
