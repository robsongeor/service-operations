import type { JobOfficeUpdate } from '../types/officeAction.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`
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

export async function fetchJobOfficeUpdates(token: string): Promise<JobOfficeUpdate[]> {
    const response = await fetch(`${API_URL}/gr_jobofficeupdates?${select}&${expand}&$orderby=createdon desc`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Failed to load office updates: ${await response.text()}`)
    const data = await response.json()
    return (data.value ?? []).map(mapUpdate)
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
    return mapUpdate(await response.json())
}
