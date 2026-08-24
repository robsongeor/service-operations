import { fetchAllDataversePages } from '../shared/dataverse/fetchAllDataversePages.ts'
import type { Job } from '../jobs/types/job.types.ts'
import type { JobStatus } from '../jobs/types/jobStatus.types.ts'
import { JOB_MAP_STATUSES } from './jobMap.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''
const JOB_MAP_SELECT = 'gr_jobid,createdon,gr_jobnumber,gr_status,gr_description'
const JOB_MAP_EXPAND = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_siteid,gr_name,gr_address,gr_geocodelatitude,gr_geocodelongitude,gr_geocodesourceaddress,gr_geocodeformattedaddress,gr_geocoderesolvedon;$expand=gr_Customer($select=gr_customerid,gr_name))'

export function canonicalJobMapStatuses(statuses: readonly JobStatus[]): JobStatus[] {
    const requested = new Set(statuses)
    return JOB_MAP_STATUSES.filter((status) => requested.has(status))
}

export async function fetchJobMapJobs(
    accessToken: string,
    statuses: readonly JobStatus[],
    signal?: AbortSignal,
): Promise<Job[]> {
    const canonicalStatuses = canonicalJobMapStatuses(statuses)
    if (!canonicalStatuses.length) return []
    const statusFilter = canonicalStatuses.map((status) => `gr_status eq ${status}`).join(' or ')
    return fetchAllDataversePages<Job>(
        `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${JOB_MAP_SELECT}&$expand=${JOB_MAP_EXPAND}&$filter=${encodeURIComponent(`(${statusFilter})`)}&$orderby=createdon desc`,
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
                throw new Error(`Failed to fetch Job Map locations: ${detail || `${response.status} ${response.statusText}`}`)
            }
        },
    )
}
