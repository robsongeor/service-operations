import type { Job } from '../types/job.types.ts'
import type { JobSaveInput } from '../types/jobSave.types.ts'
import { assertJobTypeAllowedForCreation, type JobCreationSource } from '../types/jobType.types.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''

function blobDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('A Job photo could not be read.'))
        reader.readAsDataURL(blob)
    })
}

export async function fetchJobPhotos(accessToken: string, jobId: string): Promise<NonNullable<Job['jobPhotos']>> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const metadata = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,gr_filename,gr_uploadedon,gr_displayorder,_gr_job_value&$filter=_gr_job_value eq ${jobId}&$orderby=gr_displayorder asc`,
        { cache: 'no-store', headers },
    )
    if (!metadata.ok) return []
    const rows = (await metadata.json()).value ?? []
    return Promise.all(rows.map(async (row: Record<string, unknown>) => {
        const id = String(row.gr_jobphotoid)
        const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobphotos(${id})/gr_photo/$value`, {
            cache: 'no-store',
            headers,
        })
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

export async function fetchJobs(accessToken: string): Promise<Job[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=gr_jobid,createdon,gr_jobnumber,gr_status,gr_ordernumber,gr_description,gr_jobtype,gr_jobcardstatus,gr_jobcardsenton,gr_jobcardsubmittedon,gr_jobcardclosedon,gr_hourmeter,gr_completeddate,gr_servicetype,gr_currentofficeaction,gr_officeactionowner,gr_officeattentionrequired,gr_techniciansubmissiontokenhash,gr_techniciansubmissiontokencreatedon,gr_techniciansubmissiontokenexpireson,gr_techniciansubmissiontokenused,gr_techniciansubmissionsubmittedon,gr_techniciansubmissionhourmeter,gr_techniciansubmissionstory,_gr_sitecheck_value&$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial,gr_currenthourmeter,gr_currenthourmeterrecordeddate,gr_servicetrackingenabled),gr_Mechanic($select=gr_mechanicid,gr_name,gr_phone,gr_email),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)`,
        {
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
            },
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(`Failed to fetch jobs: ${error}`)
    }

    const data = await result.json()
    const jobs = (data.value ?? []) as Job[]
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
    }
    const [metadataResult, timeResult, partsResult] = await Promise.allSettled([
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=gr_jobid,gr_techniciansubmissionfurtherworkrequired,gr_techniciansubmissionfurtherworkdetails,gr_techniciansubmissionsafetyissueidentified,gr_techniciansubmissionsafetyissuedetails`, { cache: 'no-store', headers }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobcardsubmissiontimeentries?$select=gr_jobcardsubmissiontimeentryid,gr_entrydate,gr_totalhours,gr_kilometres,_gr_job_value&$orderby=gr_entrydate asc`, { cache: 'no-store', headers }),
        fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobmaterials?$select=gr_jobmaterialid,gr_material,_gr_job_value&$orderby=gr_displayorder asc`, { cache: 'no-store', headers }),
    ])
    const readValues = async (settled: PromiseSettledResult<Response>) => {
        if (settled.status !== 'fulfilled' || !settled.value.ok) return []
        return (await settled.value.json()).value ?? []
    }
    const [metadata, timeEntries, parts] = await Promise.all([
        readValues(metadataResult),
        readValues(timeResult),
        readValues(partsResult),
    ])
    const metadataByJob = new Map<string, Partial<Job>>(
        metadata.map((item: Record<string, unknown>) => [String(item.gr_jobid), item as Partial<Job>]),
    )
    return jobs.map((job) => ({
        ...job,
        ...metadataByJob.get(job.gr_jobid),
        technicianSubmissionTimeEntries: timeEntries
            .filter((item: Record<string, unknown>) => String(item._gr_job_value).toLowerCase() === job.gr_jobid.toLowerCase())
            .map((item: Record<string, unknown>) => ({
                id: String(item.gr_jobcardsubmissiontimeentryid),
                date: String(item.gr_entrydate),
                hours: Number(item.gr_totalhours),
                kilometres: Number(item.gr_kilometres),
            })),
        technicianSubmissionParts: parts
            .filter((item: Record<string, unknown>) => String(item._gr_job_value).toLowerCase() === job.gr_jobid.toLowerCase())
            .map((item: Record<string, unknown>) => ({
                id: String(item.gr_jobmaterialid),
                part: String(item.gr_material),
            })),
    }))
}

export function buildJobCreatePayload(
    job: JobSaveInput,
    source: JobCreationSource = 'standard',
) {
    assertJobTypeAllowedForCreation(job.jobType, source)
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
    if (job.completedDate) newJob.gr_completeddate = job.completedDate
    return newJob
}

export async function createJob(
    accessToken: string,
    job: JobSaveInput,
    source: JobCreationSource = 'standard',
): Promise<string> {
    const newJob = buildJobCreatePayload(job, source)
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
    return createdJob.gr_jobid
}

export async function updateJobStatus(
    token: string,
    jobId: string,
    status: number,
    completedDate?: string,
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
            }),
        }
    )

    if (!response.ok) {
        throw new Error('Failed to update job status')
    }
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
}

export function buildJobUpdateFields(job: JobSaveInput): Record<string, string | number | boolean | null> {
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
}
