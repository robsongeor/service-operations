import type { Job } from '../types/job.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

export async function fetchJobs(accessToken: string): Promise<Job[]> {
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=gr_jobid,gr_jobnumber,gr_status,gr_ordernumber,gr_description&$expand=gr_Equipment($select=gr_fleet,gr_make,gr_model,gr_serial),gr_Mechanic($select=gr_name), gr_Site($select=gr_name,gr_address;$expand=gr_Customer($select=gr_name)),gr_Contact($select=gr_name,gr_phone,gr_email)`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        },
    )

    const data = await result.json()
    return data.value ?? []
}

export async function createJob(
    accessToken: string,
    job: {
        jobNumber: string
        orderNumber: string
        description: string
        equipmentId?: string
        mechanicId?: string
        siteId?: string
        contactId?: string
    }
) {
    const newJob: Record<string, string> = {
        gr_jobnumber: job.jobNumber,
        gr_ordernumber: job.orderNumber,
        gr_description: job.description,
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

    const result = await fetch(
        `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2/gr_jobs`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(newJob),
        },
    )

    if (!result.ok) {
        const error = await result.text()
        throw new Error(error)
    }
}

export async function updateJobStatus(
    token: string,
    jobId: string,
    status: number
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
            }),
        }
    )

    if (!response.ok) {
        throw new Error('Failed to update job status')
    }
}