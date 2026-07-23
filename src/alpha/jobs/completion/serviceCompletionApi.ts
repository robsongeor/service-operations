import { calculateNextDueHours, getPlansToUpdate } from '../../equipment/servicePlans/servicePlanCalculations'
import {
    SERVICE_TYPES,
    type PlannedServiceType,
} from '../../equipment/servicePlans/equipmentServicePlan.types'
import { buildJobUpdateFields } from '../services/jobsApi'
import type { JobSaveInput } from '../types/jobSave.types'
import { JOB_STATUSES } from '../types/jobStatus.types'
import { JOB_TYPES } from '../types/jobType.types'
import { validateCompletionHourMeter } from './jobCompletion'

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
    _gr_equipment_value?: string | null
}

type CompletionEquipment = DataverseRecord & {
    gr_equipmentid: string
    gr_currenthourmeter?: number | null
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
        `gr_jobs(${jobId})?$select=gr_jobid,gr_jobtype,gr_status,gr_servicetype,gr_hourmeter,gr_completeddate,_gr_equipment_value`,
        'The authoritative Service Job could not be loaded.',
    )
    if (!sameId(job._gr_equipment_value, expectedEquipmentId)) {
        throw new Error('The Job Equipment changed. Refresh the Job before completing it.')
    }

    const planFilter = encodeURIComponent(`_gr_equipment_value eq ${expectedEquipmentId} and gr_active eq true`)
    const [equipment, plansResponse] = await Promise.all([
        dataverseJson<CompletionEquipment>(
            token,
            `gr_equipments(${expectedEquipmentId})?$select=gr_equipmentid,gr_currenthourmeter`,
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
    if (context.job.gr_servicetype == null || context.job.gr_servicetype === SERVICE_TYPES.NONE) {
        throw new Error('Select and save a Service Type before completing this Service Job.')
    }
    if (context.job.gr_servicetype !== input.expectedServiceType) {
        throw new Error('The Service Type changed. Save or refresh the Job before completing it.')
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
    const meterError = validateCompletionHourMeter(
        String(input.hourMeter),
        context.equipment.gr_currenthourmeter ?? 0,
    )
    if (meterError) throw new Error(meterError)
}

function completionAlreadyCommitted(context: CompletionContext, input: AtomicServiceCompletionInput) {
    if (context.job.gr_status !== JOB_STATUSES.COMPLETE) return false
    if (context.job.gr_hourmeter !== input.hourMeter || !context.job.gr_completeddate) return false
    if (context.job.gr_servicetype !== input.expectedServiceType) return false
    if (!sameId(context.job._gr_equipment_value, input.equipmentId)) return false
    if ((context.equipment.gr_currenthourmeter ?? 0) < input.hourMeter) return false

    const requiredTypes = new Set(getPlansToUpdate(input.expectedServiceType))
    return context.plans
        .filter((plan) => requiredTypes.has(plan.gr_servicetype))
        .every((plan) =>
            sameId(plan._gr_lastcompletedjob_value, input.jobId)
            && plan.gr_lastcompletedhours === input.hourMeter
            && plan.gr_nextduehours === calculateNextDueHours(plan.gr_servicetype, input.hourMeter),
        )
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
            completedDate,
        })
        : {
            gr_status: JOB_STATUSES.COMPLETE,
            gr_hourmeter: input.hourMeter,
            gr_completeddate: completedDate,
        }

    const equipmentFields: Record<string, string | number | boolean | null> = {
        gr_currenthourmeter: Math.max(context.equipment.gr_currenthourmeter ?? 0, input.hourMeter),
    }
    if (input.pendingSave?.siteId) {
        equipmentFields['gr_Site@odata.bind'] = `/gr_sites(${recordId(input.pendingSave.siteId, 'Site identifier')})`
    }

    const requests: ChangeRequest[] = [
        {
            entityPath: `gr_jobs(${input.jobId})`,
            etag: requireEtag(context.job, 'The Job'),
            fields: jobFields,
        },
        {
            entityPath: `gr_equipments(${input.equipmentId})`,
            etag: requireEtag(context.equipment, 'The Equipment'),
            fields: equipmentFields,
        },
    ]

    const requiredTypes = new Set(getPlansToUpdate(input.expectedServiceType))
    context.plans
        .filter((plan) => requiredTypes.has(plan.gr_servicetype))
        .forEach((plan) => requests.push({
            entityPath: `gr_equipmentserviceplans(${recordId(plan.gr_equipmentserviceplanid, 'Service plan identifier')})`,
            etag: requireEtag(plan, 'A service plan'),
            fields: {
                gr_lastcompleteddate: completedDate,
                gr_lastcompletedhours: input.hourMeter,
                gr_nextduehours: calculateNextDueHours(plan.gr_servicetype, input.hourMeter),
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

    const completedDate = new Date().toISOString()
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
