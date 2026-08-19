import type {
    JobScheduleOption,
    JobScheduleOptionInput,
} from '../types/jobSchedule.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const SCHEDULE_OPTIONS_URL =
    `${DATAVERSE_URL}/api/data/v9.2/gr_jobscheduleoptions`

const scheduleTypeLabels: Record<JobScheduleOptionInput['scheduleType'], string> = {
    122830000: 'Week',
    122830001: 'Any time',
    122830002: 'Morning',
    122830003: 'After time',
    122830004: 'Exact time',
}

function scheduleOptionBody(option: JobScheduleOptionInput) {
    return {
        gr_name: `${scheduleTypeLabels[option.scheduleType]} - ${option.scheduleDate}`,
        gr_scheduletype: option.scheduleType,
        gr_scheduledate: option.scheduleDate,
        gr_scheduletime: option.scheduleTime || null,
        gr_confirmed: option.confirmed,
        'gr_Job@odata.bind': `/gr_jobs(${option.jobId})`,
    }
}

export async function fetchJobScheduleOptions(
    accessToken: string,
): Promise<JobScheduleOption[]> {
    return fetchAllDataversePages<JobScheduleOption>(
        `${SCHEDULE_OPTIONS_URL}?$select=gr_jobscheduleoptionid,gr_name,gr_scheduletype,gr_scheduledate,gr_scheduletime,gr_confirmed,_gr_job_value`,
        {
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
                'Cache-Control': 'no-cache',
            },
        },
        async (response) => {
            if (response.ok) return
            const error = await response.text()
            throw new Error(`Failed to fetch job schedule options: ${error}`)
        },
    )
}

export async function createJobScheduleOption(
    accessToken: string,
    option: JobScheduleOptionInput,
): Promise<void> {
    const response = await fetch(SCHEDULE_OPTIONS_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(scheduleOptionBody(option)),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to create job schedule option: ${error}`)
    }
}

export async function updateJobScheduleOption(
    accessToken: string,
    optionId: string,
    option: JobScheduleOptionInput,
): Promise<void> {
    const response = await fetch(`${SCHEDULE_OPTIONS_URL}(${optionId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(scheduleOptionBody(option)),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to update job schedule option: ${error}`)
    }
}

export async function updateJobScheduleConfirmation(
    accessToken: string,
    optionId: string,
    confirmed: boolean,
): Promise<void> {
    const response = await fetch(`${SCHEDULE_OPTIONS_URL}(${optionId})`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ gr_confirmed: confirmed }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to update schedule confirmation: ${error}`)
    }
}

export async function deleteJobScheduleOption(
    accessToken: string,
    optionId: string,
): Promise<void> {
    const response = await fetch(`${SCHEDULE_OPTIONS_URL}(${optionId})`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    })

    if (!response.ok && response.status !== 404) {
        const error = await response.text()
        throw new Error(`Failed to delete job schedule option: ${error}`)
    }
}
