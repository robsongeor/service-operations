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
import { assertJobCreationLocation } from '../domain/jobCreationLocation.ts'
import { assertJobCanBeDeleted, assertJobCanReceiveNumber, requireJobNumberEtag, requireJobNumberRecordId, validateImportedJobNumber } from '../domain/jobNumberPolicy.ts'
import { readJobNumberForDeletion, verifyUnnumberedJobs } from './jobNumberGuard.ts'
import { fetchLocationSite } from './sitesApi.ts'
import type { JobCardSubmission } from '../types/jobCardSubmission.types.ts'
import { invalidateOperationalQueries } from '../../shared/data/OperationalDataClient.ts'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { buildDataverseIdFilterBatches } from '../../shared/dataverse/boundedDataverseFilters.ts'
import { usesAzureJobCards } from '../types/jobCardWorkflow.ts'
import { UNIFIED_JOB_WALKTHROUGH, UNIFIED_JOB_SELECT } from '../domain/unifiedJobWorkflow.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''
const HOUR_METER_READING_SELECT = HOUR_METER_CLASSIFICATION_ENABLED ? ',gr_hourmeterreadingtype,gr_hourmeterrecordeddate' : ''
const JOB_SELECT = `gr_jobid,createdon,gr_jobnumber,gr_status,gr_ordernumber,gr_description,gr_jobtype,gr_jobcardstatus,gr_jobcardsenton,gr_jobcardsubmittedon,gr_jobcardclosedon,gr_hourmeter${HOUR_METER_READING_SELECT},gr_completeddate,gr_servicetype,gr_currentofficeaction,gr_officeactionowner,gr_officeattentionrequired,gr_techniciansubmissiontokenhash,gr_techniciansubmissiontokencreatedon,gr_techniciansubmissiontokenexpireson,gr_techniciansubmissiontokenused,gr_techniciansubmissionsubmittedon,gr_techniciansubmissionhourmeter,gr_techniciansubmissionstory,gr_techniciansubmissionfurtherworkrequired,gr_techniciansubmissionfurtherworkdetails,gr_techniciansubmissionsafetyissueidentified,gr_techniciansubmissionsafetyissuedetails,_gr_sitecheck_value${UNIFIED_JOB_WALKTHROUGH ? UNIFIED_JOB_SELECT : ''}`
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

async function evidenceRows(response: Response, accessToken: string, strict: boolean, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
    if (!response.ok) {
        if (strict) throw new Error('Historical Job Card evidence could not be loaded completely.')
        return []
    }
    const data = await response.json() as { value?: Record<string, unknown>[]; '@odata.nextLink'?: string }
    const rows = data.value ?? []
    let next = data['@odata.nextLink']
    const seen = new Set<string>()
    while (strict && next) {
        if (seen.has(next) || !DATAVERSE_URL || !next.startsWith(`${DATAVERSE_URL.replace(/\/$/, '')}/api/data/`)) throw new Error('Historical evidence paging could not be verified.')
        seen.add(next)
        const page = await fetch(next, { cache: 'no-store', signal, headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } })
        if (!page.ok) throw new Error('Historical Job Card evidence could not be loaded completely.')
        const body = await page.json() as typeof data
        rows.push(...(body.value ?? []))
        next = body['@odata.nextLink']
    }
    return rows
}

export async function fetchJobPhotoMetadata(accessToken: string, jobId: string, signal?: AbortSignal): Promise<NonNullable<Job['jobPhotos']>> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const metadata = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,gr_filename,gr_uploadedon,gr_displayorder,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_displayorder asc`,
        { cache: 'no-store', headers, signal },
    )
    if (!metadata.ok) return []
    const rows = await evidenceRows(metadata, accessToken, false, signal)
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

export async function fetchJobPhotos(accessToken: string, jobId: string, strict = false, signal?: AbortSignal): Promise<NonNullable<Job['jobPhotos']>> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const metadata = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,gr_filename,gr_uploadedon,gr_displayorder,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_displayorder asc`,
        { cache: 'no-store', headers, signal },
    )
    if (!metadata.ok) {
        if (strict) throw new Error('Historical Job photos could not be loaded.')
        return []
    }
    const rows = await evidenceRows(metadata, accessToken, strict, signal)
    return Promise.all(rows.map(async (row: Record<string, unknown>) => {
        const id = String(row.gr_jobphotoid)
        const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos(${id})/gr_photo/$value`, { cache: 'no-store', headers, signal })
        if (!response.ok) throw new Error('A Job photo could not be loaded.')
        return {
            id,
            fileName: String(row.gr_filename || 'Job photo'),
            uploadedOn: String(row.gr_uploadedon || ''),
            displayOrder: Number(row.gr_displayorder || 0),
            previewUrl: await blobDataUrl(await response.blob()),
        }
    }))
}

type JobCardSubmissionLoadOptions = {
    strict?: boolean
    signal?: AbortSignal
    includePhotoBodies?: boolean
}

async function fetchJobCardSubmissions(accessToken: string, jobId: string, options: JobCardSubmissionLoadOptions = {}): Promise<JobCardSubmission[]> {
    const { strict = false, signal, includePhotoBodies = false } = options
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const submissionResult = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobcardsubmissions?$select=gr_jobcardsubmissionid,gr_name,gr_recipientname,gr_recipientemail,gr_role,gr_status,gr_required,gr_emailsenton,gr_submittedon,gr_closedon,gr_hourmeter,gr_story,gr_furtherworkrequired,gr_furtherworkdetails,gr_safetyissueidentified,gr_safetyissuedetails,gr_islegacy,_gr_job_value,_gr_mechanic_value,_gr_jobassignment_value&$filter=_gr_job_value eq ${jobId}&$orderby=createdon asc`,
        { cache: 'no-store', headers, signal },
    )
    // The fallback keeps the app usable during the schema-first rollout.
    if (submissionResult.status === 404 && !strict) return []
    if (!submissionResult.ok) throw new Error('The Job Card submissions could not be loaded.')
    const submissions = await evidenceRows(submissionResult, accessToken, strict, signal)
    if (!submissions.length) return []

    const ids = submissions.map((item) => String(item.gr_jobcardsubmissionid))
    const submissionFilter = ids.map((id) => `_gr_jobcardsubmission_value eq ${id}`).join(' or ')
    const [timeResult, partsResult, photoResult] = await Promise.all([
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobcardsubmissiontimeentries?$select=gr_jobcardsubmissiontimeentryid,gr_entrydate,gr_totalhours,gr_kilometres,_gr_jobcardsubmission_value&$filter=${encodeURIComponent(submissionFilter)}&$orderby=gr_entrydate asc`, { cache: 'no-store', headers, signal }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobmaterials?$select=gr_jobmaterialid,gr_material,gr_quantity,_gr_jobcardsubmission_value&$filter=${encodeURIComponent(submissionFilter)}&$orderby=gr_displayorder asc`, { cache: 'no-store', headers, signal }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,gr_filename,gr_uploadedon,gr_displayorder,_gr_jobcardsubmission_value&$filter=${encodeURIComponent(submissionFilter)}&$orderby=gr_displayorder asc`, { cache: 'no-store', headers, signal }),
    ])
    if (strict && [timeResult, partsResult, photoResult].some((result) => !result.ok)) throw new Error('Historical Job Card evidence could not be loaded completely.')
    const [timeRows, partRows, photoRows] = await Promise.all([timeResult, partsResult, photoResult].map((result) => evidenceRows(result, accessToken, strict, signal)))
    const photos = await Promise.all(photoRows.map(async (row) => {
        const id = String(row.gr_jobphotoid)
        const previewUrl = includePhotoBodies ? await fetchJobPhotoBody(accessToken, id, signal) : undefined
        return {
            submissionId: String(row._gr_jobcardsubmission_value),
            id,
            fileName: String(row.gr_filename || 'Job photo'),
            uploadedOn: String(row.gr_uploadedon || ''),
            displayOrder: Number(row.gr_displayorder || 0),
            previewUrl,
        }
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
                previewUrl: photo.previewUrl,
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
        fetchJobCardSubmissions(accessToken, jobId, { signal }),
    ])
    const [timeEntries, parts] = await Promise.all([
        evidenceRows(timeResult, accessToken, false, signal),
        evidenceRows(partsResult, accessToken, false, signal),
    ])
    return mapJobCardEvidence(timeEntries, parts, photos, submissions)
}

export type HistoricalJobCardEvidence = Pick<Job, 'technicianSubmissionTimeEntries' | 'technicianSubmissionParts' | 'jobPhotos' | 'jobCardSubmissions'>

export async function fetchHistoricalJobCardEvidence(accessToken: string, jobId: string, strict = true): Promise<HistoricalJobCardEvidence> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-cache' }
    const [timeResult, partsResult, photos, submissions] = await Promise.all([
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobcardsubmissiontimeentries?$select=gr_jobcardsubmissiontimeentryid,gr_entrydate,gr_totalhours,gr_kilometres,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_entrydate asc`, { cache: 'no-store', headers }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobmaterials?$select=gr_jobmaterialid,gr_material,gr_quantity,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_displayorder asc`, { cache: 'no-store', headers }),
        fetchJobPhotos(accessToken, jobId, strict),
        fetchJobCardSubmissions(accessToken, jobId, { strict, includePhotoBodies: true }),
    ])
    if (strict && (!timeResult.ok || !partsResult.ok)) throw new Error('Historical Job Card evidence could not be loaded completely.')
    const [timeEntries, parts] = await Promise.all([timeResult, partsResult].map((result) => evidenceRows(result, accessToken, strict)))
    return mapJobCardEvidence(timeEntries, parts, photos, submissions)
}

function mapJobCardEvidence(
    timeEntries: Record<string, unknown>[],
    parts: Record<string, unknown>[],
    photos: NonNullable<Job['jobPhotos']>,
    submissions: JobCardSubmission[],
): HistoricalJobCardEvidence {
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
    const job = await fetchJobCore(accessToken, jobId, signal)
    if (!job || usesAzureJobCards(job)) return job
    return { ...job, ...await fetchJobCardDetails(accessToken, jobId, signal) }
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
    if (!job.equipmentId?.trim()) {
        // Reuse the exact Site reader; a stale dropdown must not save an incomplete location.
        const site = job.siteId?.trim() ? await fetchLocationSite(accessToken, job.siteId) : undefined
        assertJobCreationLocation({
            customerId: site?.gr_Customer?.gr_customerid,
            siteId: site?.gr_siteid,
            address: site?.gr_address,
        })
    }
    await assertJobNumberAvailable(accessToken, job.jobNumber)
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs`,
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

export function buildJobCreateChangeSet(
    jobs: readonly JobSaveInput[],
    requestId: string = crypto.randomUUID(),
) {
    if (!jobs.length) throw new Error('Select at least one ready Job to import.')
    if (jobs.length > 500) throw new Error('Import no more than 500 Jobs at once.')
    const numbers = jobs.map((job) => job.jobNumber.trim())
    if (numbers.some((jobNumber) => !/^\d+$/.test(jobNumber))) {
        throw new Error('Every imported Job Number must contain digits only.')
    }
    if (new Set(numbers).size !== numbers.length) {
        throw new Error('Every imported Job Number must be unique.')
    }

    const suffix = requestId.replaceAll('-', '')
    const batchBoundary = `batch_job_import_${suffix}`
    const changeBoundary = `changeset_job_import_${suffix}`
    const lines = [
        `--${batchBoundary}`,
        `Content-Type: multipart/mixed; boundary=${changeBoundary}`,
        '',
    ]
    jobs.forEach((job, index) => lines.push(
        `--${changeBoundary}`,
        'Content-Type: application/http',
        'Content-Transfer-Encoding: binary',
        `Content-ID: ${index + 1}`,
        '',
        'POST /api/data/v9.2/gr_jobs HTTP/1.1',
        'Accept: application/json',
        'Content-Type: application/json; type=entry',
        'Prefer: return=minimal',
        '',
        JSON.stringify(buildJobCreatePayload(job)),
        '',
    ))
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')
    return {
        body: lines.join('\r\n'),
        contentType: `multipart/mixed; boundary=${batchBoundary}`,
        operationCount: jobs.length,
    }
}

async function findExistingJobNumbers(accessToken: string, jobNumbers: readonly string[]) {
    const existing = new Set<string>()
    for (let start = 0; start < jobNumbers.length; start += 50) {
        const values = jobNumbers.slice(start, start + 50)
        const filter = values.map((value) => `gr_jobnumber eq '${escapeODataString(value.trim())}'`).join(' or ')
        const query = new URLSearchParams({ '$select': 'gr_jobnumber', '$filter': filter, '$top': String(values.length) })
        const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs?${query}`, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        })
        if (!response.ok) throw new Error('The imported Job Numbers could not be checked. No Jobs were created.')
        const result = await response.json() as { value?: Array<{ gr_jobnumber?: string | null }> }
        result.value?.forEach((job) => { if (job.gr_jobnumber) existing.add(job.gr_jobnumber.trim()) })
    }
    return existing
}

export async function createJobsAtomically(accessToken: string, jobs: readonly JobSaveInput[]) {
    const batch = buildJobCreateChangeSet(jobs)
    const existing = await findExistingJobNumbers(accessToken, jobs.map((job) => job.jobNumber))
    if (existing.size) {
        throw new Error(`Job Number${existing.size === 1 ? '' : 's'} ${[...existing].sort().join(', ')} already exist${existing.size === 1 ? 's' : ''}. No Jobs were created.`)
    }
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/$batch`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': batch.contentType,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
        body: batch.body,
    })
    const responseBody = await response.text()
    const statuses = [...responseBody.matchAll(/HTTP\/1\.1\s+(\d{3})/g)].map((match) => Number(match[1]))
    const failed = statuses.find((status) => status >= 400)
    if (!response.ok || failed) {
        throw new Error('Dataverse rejected the atomic Job import. No Jobs were created.')
    }
    if (statuses.filter((status) => status >= 200 && status < 300).length !== batch.operationCount) {
        throw new Error('Dataverse did not confirm every imported Job. Refresh Jobs before retrying.')
    }
    invalidateJobsCache(accessToken)
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
        gr_description?: string
        gr_ordernumber?: string
        'gr_Mechanic@odata.bind'?: string | null
    }
) {
    if (Object.hasOwn(fields, 'gr_jobnumber')) {
        throw new Error('Job numbers must be allocated separately and cannot be changed by editing a Job.')
    }
    if (fields.gr_description != null) assertJobDescriptionLength(fields.gr_description)
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
    if (allocations.length > 100) throw new Error('Allocate numbers to at most 100 Jobs at a time.')
    // Keep the displayed version stable across preflight, even if the caller refreshes its rows.
    const requested = allocations.map(({ job, jobNumber }) => ({
        job: { gr_jobid: job.gr_jobid, gr_jobnumber: job.gr_jobnumber, '@odata.etag': job['@odata.etag'] },
        jobNumber,
    }))
    const seenJobIds = new Set<string>()
    const seenNumbers = new Set<string>()
    requested.forEach(({ job, jobNumber }) => {
        const jobId = requireJobNumberRecordId(job.gr_jobid)
        const normalizedNumber = validateImportedJobNumber(jobNumber)
        assertJobCanReceiveNumber(job)
        if (seenJobIds.has(jobId)) throw new Error('A Job was selected more than once.')
        if (seenNumbers.has(normalizedNumber)) throw new Error('Each pasted Job number must be unique.')
        requireJobNumberEtag(job)
        seenJobIds.add(jobId)
        seenNumbers.add(normalizedNumber)
    })

    await verifyUnnumberedJobs(token, `${DATAVERSE_URL}/api/data/v9.2`, requested.map(({ job }) => job))

    const suffix = crypto.randomUUID().replaceAll('-', '')
    const batchBoundary = `batch_${suffix}`
    const changeBoundary = `changeset_${suffix}`
    const lines = [
        `--${batchBoundary}`,
        `Content-Type: multipart/mixed; boundary=${changeBoundary}`,
        '',
    ]
    requested.forEach(({ job, jobNumber }, index) => {
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
    if (statuses.filter((status) => status >= 200 && status < 300).length !== requested.length) {
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
    const current = await readJobNumberForDeletion(token, `${DATAVERSE_URL}/api/data/v9.2`, jobId)
    if (!current) {
        invalidateJobsCache(token)
        return
    }
    assertJobCanBeDeleted(current)
    const response = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})`,
        {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'If-Match': requireJobNumberEtag(current),
            },
        },
    )

    if (response.status === 412) {
        throw new Error('The Job changed or received a number elsewhere. Reload before trying again. Nothing was deleted.')
    }
    if (!response.ok && response.status !== 404) {
        const error = await response.text()
        throw new Error(`Failed to delete job: ${error}`)
    }
    invalidateJobsCache(token)
}
