import type { Job } from '../types/job.types'
import type { JobSaveInput } from '../types/jobSave.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchJobs(accessToken: string): Promise<Job[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=gr_jobid,createdon,gr_jobnumber,gr_status,gr_ordernumber,gr_description,gr_jobtype,gr_jobcardstatus,gr_jobcardsenton,gr_jobcardsubmittedon,gr_jobcardclosedon,gr_hourmeter,gr_completeddate,gr_servicetype&$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial,gr_currenthourmeter,gr_servicetrackingenabled),gr_Mechanic($select=gr_mechanicid,gr_name,gr_phone,gr_email),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)`,
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
    return data.value ?? []
}

export async function createJob(
    accessToken: string,
    job: JobSaveInput,
): Promise<string> {
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
    if (job.hourMeter != null) newJob.gr_hourmeter = job.hourMeter
    if (job.completedDate) newJob.gr_completeddate = job.completedDate

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

export async function updateJob(
    token: string,
    jobId: string,
    job: JobSaveInput,
) {
    const fields: Record<string, string | number | null> = {
        gr_jobnumber: job.jobNumber,
        gr_ordernumber: job.orderNumber,
        gr_description: job.description,
        gr_jobtype: job.jobType,
        gr_status: job.status,
        gr_servicetype: job.serviceType,
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

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to delete job: ${error}`)
    }
}
