import type {
    JobAssignment,
    JobAssignmentInput,
} from '../types/jobAssignment.types'
import { JOB_CARD_STATUSES, type JobCardStatus } from '../types/jobCardStatus.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`

function headers(token: string, includeContentType = false) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    }
}

async function ensureSuccess(response: Response, action: string) {
    if (response.ok) return
    const responseText = await response.text()
    let detail = responseText
    try {
        const parsed = JSON.parse(responseText)
        detail = parsed.error?.message || responseText
    } catch {
        // Dataverse may return plain text.
    }
    throw new Error(`${action}: ${detail || `${response.status} ${response.statusText}`}`)
}

export async function fetchJobAssignments(token: string): Promise<JobAssignment[]> {
    const query = [
        '$select=gr_jobassignmentid,gr_name,gr_workinstructions,gr_assignedon,gr_jobcardstatus,gr_emailsenton,gr_submittedon,gr_closedon,_gr_job_value',
        '$expand=gr_Mechanic($select=gr_mechanicid,gr_name,gr_phone,gr_email)',
        '$orderby=gr_assignedon desc',
    ].join('&')
    return fetchAllDataversePages<JobAssignment>(`${API_URL}/gr_jobassignments?${query}`, {
        cache: 'no-store',
        headers: headers(token),
    }, (response) => ensureSuccess(response, 'Failed to load technician assignments'))
}

export async function createJobAssignment(
    token: string,
    assignment: JobAssignmentInput,
): Promise<void> {
    const response = await fetch(`${API_URL}/gr_jobassignments`, {
        method: 'POST',
        headers: headers(token, true),
        body: JSON.stringify({
            gr_name: `${assignment.mechanicName} additional assignment`,
            gr_workinstructions: assignment.instructions?.trim() || null,
            gr_assignedon: new Date().toISOString(),
            gr_jobcardstatus: JOB_CARD_STATUSES.NOT_SENT,
            'gr_Job@odata.bind': `/gr_jobs(${assignment.jobId})`,
            'gr_Mechanic@odata.bind': `/gr_mechanics(${assignment.mechanicId})`,
        }),
    })
    await ensureSuccess(response, 'Failed to assign technician')
}

export async function updateJobAssignmentStatus(
    token: string,
    assignmentId: string,
    status: JobCardStatus,
): Promise<void> {
    const timestampField = status === JOB_CARD_STATUSES.SENT
        ? 'gr_emailsenton'
        : status === JOB_CARD_STATUSES.SUBMITTED
            ? 'gr_submittedon'
            : status === JOB_CARD_STATUSES.CLOSED
                ? 'gr_closedon'
                : null
    const fields: Record<string, number | string | null> = { gr_jobcardstatus: status }
    if (timestampField) fields[timestampField] = new Date().toISOString()

    const response = await fetch(`${API_URL}/gr_jobassignments(${assignmentId})`, {
        method: 'PATCH',
        headers: headers(token, true),
        body: JSON.stringify(fields),
    })
    await ensureSuccess(response, 'Failed to update assignment status')
}

export async function deleteJobAssignment(token: string, assignmentId: string): Promise<void> {
    const response = await fetch(`${API_URL}/gr_jobassignments(${assignmentId})`, {
        method: 'DELETE',
        headers: headers(token),
    })
    await ensureSuccess(response, 'Failed to remove technician assignment')
}
