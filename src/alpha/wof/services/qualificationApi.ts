import type { QualificationType, TechnicianQualification, TechnicianQualificationInput } from '../types/wof.types'
import { validateQualificationInput } from '../utils/wofRules'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`
const headers = (token: string, content = false) => ({ Authorization: `Bearer ${token}`, Accept: 'application/json', ...(content ? { 'Content-Type': 'application/json' } : {}) })

async function ensureSuccess(response: Response, action: string) {
    if (response.ok) return
    const detail = await response.text()
    throw new Error(`${action}: ${detail || `${response.status} ${response.statusText}`}`)
}

export async function fetchQualificationTypes(token: string): Promise<QualificationType[]> {
    const response = await fetch(`${API_URL}/gr_qualificationtypes?$select=gr_qualificationtypeid,gr_name,gr_code,gr_active&$orderby=gr_name asc`, { cache: 'no-store', headers: headers(token) })
    await ensureSuccess(response, 'Failed to load qualification types')
    return (await response.json()).value ?? []
}

export async function fetchAllTechnicianQualifications(token: string): Promise<TechnicianQualification[]> {
    const response = await fetch(`${API_URL}/gr_technicianqualifications?$select=gr_technicianqualificationid,gr_name,gr_certificatenumber,gr_validfrom,gr_expirydate,gr_active,gr_notes&$expand=gr_Technician($select=gr_mechanicid,gr_name,gr_email,statecode),gr_QualificationType($select=gr_qualificationtypeid,gr_name,gr_code,gr_active)&$orderby=gr_expirydate desc`, { cache: 'no-store', headers: headers(token) })
    await ensureSuccess(response, 'Failed to load technician qualifications')
    return (await response.json()).value ?? []
}

function payload(input: TechnicianQualificationInput) {
    return {
        gr_name: `${input.technicianName.trim()} - ${input.qualificationTypeName.trim()}`,
        gr_certificatenumber: input.certificateNumber.trim() || null,
        gr_validfrom: input.validFrom || null,
        gr_expirydate: input.expiryDate || null,
        gr_active: input.active,
        gr_notes: input.notes.trim() || null,
        'gr_QualificationType@odata.bind': `/gr_qualificationtypes(${input.qualificationTypeId})`,
    }
}

export async function createTechnicianQualification(token: string, input: TechnicianQualificationInput, existing: TechnicianQualification[], types: QualificationType[]) {
    validateQualificationInput(input, existing, types)
    const response = await fetch(`${API_URL}/gr_technicianqualifications`, { method: 'POST', headers: headers(token, true), body: JSON.stringify({ ...payload(input), 'gr_Technician@odata.bind': `/gr_mechanics(${input.technicianId})` }) })
    await ensureSuccess(response, 'Failed to create technician qualification')
}

export async function updateTechnicianQualification(token: string, id: string, input: TechnicianQualificationInput, existing: TechnicianQualification[], types: QualificationType[]) {
    validateQualificationInput(input, existing, types, id)
    const response = await fetch(`${API_URL}/gr_technicianqualifications(${id})`, { method: 'PATCH', headers: headers(token, true), body: JSON.stringify(payload(input)) })
    await ensureSuccess(response, 'Failed to update technician qualification')
}

export async function deactivateTechnicianQualification(token: string, id: string) {
    const response = await fetch(`${API_URL}/gr_technicianqualifications(${id})`, { method: 'PATCH', headers: headers(token, true), body: JSON.stringify({ gr_active: false }) })
    await ensureSuccess(response, 'Failed to deactivate technician qualification')
}
