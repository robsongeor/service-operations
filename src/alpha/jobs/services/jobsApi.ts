import type { Job } from '../types/job.types.ts'
import type { JobSaveInput } from '../types/jobSave.types.ts'
import { assertJobTypeAllowedForCreation, type JobCreationSource } from '../types/jobType.types.ts'
import { HOUR_METER_CLASSIFICATION_ENABLED, type HourMeterReadingType } from '../../equipment/hourMeter/hourMeterReading.types.ts'
import {
    invalidateSharedJobsDataCache,
    jobsCacheScope,
    readPersistedJobsSnapshot,
    sharedJobsDataCache,
    writePersistedJobsSnapshot,
    type JobsCacheReadOptions,
} from './jobsDataCache.ts'
import { assertJobDescriptionLength } from '../domain/jobDescription.ts'
import type { JobCardSubmission } from '../types/jobCardSubmission.types.ts'
import { invalidateOperationalQueries } from '../../shared/data/OperationalDataClient.ts'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { buildDataverseIdFilterBatches } from '../../shared/dataverse/boundedDataverseFilters.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''
const HOUR_METER_READING_SELECT = HOUR_METER_CLASSIFICATION_ENABLED ? ',gr_hourmeterreadingtype,gr_hourmeterrecordeddate' : ''
const JOB_SELECT = `gr_jobid,createdon,gr_jobnumber,gr_status,gr_ordernumber,gr_description,gr_jobtype,gr_jobcardstatus,gr_jobcardsenton,gr_jobcardsubmittedon,gr_jobcardclosedon,gr_hourmeter${HOUR_METER_READING_SELECT},gr_completeddate,gr_servicetype,gr_currentofficeaction,gr_officeactionowner,gr_officeattentionrequired,gr_techniciansubmissiontokenhash,gr_techniciansubmissiontokencreatedon,gr_techniciansubmissiontokenexpireson,gr_techniciansubmissiontokenused,gr_techniciansubmissionsubmittedon,gr_techniciansubmissionhourmeter,gr_techniciansubmissionstory,gr_techniciansubmissionfurtherworkrequired,gr_techniciansubmissionfurtherworkdetails,gr_techniciansubmissionsafetyissueidentified,gr_techniciansubmissionsafetyissuedetails,_gr_sitecheck_value`
const JOB_EXPAND = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial,gr_currenthourmeter,gr_currenthourmeterrecordeddate,gr_servicetrackingenabled),gr_Mechanic($select=gr_mechanicid,gr_name,gr_phone,gr_email),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)'

type FetchJobsOptions = JobsCacheReadOptions & {
    useDeviceCache?: boolean
    onDeviceSnapshot?: (rows: Job[], savedAt: number) => void
    onBackgroundRefresh?: (rows: Job[], refreshedAt: number) => void
    onBackgroundRefreshError?: () => void
}

async function fetchAllJobPages(accessToken: string): Promise<Job[]> {
    const rows: Job[] = []
    let nextUrl: string | undefined = `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${JOB_SELECT}&$expand=${JOB_EXPAND}`
    while (nextUrl) {
        const result = await fetch(nextUrl, {
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
                Prefer: 'odata.maxpagesize=5000',
            },
        })
        if (!result.ok) {
            const error = await result.text()
            throw new Error(`Failed to fetch jobs: ${error || `${result.status} ${result.statusText}`}`)
        }
        const data = await result.json() as { value?: Job[]; '@odata.nextLink'?: string }
        rows.push(...(data.value ?? []))
        nextUrl = data['@odata.nextLink']
    }
    return rows
}

function blobDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('A Job photo could not be read.'))
        reader.readAsDataURL(blob)
    })
}

export async function fetchJobPhotoMetadata(accessToken: string, jobId: string, signal?: AbortSignal): Promise<NonNullable<Job['jobPhotos']>> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const metadata = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,gr_filename,gr_uploadedon,gr_displayorder,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_displayorder asc`,
        { cache: 'no-store', headers, signal },
    )
    if (!metadata.ok) return []
    const rows = ((await metadata.json()).value ?? []) as Record<string, unknown>[]
    return rows.map((row) => ({
        id: String(row.gr_jobphotoid),
        fileName: String(row.gr_filename || 'Job photo'),
        uploadedOn: String(row.gr_uploadedon || ''),
        displayOrder: Number(row.gr_displayorder || 0),
    }))
}

export async function fetchJobPhotoBody(accessToken: string, photoId: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos(${photoId})/gr_photo/$value`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/octet-stream' },
        signal,
    })
    if (!response.ok) throw new Error('The Job Card photo could not be loaded.')
    return blobDataUrl(await response.blob())
}

async function fetchJobCardSubmissions(accessToken: string, jobId: string, signal?: AbortSignal): Promise<JobCardSubmission[]> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const submissionResult = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobcardsubmissions?$select=gr_jobcardsubmissionid,gr_name,gr_recipientname,gr_recipientemail,gr_role,gr_status,gr_required,gr_emailsenton,gr_submittedon,gr_closedon,gr_hourmeter,gr_story,gr_furtherworkrequired,gr_furtherworkdetails,gr_safetyissueidentified,gr_safetyissuedetails,gr_islegacy,_gr_job_value,_gr_mechanic_value,_gr_jobassignment_value&$filter=_gr_job_value eq ${jobId}&$orderby=createdon asc`,
        { cache: 'no-store', headers, signal },
    )
    // The fallback keeps the app usable during the schema-first rollout.
    if (submissionResult.status === 404) return []
    if (!submissionResult.ok) throw new Error('The Job Card submissions could not be loaded.')
    const submissions = ((await submissionResult.json()).value ?? []) as Record<string, unknown>[]
    if (!submissions.length) return []

    const ids = submissions.map((item) => String(item.gr_jobcardsubmissionid))
    const submissionFilter = ids.map((id) => `_gr_jobcardsubmission_value eq ${id}`).join(' or ')
    const [timeResult, partsResult, photoResult] = await Promise.all([
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobcardsubmissiontimeentries?$select=gr_jobcardsubmissiontimeentryid,gr_entrydate,gr_totalhours,gr_kilometres,_gr_jobcardsubmission_value&$filter=${encodeURIComponent(submissionFilter)}&$orderby=gr_entrydate asc`, { cache: 'no-store', headers, signal }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobmaterials?$select=gr_jobmaterialid,gr_material,gr_quantity,_gr_jobcardsubmission_value&$filter=${encodeURIComponent(submissionFilter)}&$orderby=gr_displayorder asc`, { cache: 'no-store', headers, signal }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,gr_filename,gr_uploadedon,gr_displayorder,_gr_jobcardsubmission_value&$filter=${encodeURIComponent(submissionFilter)}&$orderby=gr_displayorder asc`, { cache: 'no-store', headers, signal }),
    ])
    const timeRows = timeResult.ok ? ((await timeResult.json()).value ?? []) as Record<string, unknown>[] : []
    const partRows = partsResult.ok ? ((await partsResult.json()).value ?? []) as Record<string, unknown>[] : []
    const photoRows = photoResult.ok ? ((await photoResult.json()).value ?? []) as Record<string, unknown>[] : []
    const photos = photoRows.map((row) => ({
        submissionId: String(row._gr_jobcardsubmission_value),
        id: String(row.gr_jobphotoid),
        fileName: String(row.gr_filename || 'Job photo'),
        uploadedOn: String(row.gr_uploadedon || ''),
        displayOrder: Number(row.gr_displayorder || 0),
    }))

    return submissions.map((item) => {
        const id = String(item.gr_jobcardsubmissionid)
        return {
            ...item,
            gr_jobcardsubmissionid: id,
            gr_name: String(item.gr_name || 'Technician Job Card'),
            gr_role: Number(item.gr_role),
            gr_status: Number(item.gr_status),
            _gr_job_value: String(item._gr_job_value),
            timeEntries: timeRows.filter((row) => row._gr_jobcardsubmission_value === id).map((row) => ({
                id: String(row.gr_jobcardsubmissiontimeentryid),
                date: String(row.gr_entrydate),
                hours: Number(row.gr_totalhours),
                kilometres: Number(row.gr_kilometres),
            })),
            parts: partRows.filter((row) => row._gr_jobcardsubmission_value === id).map((row) => ({
                id: String(row.gr_jobmaterialid),
                part: String(row.gr_material),
                quantity: Number(row.gr_quantity) || 1,
            })),
            photos: photos.filter((photo) => photo.submissionId === id).map((photo) => ({
                id: photo.id,
                fileName: photo.fileName,
                uploadedOn: photo.uploadedOn,
                displayOrder: photo.displayOrder,
            })),
        } as JobCardSubmission
    })
}

export async function fetchJobs(accessToken: string, options: FetchJobsOptions = {}): Promise<Job[]> {
    const scope = jobsCacheScope(accessToken)
    const loadNetwork = async (generation = sharedJobsDataCache.captureGeneration(scope)) => {
        const rows = await fetchAllJobPages(accessToken)
        if (sharedJobsDataCache.isGenerationCurrent(scope, generation)) {
            const refreshedAt = Date.now()
            void writePersistedJobsSnapshot(scope, rows, refreshedAt)
            options.onBackgroundRefresh?.(rows, refreshedAt)
        }
        return rows
    }

    return sharedJobsDataCache.read(scope, async () => {
        if (!options.forceRefresh && options.useDeviceCache) {
            const snapshot = await readPersistedJobsSnapshot(scope)
            if (snapshot) {
                options.onDeviceSnapshot?.(snapshot.rows, snapshot.savedAt)
                const generation = sharedJobsDataCache.captureGeneration(scope)
                void loadNetwork(generation)
                    .then((rows) => sharedJobsDataCache.writeIfCurrent(scope, generation, rows))
                    .catch(() => options.onBackgroundRefreshError?.())
                return snapshot.rows
            }
        }
        return loadNetwork()
    }, options)
}

export async function fetchJobsForSites(accessToken: string, siteIds: readonly string[], signal?: AbortSignal): Promise<Job[]> {
    const filters = buildDataverseIdFilterBatches('_gr_site_value', siteIds)
    if (!filters.length) return []
    const rows: Job[] = []
    for (const filter of filters) {
        rows.push(...await fetchAllDataversePages<Job>(
            `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${JOB_SELECT}&$expand=${JOB_EXPAND}&$filter=${encodeURIComponent(filter)}`,
            {
                cache: 'no-store',
                signal,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                    'Cache-Control': 'no-cache',
                    Prefer: 'odata.maxpagesize=5000',
                },
            },
            async (response) => {
                if (!response.ok) {
                    const detail = await response.text()
                    throw new Error(`Failed to fetch Customer Jobs: ${detail || `${response.status} ${response.statusText}`}`)
                }
            },
        ))
    }
    return rows
}

export async function fetchJobsByIds(accessToken: string, jobIds: readonly string[], signal?: AbortSignal): Promise<Job[]> {
    const filters = buildDataverseIdFilterBatches('gr_jobid', jobIds)
    if (!filters.length) return []
    const rows: Job[] = []
    for (const filter of filters) {
        rows.push(...await fetchAllDataversePages<Job>(
            `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${JOB_SELECT}&$expand=${JOB_EXPAND}&$filter=${encodeURIComponent(filter)}`,
            {
                cache: 'no-store',
                signal,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                    'Cache-Control': 'no-cache',
                    Prefer: 'odata.maxpagesize=5000',
                },
            },
            async (response) => {
                if (!response.ok) {
                    const detail = await response.text()
                    throw new Error(`Failed to fetch scheduled Jobs: ${detail || `${response.status} ${response.statusText}`}`)
                }
            },
        ))
    }
    const jobsById = new Map(rows.map((job) => [job.gr_jobid.toLowerCase(), job]))
    return [...jobsById.values()]
}

export function subscribeToJobsData(
    accessToken: string,
    listener: (rows: Job[], loadedAt: number) => void,
) {
    return sharedJobsDataCache.subscribe(jobsCacheScope(accessToken), listener)
}

export async function fetchJobCore(accessToken: string, jobId: string, signal?: AbortSignal): Promise<Job | undefined> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }
    const jobResult = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${JOB_SELECT}&$expand=${JOB_EXPAND}&$filter=gr_jobid eq ${jobId}&$top=1`,
        { cache: 'no-store', headers, signal },
    )
    if (!jobResult.ok) throw new Error('The Job could not be refreshed for review.')
    return ((await jobResult.json()) as { value?: Job[] }).value?.[0]
}

export type JobCardDetails = Pick<Job,
    'technicianSubmissionTimeEntries' | 'technicianSubmissionParts' | 'jobPhotos' | 'jobCardSubmissions'
>

export async function fetchJobCardDetails(accessToken: string, jobId: string, signal?: AbortSignal): Promise<JobCardDetails> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }
    const [timeResult, partsResult, photos, submissions] = await Promise.all([
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobcardsubmissiontimeentries?$select=gr_jobcardsubmissiontimeentryid,gr_entrydate,gr_totalhours,gr_kilometres,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_entrydate asc`, { cache: 'no-store', headers, signal }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobmaterials?$select=gr_jobmaterialid,gr_material,gr_quantity,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_displayorder asc`, { cache: 'no-store', headers, signal }),
        fetchJobPhotoMetadata(accessToken, jobId, signal),
        fetchJobCardSubmissions(accessToken, jobId, signal),
    ])
    const timeEntries = timeResult.ok ? ((await timeResult.json()).value ?? []) as Record<string, unknown>[] : []
    const parts = partsResult.ok ? ((await partsResult.json()).value ?? []) as Record<string, unknown>[] : []
    return {
        technicianSubmissionTimeEntries: timeEntries.map((item) => ({
            id: String(item.gr_jobcardsubmissiontimeentryid),
            date: String(item.gr_entrydate),
            hours: Number(item.gr_totalhours),
            kilometres: Number(item.gr_kilometres),
        })),
        technicianSubmissionParts: parts.map((item) => ({
            id: String(item.gr_jobmaterialid),
            part: String(item.gr_material),
            quantity: Number(item.gr_quantity) || 1,
        })),
        jobPhotos: photos,
        jobCardSubmissions: submissions,
    }
}

/**
 * Compatibility loader for callers that explicitly need every Job drawer section.
 * Interactive drawers should prefer fetchJobCore first and fetchJobCardDetails only
 * when the Job Card tab is opened.
 */
export async function fetchJobForDrawer(accessToken: string, jobId: string, signal?: AbortSignal): Promise<Job | undefined> {
    const [job, details] = await Promise.all([
        fetchJobCore(accessToken, jobId, signal),
        fetchJobCardDetails(accessToken, jobId, signal),
    ])
    return job ? { ...job, ...details } : undefined
}

export function invalidateJobsCache(accessToken?: string) {
    invalidateSharedJobsDataCache(accessToken)
    invalidateOperationalQueries((key) =>
        (key[0] === 'equipment' && key[2] === 'jobs')
        || key[0] === 'job'
        || key[0] === 'jobs'
        || key[0] === 'customer-dashboard'
        || key[0] === 'job-map'
        || (key[0] === 'staff' && (key[1] === 'open-job-allocations-v1' || key[2] === 'jobs-v1'))
        || (key[0] === 'scheduler' && key[1] === 'jobs-v1'))
}

export async function fetchEquipmentJobs(accessToken: string, equipmentId: string, signal?: AbortSignal): Promise<Job[]> {
    const select = `gr_jobid,createdon,gr_jobnumber,gr_status,gr_description,gr_jobtype,gr_jobcardstatus,gr_hourmeter${HOUR_METER_READING_SELECT},gr_completeddate,gr_servicetype`
    const expand = 'gr_Equipment($select=gr_equipmentid),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))'
    const rows: Job[] = []
    let nextUrl: string | undefined = `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${select}&$expand=${expand}&$filter=_gr_equipment_value eq ${equipmentId}&$orderby=createdon desc`

    while (nextUrl) {
        const response = await fetch(nextUrl, {
            cache: 'no-store',
            signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
            },
        })
        if (!response.ok) {
            const detail = await response.text()
            throw new Error(`Failed to fetch Equipment Job history: ${detail || `${response.status} ${response.statusText}`}`)
        }
        const data = await response.json() as { value?: Job[]; '@odata.nextLink'?: string }
        rows.push(...(data.value ?? []))
        nextUrl = data['@odata.nextLink']
    }

    return rows
}

export function buildJobCreatePayload(
    job: JobSaveInput,
    source: JobCreationSource = 'standard',
) {
    assertJobTypeAllowedForCreation(job.jobType, source)
    assertJobDescriptionLength(job.description)
    const newJob: Record<string, string | number> = {
        gr_jobnumber: job.jobNumber,
        gr_ordernumber: job.orderNumber,
        gr_description: job.description,
        gr_jobtype: job.jobType,
        gr_status: job.status,
        gr_servicetype: job.serviceType,
    }

    if (job.equipmentId) {
        newJob['gr_Equipment@odata.bind'] = `/gr_equipments(${job.equipmentId})`
    }

    if (job.mechanicId) {
        newJob['gr_Mechanic@odata.bind'] = `/gr_mechanics(${job.mechanicId})`
    }

    if (job.siteId) {
        newJob['gr_Site@odata.bind'] = `/gr_sites(${job.siteId})`
    }

    if (job.contactId) {
        newJob['gr_Contact@odata.bind'] = `/gr_contacts(${job.contactId})`
    }
    if (job.currentOfficeAction != null) newJob.gr_currentofficeaction = job.currentOfficeAction
    if (job.officeActionOwner != null) newJob.gr_officeactionowner = job.officeActionOwner
    if (job.hourMeter != null) newJob.gr_hourmeter = job.hourMeter
    if (HOUR_METER_CLASSIFICATION_ENABLED && job.hourMeterReadingType != null) newJob.gr_hourmeterreadingtype = job.hourMeterReadingType
    if (HOUR_METER_CLASSIFICATION_ENABLED && job.hourMeterRecordedDate) newJob.gr_hourmeterrecordeddate = job.hourMeterRecordedDate
    if (job.completedDate) newJob.gr_completeddate = job.completedDate
    return newJob
}

export async function createJob(
    accessToken: string,
    job: JobSaveInput,
    source: JobCreationSource = 'standard',
): Promise<string> {
    const newJob = buildJobCreatePayload(job, source)
    await assertJobNumberAvailable(accessToken, job.jobNumber)
    const result = await fetch(
        `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_jobs`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify(newJob),
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }

    const createdJob = await result.json()
    invalidateJobsCache(accessToken)
    return createdJob.gr_jobid
}

function escapeODataString(value: string) {
    return value.replaceAll("'", "''")
}

export async function assertJobNumberAvailable(accessToken: string, jobNumber: string) {
    const normalized = jobNumber.trim()
    if (!normalized) return
    const query = new URLSearchParams({
        '$select': 'gr_jobid,gr_jobnumber',
        '$filter': `gr_jobnumber eq '${escapeODataString(normalized)}'`,
        '$top': '1',
    })
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs?${query}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('The Job Number could not be checked. No Job was created.')
    const result = await response.json() as { value?: Array<{ gr_jobid: string }> }
    if (result.value?.length) {
        throw new Error(`Job Number ${normalized} already exists. Open the existing Job or enter a different number.`)
    }
}

export async function updateJobStatus(
    token: string,
    jobId: string,
    status: number,
    completedDate?: string,
    hourMeter?: number,
    hourMeterReadingType?: HourMeterReadingType,
    hourMeterRecordedDate?: string,
) {
    const response = await fetch(
        `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                gr_status: status,
                ...(completedDate ? { gr_completeddate: completedDate } : {}),
                ...(hourMeter != null ? { gr_hourmeter: hourMeter } : {}),
                ...(HOUR_METER_CLASSIFICATION_ENABLED && hourMeterReadingType != null ? { gr_hourmeterreadingtype: hourMeterReadingType } : {}),
                ...(HOUR_METER_CLASSIFICATION_ENABLED && hourMeterRecordedDate ? { gr_hourmeterrecordeddate: hourMeterRecordedDate } : {}),
            }),
        }
    )

    if (!response.ok) {
        throw new Error('Failed to update job status')
    }
    invalidateJobsCache(token)
}

export async function updateJobCardStatus(
    token: string,
    jobId: string,
    status: number,
) {
    const now = new Date().toISOString()
    const timestampField = status === 122830001
        ? 'gr_jobcardsenton'
        : status === 122830002
            ? 'gr_jobcardsubmittedon'
            : status === 122830003
                ? 'gr_jobcardclosedon'
                : null
    const fields: Record<string, string | number> = { gr_jobcardstatus: status }
    if (timestampField) fields[timestampField] = now

    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(fields),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to update job card status: ${error}`)
    }
    invalidateJobsCache(token)
}

export async function updateJobFields(
    token: string,
    jobId: string,
    fields: {
        gr_jobnumber?: string
        gr_description?: string
        gr_ordernumber?: string
        'gr_Mechanic@odata.bind'?: string | null
    }
) {
    if (fields.gr_description != null) assertJobDescriptionLength(fields.gr_description)
    const response = await fetch(
        `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(fields),
        }
    )

    if (!response.ok) {
        throw new Error('Failed to update job')
    }
    invalidateJobsCache(token)
}

export async function allocateJobNumbers(
    token: string,
    allocations: readonly { job: Job; jobNumber: string }[],
) {
    if (!allocations.length) throw new Error('Select one or more Jobs before pasting job numbers.')
    const seenJobIds = new Set<string>()
    const seenNumbers = new Set<string>()
    allocations.forEach(({ job, jobNumber }) => {
        const normalizedNumber = jobNumber.trim()
        if (seenJobIds.has(job.gr_jobid)) throw new Error('A Job was selected more than once.')
        if (!/^\d+$/.test(normalizedNumber)) throw new Error('Each pasted Job number must contain digits only.')
        if (seenNumbers.has(normalizedNumber)) throw new Error('Each pasted Job number must be unique.')
        if (!job['@odata.etag']) throw new Error('Reload the Jobs table before pasting job numbers.')
        seenJobIds.add(job.gr_jobid)
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

    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/$batch`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/mixed; boundary=${batchBoundary}`,
            Accept: 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
        body: lines.join('\r\n'),
    })
    const responseBody = await response.text()
    const statuses = [...responseBody.matchAll(/HTTP\/1\.1\s+(\d{3})/g)].map((match) => Number(match[1]))
    const failure = statuses.find((status) => status >= 400)
    if (!response.ok || failure) {
        if ((failure ?? response.status) === 412) {
            throw new Error('One or more Jobs changed elsewhere. Reload and paste the numbers again.')
        }
        throw new Error('Dataverse rejected the atomic Job number update.')
    }
    if (statuses.filter((status) => status >= 200 && status < 300).length !== allocations.length) {
        throw new Error('Dataverse did not confirm every Job number update.')
    }
    invalidateJobsCache(token)
}

export async function updateJobOfficeAttention(
    token: string,
    jobId: string,
    officeAttentionRequired: boolean,
) {
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ gr_officeattentionrequired: officeAttentionRequired }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to update office attention: ${error}`)
    }
    invalidateJobsCache(token)
}

export async function updateJob(
    token: string,
    jobId: string,
    job: JobSaveInput,
) {
    const fields = buildJobUpdateFields(job)

    const response = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(fields),
        },
    )

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to update job: ${error}`)
    }
    invalidateJobsCache(token)
}

export function buildJobUpdateFields(job: JobSaveInput): Record<string, string | number | boolean | null> {
    assertJobDescriptionLength(job.description)
    const fields: Record<string, string | number | boolean | null> = {
        gr_jobnumber: job.jobNumber,
        gr_ordernumber: job.orderNumber,
        gr_description: job.description,
        gr_jobtype: job.jobType,
        gr_status: job.status,
        gr_servicetype: job.serviceType,
        gr_currentofficeaction: job.currentOfficeAction ?? null,
        gr_officeactionowner: job.officeActionOwner?.trim() || null,
        gr_officeattentionrequired: job.officeAttentionRequired === true,
        gr_hourmeter: job.hourMeter ?? null,
        'gr_Equipment@odata.bind': job.equipmentId
            ? `/gr_equipments(${job.equipmentId})`
            : null,
        'gr_Mechanic@odata.bind': job.mechanicId
            ? `/gr_mechanics(${job.mechanicId})`
            : null,
        'gr_Site@odata.bind': job.siteId
            ? `/gr_sites(${job.siteId})`
            : null,
        'gr_Contact@odata.bind': job.contactId
            ? `/gr_contacts(${job.contactId})`
            : null,
    }
    if (job.completedDate) fields.gr_completeddate = job.completedDate
    if (HOUR_METER_CLASSIFICATION_ENABLED && job.hourMeterReadingType != null) fields.gr_hourmeterreadingtype = job.hourMeterReadingType
    if (HOUR_METER_CLASSIFICATION_ENABLED && job.hourMeterRecordedDate) fields.gr_hourmeterrecordeddate = job.hourMeterRecordedDate
    return fields
}

export async function deleteJob(token: string, jobId: string) {
    const response = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})`,
        {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        },
    )

    if (!response.ok && response.status !== 404) {
        const error = await response.text()
        throw new Error(`Failed to delete job: ${error}`)
    }
    invalidateJobsCache(token)
}
