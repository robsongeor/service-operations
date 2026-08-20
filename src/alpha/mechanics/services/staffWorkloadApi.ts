import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types.ts'
import type { Job } from '../../jobs/types/job.types.ts'

const API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`

type OpenJobAllocation = Pick<Job, 'gr_jobid' | 'gr_status'> & {
    _gr_mechanic_value?: string | null
}

export type StaffJobView = 'open' | 'complete' | 'all'

function requestInit(token: string, signal?: AbortSignal): RequestInit {
    return {
        cache: 'no-store',
        signal,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
            Prefer: 'odata.maxpagesize=5000',
        },
    }
}

async function ensureSuccess(response: Response, action: string) {
    if (response.ok) return
    const detail = await response.text()
    throw new Error(`${action}: ${detail || `${response.status} ${response.statusText}`}`)
}

export async function fetchStaffOpenJobCounts(token: string, signal?: AbortSignal): Promise<Record<string, number>> {
    const filter = `gr_status ne ${JOB_STATUSES.COMPLETE} and _gr_mechanic_value ne null`
    const rows = await fetchAllDataversePages<OpenJobAllocation>(
        `${API_URL}/gr_jobs?$select=gr_jobid,gr_status,_gr_mechanic_value&$filter=${encodeURIComponent(filter)}`,
        requestInit(token, signal),
        (response) => ensureSuccess(response, 'Failed to load Staff Job allocations'),
    )
    return rows.reduce<Record<string, number>>((counts, row) => {
        const mechanicId = row._gr_mechanic_value?.toLowerCase()
        if (mechanicId) counts[mechanicId] = (counts[mechanicId] ?? 0) + 1
        return counts
    }, {})
}

export async function fetchStaffJobs(
    token: string,
    mechanicId: string,
    view: StaffJobView,
    signal?: AbortSignal,
): Promise<Job[]> {
    const statusFilter = view === 'open'
        ? ` and gr_status ne ${JOB_STATUSES.COMPLETE}`
        : view === 'complete'
            ? ` and gr_status eq ${JOB_STATUSES.COMPLETE}`
            : ''
    const filter = `_gr_mechanic_value eq ${mechanicId}${statusFilter}`
    const select = 'gr_jobid,createdon,gr_jobnumber,gr_status,gr_ordernumber,gr_description,gr_jobtype'
    const expand = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_customerid,gr_name))'
    return fetchAllDataversePages<Job>(
        `${API_URL}/gr_jobs?$select=${select}&$expand=${expand}&$filter=${encodeURIComponent(filter)}&$orderby=createdon desc`,
        requestInit(token, signal),
        (response) => ensureSuccess(response, 'Failed to load this Staff member’s Jobs'),
    )
}
