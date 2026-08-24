import type { JobOfficeUpdate } from '../types/officeAction.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import { buildDataverseIdFilterBatches } from '../../shared/dataverse/boundedDataverseFilters.ts'

const API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`
const select = '$select=gr_jobofficeupdateid,gr_update,createdon,_gr_job_value'
const expand = '$expand=createdby($select=fullname)'

const mapUpdate = (value: Record<string, unknown>): JobOfficeUpdate => ({
    id: String(value.gr_jobofficeupdateid),
    jobId: String(value._gr_job_value),
    text: String(value.gr_update ?? ''),
    createdAt: String(value.createdon),
    createdByName: typeof (value.createdby as { fullname?: unknown } | undefined)?.fullname === 'string'
        ? (value.createdby as { fullname: string }).fullname
        : undefined,
})

async function fetchJobOfficeUpdate(token: string, updateId: string): Promise<JobOfficeUpdate> {
    const response = await fetch(`${API_URL}/gr_jobofficeupdates(${updateId})?${select}&${expand}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Failed to load the created office update: ${await response.text()}`)
    return mapUpdate(await response.json())
}

export async function fetchJobOfficeUpdates(token: string): Promise<JobOfficeUpdate[]> {
    const rows = await fetchAllDataversePages<Record<string, unknown>>(
        `${API_URL}/gr_jobofficeupdates?${select}&${expand}&$orderby=createdon desc`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
        async (response) => {
            if (!response.ok) throw new Error(`Failed to load office updates: ${await response.text()}`)
        },
    )
    return rows.map(mapUpdate)
}

export async function fetchJobOfficeUpdatesForJobs(
    token: string,
    jobIds: readonly string[],
    signal?: AbortSignal,
): Promise<JobOfficeUpdate[]> {
    const filters = buildDataverseIdFilterBatches('_gr_job_value', jobIds)
    if (!filters.length) return []
    const rows: JobOfficeUpdate[] = []
    for (const filter of filters) {
        const values = await fetchAllDataversePages<Record<string, unknown>>(
            `${API_URL}/gr_jobofficeupdates?${select}&${expand}&$filter=${encodeURIComponent(filter)}&$orderby=createdon desc`,
            { signal, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
            async (response) => {
                if (!response.ok) throw new Error(`Failed to load scoped Job office updates: ${await response.text()}`)
            },
        )
        rows.push(...values.map(mapUpdate))
    }
    return rows
}

export async function createJobOfficeUpdate(token: string, input: { jobId: string; jobNumber?: string | null; text: string }): Promise<JobOfficeUpdate> {
    const response = await fetch(`${API_URL}/gr_jobofficeupdates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
            gr_name: `Office Update - ${input.jobNumber || 'Job'}`,
            gr_update: input.text,
            'gr_Job@odata.bind': `/gr_jobs(${input.jobId})`,
        }),
    })
    if (!response.ok) throw new Error(`Failed to create office update: ${await response.text()}`)
    const created = await response.json()
    const updateId = String(created.gr_jobofficeupdateid ?? '')
    if (!updateId) return mapUpdate(created)
    try {
        return await fetchJobOfficeUpdate(token, updateId)
    } catch {
        return mapUpdate(created)
    }
}
