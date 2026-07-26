import type { JobStatus } from '../../jobs/types/jobStatus.types.ts'
import type {
    SiteCheck,
    SiteCheckFrequency,
    SiteCheckEquipmentScope,
    SiteCheckJobProgressInput,
    SiteCheckDetailJob,
    SiteCheckEquipmentExclusion,
    SiteCheckPage,
    SiteCheckSchedule,
    SiteCheckScheduleEquipment,
    SiteCheckScheduleSaveInput,
    SiteCheckStatus,
} from '../types/siteCheck.types.ts'
import { validateSiteCheckSchedule } from '../domain/siteCheckCalculations.ts'
import { SITE_CHECK_EQUIPMENT_SCOPES } from '../types/siteCheck.types.ts'

const DEFAULT_API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DataverseCollection = { value?: unknown[] }

function headers(accessToken: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
    }
}

function requireGuid(value: unknown, field: string) {
    if (typeof value !== 'string' || !GUID_PATTERN.test(value)) {
        throw new Error(`Site Checks data is missing a valid ${field}.`)
    }
    return value
}

function optionalGuid(value: unknown, field: string) {
    if (value == null || value === '') return null
    return requireGuid(value, field)
}

function requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value) {
        throw new Error(`Site Checks data is missing ${field}.`)
    }
    return value
}

function requireNumber(value: unknown, field: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Site Checks data is missing ${field}.`)
    }
    return value
}

function mapSchedule(value: unknown): SiteCheckSchedule {
    const row = value as Record<string, unknown>
    return {
        gr_sitecheckscheduleid: requireGuid(row.gr_sitecheckscheduleid, 'Schedule ID'),
        gr_name: requireString(row.gr_name, 'Schedule name'),
        gr_enabled: Boolean(row.gr_enabled),
        gr_frequency: row.gr_frequency == null
            ? null
            : requireNumber(row.gr_frequency, 'Schedule frequency') as SiteCheckFrequency,
        gr_equipmentscope: row.gr_equipmentscope == null
            ? null
            : requireNumber(row.gr_equipmentscope, 'Schedule Equipment scope') as SiteCheckEquipmentScope,
        gr_nextduedate: typeof row.gr_nextduedate === 'string' ? row.gr_nextduedate : null,
        gr_lastcompleteddate: typeof row.gr_lastcompleteddate === 'string'
            ? row.gr_lastcompleteddate
            : null,
        _gr_site_value: requireGuid(row._gr_site_value, 'Schedule Site'),
        _gr_activesitecheck_value: optionalGuid(
            row._gr_activesitecheck_value,
            'active Site Check',
        ),
        _gr_checklisttemplate_value: optionalGuid(
            row._gr_checklisttemplate_value,
            'checklist Template',
        ),
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

function mapSiteCheck(value: unknown): SiteCheck {
    const row = value as Record<string, unknown>
    return {
        gr_sitecheckid: requireGuid(row.gr_sitecheckid, 'Site Check ID'),
        gr_name: requireString(row.gr_name, 'Site Check name'),
        gr_status: requireNumber(row.gr_status, 'Site Check status') as SiteCheckStatus,
        gr_startedon: requireString(row.gr_startedon, 'Site Check started date'),
        gr_completedon: typeof row.gr_completedon === 'string' ? row.gr_completedon : null,
        gr_frequencysnapshot: requireNumber(
            row.gr_frequencysnapshot,
            'frequency snapshot',
        ) as SiteCheckFrequency,
        gr_duedatesnapshot: requireString(row.gr_duedatesnapshot, 'due date snapshot'),
        gr_expectedjobcount: requireNumber(row.gr_expectedjobcount, 'expected Job count'),
        gr_creationrequestkey: requireString(row.gr_creationrequestkey, 'creation request key'),
        _gr_sitecheckschedule_value: requireGuid(
            row._gr_sitecheckschedule_value,
            'Site Check Schedule',
        ),
        _gr_site_value: requireGuid(row._gr_site_value, 'Site Check Site'),
        _gr_assignedtechnician_value: requireGuid(
            row._gr_assignedtechnician_value,
            'assigned technician',
        ),
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

function mapScheduleEquipment(value: unknown): SiteCheckScheduleEquipment {
    const row = value as Record<string, unknown>
    return {
        gr_sitecheckscheduleequipmentid: requireGuid(
            row.gr_sitecheckscheduleequipmentid,
            'Schedule Equipment selection ID',
        ),
        gr_name: requireString(row.gr_name, 'Schedule Equipment selection name'),
        _gr_sitecheckschedule_value: requireGuid(
            row._gr_sitecheckschedule_value,
            'selection Schedule',
        ),
        _gr_equipment_value: requireGuid(row._gr_equipment_value, 'selected Equipment'),
        '@odata.etag': typeof row['@odata.etag'] === 'string'
            ? row['@odata.etag']
            : undefined,
    }
}

function mapProgressJob(value: unknown): Required<SiteCheckJobProgressInput> {
    const row = value as Record<string, unknown>
    return {
        gr_jobid: requireGuid(row.gr_jobid, 'Job ID'),
        gr_status: requireNumber(row.gr_status, 'Job status') as JobStatus,
        gr_jobcardstatus: typeof row.gr_jobcardstatus === 'number'
            ? row.gr_jobcardstatus as NonNullable<SiteCheckJobProgressInput['gr_jobcardstatus']>
            : null,
        _gr_sitecheck_value: requireGuid(row._gr_sitecheck_value, 'parent Site Check'),
    }
}

function mapDetailJob(value: unknown): SiteCheckDetailJob {
    const row = value as Record<string, unknown>
    const equipment = row.gr_Equipment as Record<string, unknown> | null | undefined
    const mechanic = row.gr_Mechanic as Record<string, unknown> | null | undefined
    return {
        ...mapProgressJob(row),
        gr_jobnumber: typeof row.gr_jobnumber === 'string' ? row.gr_jobnumber : null,
        gr_description: typeof row.gr_description === 'string' ? row.gr_description : null,
        gr_completeddate: typeof row.gr_completeddate === 'string' ? row.gr_completeddate : null,
        gr_Equipment: equipment ? {
            gr_equipmentid: requireGuid(equipment.gr_equipmentid, 'Job Equipment ID'),
            gr_fleet: typeof equipment.gr_fleet === 'string' ? equipment.gr_fleet : null,
            gr_serial: typeof equipment.gr_serial === 'string' ? equipment.gr_serial : null,
            gr_make: typeof equipment.gr_make === 'string' ? equipment.gr_make : null,
            gr_model: typeof equipment.gr_model === 'string' ? equipment.gr_model : null,
        } : null,
        gr_Mechanic: mechanic ? {
            gr_mechanicid: requireGuid(mechanic.gr_mechanicid, 'Job technician ID'),
            gr_name: requireString(mechanic.gr_name, 'Job technician name'),
        } : null,
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

function mapEquipmentExclusion(value: unknown): SiteCheckEquipmentExclusion {
    const row = value as Record<string, unknown>
    const equipment = row.gr_Equipment as Record<string, unknown> | null | undefined
    return {
        gr_sitecheckequipmentexclusionid: requireGuid(
            row.gr_sitecheckequipmentexclusionid,
            'Equipment exclusion ID',
        ),
        gr_name: requireString(row.gr_name, 'Equipment exclusion name'),
        gr_availabilitysnapshot: requireNumber(
            row.gr_availabilitysnapshot,
            'availability snapshot',
        ) as SiteCheckEquipmentExclusion['gr_availabilitysnapshot'],
        _gr_sitecheck_value: requireGuid(row._gr_sitecheck_value, 'exclusion Site Check'),
        _gr_equipment_value: requireGuid(row._gr_equipment_value, 'excluded Equipment'),
        gr_Equipment: equipment ? {
            gr_equipmentid: requireGuid(equipment.gr_equipmentid, 'excluded Equipment ID'),
            gr_fleet: typeof equipment.gr_fleet === 'string' ? equipment.gr_fleet : null,
            gr_serial: typeof equipment.gr_serial === 'string' ? equipment.gr_serial : null,
            gr_make: typeof equipment.gr_make === 'string' ? equipment.gr_make : null,
            gr_model: typeof equipment.gr_model === 'string' ? equipment.gr_model : null,
        } : null,
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

function normalizeIds(ids: readonly string[]) {
    const normalized = [...new Set(ids.map((id) => requireGuid(id, 'record ID').toLowerCase()))]
    if (normalized.length === 0) return []
    return normalized
}

function lookupFilter(field: string, ids: readonly string[]) {
    return ids.map((id) => `${field} eq ${id}`).join(' or ')
}

async function readCollection(
    accessToken: string,
    url: string,
    fallback: string,
    fetcher: typeof fetch,
) {
    const response = await fetcher(url, {
        cache: 'no-store',
        headers: headers(accessToken),
    })
    if (!response.ok) throw new Error(fallback)
    const body = await response.json() as DataverseCollection
    if (!Array.isArray(body.value)) throw new Error(fallback)
    return body.value
}

async function readPage<T>(
    accessToken: string,
    url: string,
    fallback: string,
    mapper: (value: unknown) => T,
    options: { apiUrl?: string; fetcher?: typeof fetch },
): Promise<SiteCheckPage<T>> {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    if (!url.startsWith(apiUrl)) throw new Error('The Site Checks continuation link is invalid.')
    const response = await (options.fetcher ?? fetch)(url, {
        cache: 'no-store',
        headers: {
            ...headers(accessToken),
            Prefer: 'odata.maxpagesize=25',
        },
    })
    if (!response.ok) throw new Error(fallback)
    const body = await response.json() as DataverseCollection & { '@odata.nextLink'?: unknown }
    if (!Array.isArray(body.value)) throw new Error(fallback)
    const nextLink = typeof body['@odata.nextLink'] === 'string'
        && body['@odata.nextLink'].startsWith(apiUrl)
        ? body['@odata.nextLink']
        : undefined
    return { records: body.value.map(mapper), nextLink }
}

async function readScheduleResponse(response: Response) {
    const text = await response.text()
    if (!text) return null
    try {
        return mapSchedule(JSON.parse(text))
    } catch {
        throw new Error('The Site Check Schedule was saved, but its returned data was invalid.')
    }
}

export async function fetchSiteCheckSchedulesForSites(
    accessToken: string,
    siteIds: readonly string[],
    options: { apiUrl?: string; fetcher?: typeof fetch; enabledOnly?: boolean } = {},
) {
    const ids = normalizeIds(siteIds)
    if (ids.length === 0) return []
    const query = [
        '$select=gr_sitecheckscheduleid,gr_name,gr_enabled,gr_frequency,gr_equipmentscope,gr_nextduedate,gr_lastcompleteddate,_gr_site_value,_gr_activesitecheck_value,_gr_checklisttemplate_value',
        `$filter=${options.enabledOnly ? 'gr_enabled eq true and ' : ''}(${lookupFilter('_gr_site_value', ids)})`,
        '$orderby=gr_name asc',
    ].join('&')
    const rows = await readCollection(
        accessToken,
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_sitecheckschedules?${query}`,
        'Site Check Schedules could not be loaded.',
        options.fetcher ?? fetch,
    )
    return rows.map(mapSchedule)
}

export async function fetchSiteChecksByIds(
    accessToken: string,
    siteCheckIds: readonly string[],
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const ids = normalizeIds(siteCheckIds)
    if (ids.length === 0) return []
    const query = [
        '$select=gr_sitecheckid,gr_name,gr_status,gr_startedon,gr_completedon,gr_frequencysnapshot,gr_duedatesnapshot,gr_expectedjobcount,gr_creationrequestkey,_gr_sitecheckschedule_value,_gr_site_value,_gr_assignedtechnician_value',
        `$filter=${lookupFilter('gr_sitecheckid', ids)}`,
    ].join('&')
    const rows = await readCollection(
        accessToken,
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_sitechecks?${query}`,
        'Site Checks could not be loaded.',
        options.fetcher ?? fetch,
    )
    return rows.map(mapSiteCheck)
}

export async function fetchSiteCheckScheduleEquipment(
    accessToken: string,
    scheduleIds: readonly string[],
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const ids = normalizeIds(scheduleIds)
    if (ids.length === 0) return []
    const query = [
        '$select=gr_sitecheckscheduleequipmentid,gr_name,_gr_sitecheckschedule_value,_gr_equipment_value',
        `$filter=${lookupFilter('_gr_sitecheckschedule_value', ids)}`,
        '$orderby=gr_name asc',
    ].join('&')
    const rows = await readCollection(
        accessToken,
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_sitecheckscheduleequipments?${query}`,
        'Manual Site Check Equipment selections could not be loaded.',
        options.fetcher ?? fetch,
    )
    return rows.map(mapScheduleEquipment)
}

export async function fetchSiteCheckByRequestKey(
    accessToken: string,
    requestKey: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    if (!/^[0-9a-f-]{36}$/i.test(requestKey)) {
        throw new Error('A valid Site Check request key is required.')
    }
    const query = [
        '$select=gr_sitecheckid,gr_name,gr_status,gr_startedon,gr_completedon,gr_frequencysnapshot,gr_duedatesnapshot,gr_expectedjobcount,gr_creationrequestkey,_gr_sitecheckschedule_value,_gr_site_value,_gr_assignedtechnician_value',
        `$filter=gr_creationrequestkey eq '${requestKey}'`,
        '$top=2',
    ].join('&')
    const rows = await readCollection(
        accessToken,
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_sitechecks?${query}`,
        'Site Check replay state could not be loaded.',
        options.fetcher ?? fetch,
    )
    if (rows.length > 1) throw new Error('Duplicate Site Check request keys require data repair.')
    return rows[0] ? mapSiteCheck(rows[0]) : null
}

export async function fetchSiteCheckJobs(
    accessToken: string,
    siteCheckIds: readonly string[],
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const ids = normalizeIds(siteCheckIds)
    if (ids.length === 0) return []
    const query = [
        '$select=gr_jobid,gr_status,gr_jobcardstatus,_gr_sitecheck_value',
        `$filter=${lookupFilter('_gr_sitecheck_value', ids)}`,
    ].join('&')
    const rows = await readCollection(
        accessToken,
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_jobs?${query}`,
        'Site Check Job progress could not be loaded.',
        options.fetcher ?? fetch,
    )
    return rows.map(mapProgressJob)
}

export async function fetchSiteCheckHistoryPage(
    accessToken: string,
    siteId: string,
    nextLink?: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const id = requireGuid(siteId, 'Site ID')
    const query = [
        '$select=gr_sitecheckid,gr_name,gr_status,gr_startedon,gr_completedon,gr_frequencysnapshot,gr_duedatesnapshot,gr_expectedjobcount,gr_creationrequestkey,_gr_sitecheckschedule_value,_gr_site_value,_gr_assignedtechnician_value',
        `$filter=_gr_site_value eq ${id}`,
        '$orderby=gr_startedon desc',
        '$top=25',
    ].join('&')
    return readPage(accessToken, nextLink ?? `${apiUrl}/gr_sitechecks?${query}`,
        'Site Check History could not be loaded.', mapSiteCheck, options)
}

export async function fetchSiteCheckDetailJobsPage(
    accessToken: string,
    siteCheckId: string,
    nextLink?: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const id = requireGuid(siteCheckId, 'Site Check ID')
    const query = [
        '$select=gr_jobid,gr_jobnumber,gr_description,gr_status,gr_jobcardstatus,gr_completeddate,_gr_sitecheck_value',
        '$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name)',
        `$filter=_gr_sitecheck_value eq ${id}`,
        '$orderby=createdon asc,gr_jobid asc',
        '$top=25',
    ].join('&')
    return readPage(accessToken, nextLink ?? `${apiUrl}/gr_jobs?${query}`,
        'Generated Site Check Jobs could not be loaded.', mapDetailJob, options)
}

export async function fetchSiteCheckEquipmentExclusionsPage(
    accessToken: string,
    siteCheckId: string,
    nextLink?: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const id = requireGuid(siteCheckId, 'Site Check ID')
    const query = [
        '$select=gr_sitecheckequipmentexclusionid,gr_name,gr_availabilitysnapshot,_gr_sitecheck_value,_gr_equipment_value',
        '$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model)',
        `$filter=_gr_sitecheck_value eq ${id}`,
        '$orderby=createdon asc,gr_sitecheckequipmentexclusionid asc',
        '$top=25',
    ].join('&')
    return readPage(
        accessToken,
        nextLink ?? `${apiUrl}/gr_sitecheckequipmentexclusions?${query}`,
        'Site Check Equipment exclusions could not be loaded.',
        mapEquipmentExclusion,
        options,
    )
}

export async function allocateSiteCheckJobNumbers(
    accessToken: string,
    allocations: readonly { job: SiteCheckDetailJob; jobNumber: string }[],
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    if (allocations.length === 0) throw new Error('No Site Check Jobs were supplied.')
    const seenJobs = new Set<string>()
    const seenNumbers = new Set<string>()
    allocations.forEach(({ job, jobNumber }) => {
        const jobId = requireGuid(job.gr_jobid, 'Job ID').toLowerCase()
        const normalizedNumber = jobNumber.trim()
        if (seenJobs.has(jobId)) throw new Error('A Site Check Job was supplied more than once.')
        if (!/^\d+$/.test(normalizedNumber)) throw new Error('Job numbers must contain digits only.')
        if (seenNumbers.has(normalizedNumber)) throw new Error('Each Job number must be unique.')
        if (!job['@odata.etag']) throw new Error('Reload the Site Check Jobs before allocating numbers.')
        seenJobs.add(jobId)
        seenNumbers.add(normalizedNumber)
    })

    const suffix = crypto.randomUUID().replaceAll('-', '')
    const batchBoundary = `batch_${suffix}`
    const changeBoundary = `changeset_${suffix}`
    const lines = [
        `--${batchBoundary}`,
        `Content-Type: multipart/mixed; boundary=${changeBoundary}`,
        '',
    ]
    allocations.forEach(({ job, jobNumber }, index) => {
        lines.push(
            `--${changeBoundary}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${index + 1}`,
            '',
            `PATCH /api/data/v9.2/gr_jobs(${job.gr_jobid}) HTTP/1.1`,
            'Accept: application/json',
            'Content-Type: application/json; type=entry',
            `If-Match: ${job['@odata.etag']}`,
            '',
            JSON.stringify({ gr_jobnumber: jobNumber.trim() }),
            '',
        )
    })
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')

    const fetcher = options.fetcher ?? fetch
    const response = await fetcher(`${options.apiUrl ?? DEFAULT_API_URL}/$batch`, {
        method: 'POST',
        headers: {
            ...headers(accessToken),
            'Content-Type': `multipart/mixed; boundary=${batchBoundary}`,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
        body: lines.join('\r\n'),
    })
    const responseBody = await response.text()
    const statuses = [...responseBody.matchAll(/HTTP\/1\.1\s+(\d{3})/g)]
        .map((match) => Number(match[1]))
    const failure = statuses.find((status) => status >= 400)
    if (!response.ok || failure) {
        if ((failure ?? response.status) === 412) {
            throw new Error('One or more Jobs changed elsewhere. Reload and paste the numbers again.')
        }
        throw new Error('Dataverse rejected the atomic Job number allocation.')
    }
    if (statuses.filter((status) => status >= 200 && status < 300).length !== allocations.length) {
        throw new Error('Dataverse did not confirm every Job number update.')
    }
}

export async function deleteSiteCheckOccurrence(
    accessToken: string,
    occurrence: SiteCheck,
    jobs: readonly SiteCheckDetailJob[],
    exclusions: readonly SiteCheckEquipmentExclusion[],
    schedule?: SiteCheckSchedule | null,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const occurrenceId = requireGuid(occurrence.gr_sitecheckid, 'Site Check ID')
    if (!occurrence['@odata.etag']) throw new Error('Reload the Site Check before deleting it.')
    jobs.forEach((job) => {
        requireGuid(job.gr_jobid, 'Job ID')
        if (job._gr_sitecheck_value.toLowerCase() !== occurrenceId.toLowerCase()) {
            throw new Error('A generated Job belongs to a different Site Check.')
        }
        if (!job['@odata.etag']) throw new Error('Reload the generated Jobs before deleting.')
    })
    exclusions.forEach((exclusion) => {
        requireGuid(exclusion.gr_sitecheckequipmentexclusionid, 'Equipment exclusion ID')
        if (exclusion._gr_sitecheck_value.toLowerCase() !== occurrenceId.toLowerCase()) {
            throw new Error('An Equipment exclusion belongs to a different Site Check.')
        }
        if (!exclusion['@odata.etag']) {
            throw new Error('Reload the Equipment exclusions before deleting.')
        }
    })
    const clearsActivePointer = Boolean(
        schedule?._gr_activesitecheck_value
        && schedule._gr_activesitecheck_value.toLowerCase() === occurrenceId.toLowerCase(),
    )
    if (clearsActivePointer && !schedule?.['@odata.etag']) {
        throw new Error('Reload the Site Check Schedule before deleting this active Site Check.')
    }

    const suffix = crypto.randomUUID().replaceAll('-', '')
    const batchBoundary = `batch_${suffix}`
    const changeBoundary = `changeset_${suffix}`
    const requests: Array<{
        method: 'PATCH' | 'DELETE'
        path: string
        fields?: Record<string, unknown>
        etag: string
    }> = []
    if (clearsActivePointer && schedule) {
        requests.push({
            method: 'PATCH',
            path: `gr_sitecheckschedules(${schedule.gr_sitecheckscheduleid})`,
            fields: { 'gr_ActiveSiteCheck@odata.bind': null },
            etag: schedule['@odata.etag']!,
        })
    }
    jobs.forEach((job) => requests.push({
        method: 'DELETE',
        path: `gr_jobs(${job.gr_jobid})`,
        etag: job['@odata.etag']!,
    }))
    exclusions.forEach((exclusion) => requests.push({
        method: 'DELETE',
        path: `gr_sitecheckequipmentexclusions(${exclusion.gr_sitecheckequipmentexclusionid})`,
        etag: exclusion['@odata.etag']!,
    }))
    requests.push({
        method: 'DELETE',
        path: `gr_sitechecks(${occurrenceId})`,
        etag: occurrence['@odata.etag'],
    })

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
            `${request.method} /api/data/v9.2/${request.path} HTTP/1.1`,
            'Accept: application/json',
            ...(request.fields ? ['Content-Type: application/json; type=entry'] : []),
            `If-Match: ${request.etag}`,
            '',
            ...(request.fields ? [JSON.stringify(request.fields)] : []),
            '',
        )
    })
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')

    const response = await (options.fetcher ?? fetch)(
        `${options.apiUrl ?? DEFAULT_API_URL}/$batch`,
        {
            method: 'POST',
            headers: {
                ...headers(accessToken),
                'Content-Type': `multipart/mixed; boundary=${batchBoundary}`,
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
            },
            body: lines.join('\r\n'),
        },
    )
    const responseBody = await response.text()
    const statuses = [...responseBody.matchAll(/HTTP\/1\.1\s+(\d{3})/g)]
        .map((match) => Number(match[1]))
    const failure = statuses.find((status) => status >= 400)
    if (!response.ok || failure) {
        if ((failure ?? response.status) === 412) {
            throw new Error('The Site Check, Schedule, or one of its Jobs changed. Reload and review it before deleting.')
        }
        if ((failure ?? response.status) === 403) {
            throw new Error('You do not have permission to delete Site Checks.')
        }
        throw new Error('Dataverse rejected the atomic Site Check deletion.')
    }
    if (statuses.filter((status) => status >= 200 && status < 300).length !== requests.length) {
        throw new Error('Dataverse did not confirm every Site Check deletion operation.')
    }
}

export async function saveSiteCheckSchedule(
    accessToken: string,
    input: SiteCheckScheduleSaveInput,
    existing?: SiteCheckSchedule | null,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const validation = validateSiteCheckSchedule({
        enabled: input.enabled,
        frequency: input.frequency,
        nextDueDate: input.nextDueDate,
    })
    if (!validation.valid) throw new Error(validation.errors.join(' '))
    const siteId = requireGuid(input.siteId, 'Site ID')
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const fetcher = options.fetcher ?? fetch
    const payload = {
        gr_name: `Site Check Schedule — ${input.siteName.trim() || siteId}`,
        gr_enabled: input.enabled,
        gr_frequency: input.frequency ?? null,
        gr_equipmentscope: input.equipmentScope ?? null,
        gr_nextduedate: input.nextDueDate ?? null,
        ...(!existing ? { 'gr_Site@odata.bind': `/gr_sites(${siteId})` } : {}),
    }
    const response = await fetcher(
        existing
            ? `${apiUrl}/gr_sitecheckschedules(${existing.gr_sitecheckscheduleid})`
            : `${apiUrl}/gr_sitecheckschedules`,
        {
            method: existing ? 'PATCH' : 'POST',
            headers: {
                ...headers(accessToken),
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
                ...(existing?.['@odata.etag']
                    ? { 'If-Match': existing['@odata.etag'] }
                    : {}),
            },
            body: JSON.stringify(payload),
        },
    )
    if (!response.ok) {
        if (response.status === 409 || response.status === 412) {
            throw new Error(
                existing
                    ? 'The Site Check Schedule changed elsewhere. Reload it and try again.'
                    : 'A Site Check Schedule already exists for this Site. Reload it and try again.',
            )
        }
        throw new Error(`The Site Check Schedule could not be saved (Dataverse HTTP ${response.status}).`)
    }
    return readScheduleResponse(response)
}

type ScheduleConfigurationRequest = {
    method: 'POST' | 'PATCH' | 'DELETE'
    path: string
    fields?: Record<string, unknown>
    etag?: string
}

function buildScheduleConfigurationBatch(
    input: SiteCheckScheduleSaveInput,
    existing: SiteCheckSchedule | null | undefined,
    currentSelections: readonly SiteCheckScheduleEquipment[],
) {
    const siteId = requireGuid(input.siteId, 'Site ID')
    const scheduleId = existing?.gr_sitecheckscheduleid ?? crypto.randomUUID()
    const selectedIds = normalizeIds(input.selectedEquipmentIds ?? [])
    if (
        input.enabled
        && input.equipmentScope === SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION
        && selectedIds.length === 0
    ) {
        throw new Error('Select at least one Equipment record for Manual Selection.')
    }
    const desiredIds = input.equipmentScope === SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION
        ? selectedIds
        : []
    const desired = new Set(desiredIds)
    const currentByEquipment = new Map(currentSelections.map((selection) => [
        selection._gr_equipment_value.toLowerCase(),
        selection,
    ]))
    const scheduleFields = {
        ...(!existing ? { gr_sitecheckscheduleid: scheduleId } : {}),
        gr_name: `Site Check Schedule — ${input.siteName.trim() || siteId}`,
        gr_enabled: input.enabled,
        gr_frequency: input.frequency ?? null,
        gr_equipmentscope: input.equipmentScope ?? null,
        gr_nextduedate: input.nextDueDate ?? null,
        ...(!existing ? { 'gr_Site@odata.bind': `/gr_sites(${siteId})` } : {}),
    }
    const requests: ScheduleConfigurationRequest[] = [{
        method: existing ? 'PATCH' : 'POST',
        path: existing
            ? `gr_sitecheckschedules(${scheduleId})`
            : 'gr_sitecheckschedules',
        fields: scheduleFields,
        etag: existing?.['@odata.etag'],
    }]
    currentSelections.forEach((selection) => {
        if (!desired.has(selection._gr_equipment_value.toLowerCase())) {
            requests.push({
                method: 'DELETE',
                path: `gr_sitecheckscheduleequipments(${selection.gr_sitecheckscheduleequipmentid})`,
                etag: selection['@odata.etag'],
            })
        }
    })
    desiredIds.forEach((equipmentId) => {
        if (!currentByEquipment.has(equipmentId)) {
            requests.push({
                method: 'POST',
                path: 'gr_sitecheckscheduleequipments',
                fields: {
                    gr_name: `Site Check Equipment — ${equipmentId}`,
                    'gr_SiteCheckSchedule@odata.bind': `/gr_sitecheckschedules(${scheduleId})`,
                    'gr_Equipment@odata.bind': `/gr_equipments(${equipmentId})`,
                },
            })
        }
    })

    const suffix = scheduleId.replaceAll('-', '')
    const batchBoundary = `batch_${suffix}`
    const changeBoundary = `changeset_${suffix}`
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
            `${request.method} /api/data/v9.2/${request.path} HTTP/1.1`,
            'Accept: application/json',
            ...(request.fields ? ['Content-Type: application/json; type=entry'] : []),
            ...(request.etag ? [`If-Match: ${request.etag}`] : []),
            '',
            ...(request.fields ? [JSON.stringify(request.fields)] : []),
            '',
        )
    })
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')
    return {
        body: lines.join('\r\n'),
        contentType: `multipart/mixed; boundary=${batchBoundary}`,
        operationCount: requests.length,
    }
}

export async function saveSiteCheckScheduleConfiguration(
    accessToken: string,
    input: SiteCheckScheduleSaveInput,
    existing?: SiteCheckSchedule | null,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const validation = validateSiteCheckSchedule({
        enabled: input.enabled,
        frequency: input.frequency,
        nextDueDate: input.nextDueDate,
    })
    if (!validation.valid) throw new Error(validation.errors.join(' '))
    const fetcher = options.fetcher ?? fetch
    const currentSelections = existing
        ? await fetchSiteCheckScheduleEquipment(
            accessToken,
            [existing.gr_sitecheckscheduleid],
            options,
        )
        : []
    const batch = buildScheduleConfigurationBatch(input, existing, currentSelections)
    const response = await fetcher(`${options.apiUrl ?? DEFAULT_API_URL}/$batch`, {
        method: 'POST',
        headers: {
            ...headers(accessToken),
            'Content-Type': batch.contentType,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
        body: batch.body,
    })
    const responseBody = await response.text()
    const statuses = [...responseBody.matchAll(/HTTP\/1\.1\s+(\d{3})/g)]
        .map((match) => Number(match[1]))
    const failure = statuses.find((status) => status >= 400)
    if (!response.ok || failure) {
        if ([409, 412].includes(failure ?? response.status)) {
            throw new Error('The Site Check settings changed elsewhere. Reload and try again.')
        }
        throw new Error('Dataverse rejected the atomic Site Check settings transaction.')
    }
    if (statuses.filter((status) => status >= 200 && status < 300).length !== batch.operationCount) {
        throw new Error('Dataverse did not confirm every Site Check settings operation.')
    }
}
