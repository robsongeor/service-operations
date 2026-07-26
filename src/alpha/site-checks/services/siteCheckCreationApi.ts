import { SERVICE_TYPES } from '../../equipment/servicePlans/equipmentServicePlan.types.ts'
import { buildJobCreatePayload } from '../../jobs/services/jobsApi.ts'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types.ts'
import { JOB_TYPES } from '../../jobs/types/jobType.types.ts'
import { isValidDateOnly, isValidSiteCheckRequestKey } from '../domain/siteCheckCalculations.ts'
import {
    SITE_CHECK_STATUSES,
    type SiteCheckSchedule,
} from '../types/siteCheck.types.ts'

const DEFAULT_API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const SITE_CHECK_CREATION_MAX_OPERATIONS = 1000
export const SITE_CHECK_CREATION_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024

export type SiteCheckCreationEquipment = {
    gr_equipmentid: string
    gr_fleet?: string | null
    gr_serial?: string | null
    gr_make?: string | null
    gr_model?: string | null
    statecode?: number
    gr_ownershiptype?: number | null
}

export type SiteCheckCreationInput = {
    schedule: SiteCheckSchedule
    siteName: string
    technicianId: string
    equipment: readonly SiteCheckCreationEquipment[]
    requestKey: string
    startedOn: string
}

type AtomicRequest = {
    method: 'POST' | 'PATCH'
    entityPath: string
    fields: Record<string, unknown>
    etag?: string
}

function requireGuid(value: string, label: string) {
    if (!GUID_PATTERN.test(value)) throw new Error(`A valid ${label} is required.`)
    return value.toLowerCase()
}

function equipmentIdentifier(item: SiteCheckCreationEquipment) {
    return item.gr_fleet?.trim()
        || item.gr_serial?.trim()
        || [item.gr_make, item.gr_model].filter(Boolean).join(' ').trim()
        || item.gr_equipmentid
}

function validateInput(input: SiteCheckCreationInput) {
    const schedule = input.schedule
    requireGuid(schedule.gr_sitecheckscheduleid, 'Site Check Schedule ID')
    requireGuid(schedule._gr_site_value, 'Site ID')
    requireGuid(input.technicianId, 'technician ID')
    if (!schedule.gr_enabled || !schedule.gr_frequency || !isValidDateOnly(schedule.gr_nextduedate)) {
        throw new Error('The Site Check Schedule is disabled or incomplete.')
    }
    if (schedule._gr_activesitecheck_value) {
        throw new Error('Another Site Check is already in progress for this Site.')
    }
    if (!schedule['@odata.etag']) {
        throw new Error('Reload the Site Check Schedule before starting.')
    }
    if (!isValidSiteCheckRequestKey(input.requestKey)) {
        throw new Error('The Site Check request key is invalid.')
    }
    if (!input.equipment.length) throw new Error('This Site has no applicable Equipment.')
    if (!Number.isFinite(Date.parse(input.startedOn))) {
        throw new Error('A valid Site Check start time is required.')
    }
    input.equipment.forEach((item) => requireGuid(item.gr_equipmentid, 'Equipment ID'))
}

function creationRequests(input: SiteCheckCreationInput): AtomicRequest[] {
    validateInput(input)
    const schedule = input.schedule
    const siteId = schedule._gr_site_value.toLowerCase()
    const occurrence = {
        gr_name: `Site Check — ${input.siteName.trim() || siteId}`,
        gr_status: SITE_CHECK_STATUSES.IN_PROGRESS,
        gr_startedon: input.startedOn,
        gr_frequencysnapshot: schedule.gr_frequency,
        gr_duedatesnapshot: schedule.gr_nextduedate,
        gr_expectedjobcount: input.equipment.length,
        gr_creationrequestkey: input.requestKey,
        'gr_SiteCheckSchedule@odata.bind': `/gr_sitecheckschedules(${schedule.gr_sitecheckscheduleid})`,
        'gr_Site@odata.bind': `/gr_sites(${siteId})`,
        'gr_AssignedTechnician@odata.bind': `/gr_mechanics(${input.technicianId})`,
    }
    const scheduleLock = {
        'gr_ActiveSiteCheck@odata.bind': '$1',
    }
    const jobs = input.equipment.map((item) => ({
        ...buildJobCreatePayload({
            jobNumber: '',
            orderNumber: '',
            description: `Site Check — ${equipmentIdentifier(item)}`,
            jobType: JOB_TYPES.SITE_CHECK,
            status: JOB_STATUSES.ALLOCATED,
            equipmentId: item.gr_equipmentid,
            mechanicId: input.technicianId,
            siteId,
            serviceType: SERVICE_TYPES.NONE,
        }, 'site-check'),
        'gr_SiteCheck@odata.bind': '$1',
    }))

    return [
        { method: 'POST', entityPath: 'gr_sitechecks', fields: occurrence },
        {
            method: 'PATCH',
            entityPath: `gr_sitecheckschedules(${schedule.gr_sitecheckscheduleid})`,
            fields: scheduleLock,
            etag: schedule['@odata.etag'],
        },
        ...jobs.map((fields) => ({ method: 'POST' as const, entityPath: 'gr_jobs', fields })),
    ]
}

export function buildSiteCheckCreationChangeSet(input: SiteCheckCreationInput) {
    const requests = creationRequests(input)
    if (requests.length > SITE_CHECK_CREATION_MAX_OPERATIONS) {
        throw new Error('This Site has too many Equipment records for one atomic Site Check.')
    }
    const batchBoundary = `batch_${input.requestKey.replaceAll('-', '')}`
    const changeBoundary = `changeset_${input.requestKey.replaceAll('-', '')}`
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
            `${request.method} /api/data/v9.2/${request.entityPath} HTTP/1.1`,
            'Accept: application/json',
            'Content-Type: application/json; type=entry',
            ...(request.etag ? [`If-Match: ${request.etag}`] : []),
            '',
            JSON.stringify(request.fields),
            '',
        )
    })
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')
    const body = lines.join('\r\n')
    const payloadBytes = new TextEncoder().encode(body).byteLength
    if (payloadBytes > SITE_CHECK_CREATION_MAX_PAYLOAD_BYTES) {
        throw new Error('This Site Check exceeds the safe atomic request size.')
    }
    return {
        body,
        contentType: `multipart/mixed; boundary=${batchBoundary}`,
        operationCount: requests.length,
        payloadBytes,
    }
}

function nestedFailureStatus(body: string) {
    const statuses = [...body.matchAll(/HTTP\/1\.1\s+(\d{3})/g)].map((match) => Number(match[1]))
    return statuses.find((status) => status >= 400)
}

export async function executeSiteCheckCreation(
    accessToken: string,
    input: SiteCheckCreationInput,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const batch = buildSiteCheckCreationChangeSet(input)
    const response = await (options.fetcher ?? fetch)(`${options.apiUrl ?? DEFAULT_API_URL}/$batch`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': batch.contentType,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'If-None-Match': 'null',
        },
        body: batch.body,
    })
    const responseBody = await response.text()
    const nestedFailure = nestedFailureStatus(responseBody)
    if (!response.ok || nestedFailure) {
        if ([409, 412].includes(nestedFailure ?? response.status)) {
            throw new Error('The Site Check was already started or its Schedule changed. Reload before retrying.')
        }
        throw new Error('Dataverse rejected the atomic Site Check creation transaction.')
    }
    const successfulOperations = [...responseBody.matchAll(/HTTP\/1\.1\s+2\d{2}/g)].length
    if (successfulOperations !== batch.operationCount) {
        throw new Error('Dataverse did not confirm every Site Check creation operation.')
    }
    return { operationCount: batch.operationCount, payloadBytes: batch.payloadBytes }
}
