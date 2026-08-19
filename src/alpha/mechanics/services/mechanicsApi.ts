import type { Mechanic } from '../../jobs/types/mechanic.types'
import { fetchAllDataversePages, type DataverseCollectionPage } from '../../shared/dataverse/fetchAllDataversePages.ts'

const API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`

export type MechanicInput = {
    name: string
    phone: string
    email: string
    camNumber: string
    rego: string
    region: string
    department: number
    jobAssignmentEnabled: boolean
    customerEmailCcEnabled: boolean
}

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
        // Dataverse occasionally returns plain text.
    }
    throw new Error(`${action}: ${detail || `${response.status} ${response.statusText}`}`)
}

export async function fetchMechanics(token: string): Promise<Mechanic[]> {
    const baseUrl = `${API_URL}/gr_mechanics?`
    let response = await fetch(
        `${baseUrl}$select=gr_mechanicid,gr_name,gr_phone,gr_email,gr_camnumber,gr_rego,gr_region,gr_department,gr_jobassignmentenabled,gr_customeremailccenabled,statecode&$orderby=gr_name asc`,
        { cache: 'no-store', headers: headers(token) },
    )
    if (response.status === 400) {
        response = await fetch(
            `${baseUrl}$select=gr_mechanicid,gr_name,gr_phone,gr_email,gr_camnumber,gr_rego,gr_region,gr_department,gr_jobassignmentenabled,statecode&$orderby=gr_name asc`,
            { cache: 'no-store', headers: headers(token) },
        )
        if (response.status === 400) {
            response = await fetch(
                `${baseUrl}$select=gr_mechanicid,gr_name,gr_phone,gr_email,gr_camnumber,gr_rego,gr_region,statecode&$orderby=gr_name asc`,
                { cache: 'no-store', headers: headers(token) },
            )
        }
    }
    await ensureSuccess(response, 'Failed to load staff')
    const firstPage = await response.json() as DataverseCollectionPage<Mechanic>
    const remaining = firstPage['@odata.nextLink']
        ? await fetchAllDataversePages<Mechanic>(
            firstPage['@odata.nextLink'],
            { cache: 'no-store', headers: headers(token) },
            (nextResponse) => ensureSuccess(nextResponse, 'Failed to load staff'),
        )
        : []
    return [...(firstPage.value ?? []), ...remaining]
}

export async function createMechanic(token: string, mechanic: MechanicInput): Promise<Mechanic> {
    const response = await fetch(`${API_URL}/gr_mechanics`, {
        method: 'POST',
        headers: { ...headers(token, true), Prefer: 'return=representation' },
        body: JSON.stringify({
            gr_name: mechanic.name.trim(),
            gr_phone: mechanic.phone.trim() || null,
            gr_email: mechanic.email.trim() || null,
            gr_camnumber: mechanic.camNumber.trim() || null,
            gr_rego: mechanic.rego.trim().replace(/\s+/g, ' ') || null,
            gr_region: mechanic.region.trim() || null,
            gr_department: mechanic.department,
            gr_jobassignmentenabled: mechanic.jobAssignmentEnabled,
            gr_customeremailccenabled: mechanic.customerEmailCcEnabled,
        }),
    })
    await ensureSuccess(response, 'Failed to create staff member')
    return response.json()
}

export async function updateMechanic(
    token: string,
    mechanicId: string,
    mechanic: MechanicInput,
): Promise<void> {
    const response = await fetch(`${API_URL}/gr_mechanics(${mechanicId})`, {
        method: 'PATCH',
        headers: headers(token, true),
        body: JSON.stringify({
            gr_name: mechanic.name.trim(),
            gr_phone: mechanic.phone.trim() || null,
            gr_email: mechanic.email.trim() || null,
            gr_camnumber: mechanic.camNumber.trim() || null,
            gr_rego: mechanic.rego.trim().replace(/\s+/g, ' ') || null,
            gr_region: mechanic.region.trim() || null,
            gr_department: mechanic.department,
            gr_jobassignmentenabled: mechanic.jobAssignmentEnabled,
            gr_customeremailccenabled: mechanic.customerEmailCcEnabled,
        }),
    })
    await ensureSuccess(response, 'Failed to update staff member')
}

export async function setMechanicActive(
    token: string,
    mechanicId: string,
    active: boolean,
): Promise<void> {
    const response = await fetch(`${API_URL}/gr_mechanics(${mechanicId})`, {
        method: 'PATCH',
        headers: headers(token, true),
        body: JSON.stringify({ statecode: active ? 0 : 1, statuscode: active ? 1 : 2 }),
    })
    await ensureSuccess(response, `Failed to ${active ? 'activate' : 'deactivate'} staff member`)
}
