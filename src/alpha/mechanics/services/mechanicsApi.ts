import type { Mechanic } from '../../jobs/types/mechanic.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`

export type MechanicInput = {
    name: string
    phone: string
    email: string
    camNumber: string
    rego: string
    region: string
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
    const response = await fetch(
        `${API_URL}/gr_mechanics?$select=gr_mechanicid,gr_name,gr_phone,gr_email,gr_camnumber,gr_rego,gr_region,statecode&$orderby=gr_name asc`,
        { cache: 'no-store', headers: headers(token) },
    )
    await ensureSuccess(response, 'Failed to load mechanics')
    const data = await response.json()
    return data.value ?? []
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
        }),
    })
    await ensureSuccess(response, 'Failed to create mechanic')
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
        }),
    })
    await ensureSuccess(response, 'Failed to update mechanic')
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
    await ensureSuccess(response, `Failed to ${active ? 'activate' : 'deactivate'} mechanic`)
}
