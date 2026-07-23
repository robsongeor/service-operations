import type { JobSaveInput } from '../../jobs/types/jobSave.types'
import { createJob } from '../../jobs/services/jobsApi'
import { createJobScheduleOption } from '../../jobs/services/jobScheduleApi'
import { SCHEDULE_TYPE } from '../../jobs/types/jobSchedule.types'
import type { CreateWofInput, ServiceProvider, TechnicianQualification, UpdateWofInput, WofInspection } from '../types/wof.types'
import { WOF_RESULTS } from '../types/wof.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`

async function getJson<T>(token: string, path: string): Promise<T[]> {
    const response = await fetch(`${API_URL}/${path}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Dataverse request failed: ${await response.text()}`)
    return (await response.json()).value ?? []
}

type WofInspectionDataverseRow = Omit<WofInspection, 'linkedJobId' | 'equipmentId'> & {
    _gr_job_value?: string | null
    _gr_equipment_value?: string | null
}

const WOF_INSPECTION_SELECT = 'gr_wofinspectionid,gr_name,gr_registrationnumbersnapshot,gr_previouswofexpiry,gr_inspectiondate,gr_newwofexpiry,gr_wofresult,gr_certificatenumber,gr_notes,_gr_job_value,_gr_equipment_value'
const WOF_INSPECTION_EXPAND = 'gr_Job($select=gr_jobid,gr_jobnumber,gr_description,gr_status,gr_jobtype;$expand=gr_Equipment($select=gr_equipmentid),gr_Mechanic($select=gr_mechanicid,gr_name,statecode),gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_customerid,gr_name))),gr_Equipment($select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model,gr_registrationnumber,gr_compliancestatus,gr_wofrequired,gr_currentwofexpiry,gr_lastwofcompleted,gr_regoexpiry;$expand=gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_customerid,gr_name))),gr_InternalInspector($select=gr_mechanicid,gr_name,statecode),gr_ExternalProvider($select=gr_serviceproviderid,gr_name,gr_active,statecode)'

function mapWofInspection(row: WofInspectionDataverseRow): WofInspection {
    return {
        ...row,
        linkedJobId: row._gr_job_value ?? row.gr_Job?.gr_jobid ?? null,
        equipmentId: row._gr_equipment_value ?? row.gr_Equipment?.gr_equipmentid ?? null,
        gr_Job: row.gr_Job
            ? { ...row.gr_Job, gr_jobid: row._gr_job_value ?? row.gr_Job.gr_jobid }
            : undefined,
        gr_Equipment: row.gr_Equipment
            ? { ...row.gr_Equipment, gr_equipmentid: row._gr_equipment_value ?? row.gr_Equipment.gr_equipmentid }
            : undefined,
    }
}

export async function fetchWofInspections(token: string): Promise<WofInspection[]> {
    const rows = await getJson<WofInspectionDataverseRow>(token,
        `gr_wofinspections?$select=${WOF_INSPECTION_SELECT}&$expand=${WOF_INSPECTION_EXPAND}`)
    return rows.map(mapWofInspection)
}

export async function fetchWofInspection(token: string, inspectionId: string): Promise<WofInspection> {
    const response = await fetch(
        `${API_URL}/gr_wofinspections(${inspectionId})?$select=${WOF_INSPECTION_SELECT}&$expand=${WOF_INSPECTION_EXPAND}`,
        { cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    )
    if (!response.ok) throw new Error(`The WOF Inspection could not be loaded: ${await response.text()}`)
    return mapWofInspection(await response.json() as WofInspectionDataverseRow)
}

export const fetchTechnicianQualifications = (token: string) => getJson<TechnicianQualification>(token,
    `gr_technicianqualifications?$select=gr_technicianqualificationid,gr_name,gr_certificatenumber,gr_validfrom,gr_expirydate,gr_active&$expand=gr_Technician($select=gr_mechanicid,gr_name,gr_email,statecode),gr_QualificationType($select=gr_qualificationtypeid,gr_name,gr_code,gr_active)`)

export const fetchWofProviders = (token: string) => getJson<ServiceProvider>(token,
    `gr_serviceproviders?$select=gr_serviceproviderid,gr_name,gr_contactname,gr_phone,gr_email,gr_active,statecode&$expand=gr_ProviderType($select=gr_serviceprovidertypeid,gr_name,gr_code,gr_active)`)

async function hasRelatedRecord(token: string, entitySet: string, idField: string, jobId: string): Promise<boolean> {
    const rows = await getJson<Record<string, string>>(token, `${entitySet}?$select=${idField}&$filter=_gr_job_value eq ${jobId}&$top=1`)
    return rows.length > 0
}

export async function assertWofJobHasNoHistoricalDependants(token: string, jobId: string): Promise<void> {
    const checks = await Promise.all([
        hasRelatedRecord(token, 'gr_jobassignments', 'gr_jobassignmentid', jobId),
        hasRelatedRecord(token, 'gr_emaildispatches', 'gr_emaildispatchid', jobId),
        hasRelatedRecord(token, 'gr_jobofficeupdates', 'gr_jobofficeupdateid', jobId),
        hasRelatedRecord(token, 'gr_quotes', 'gr_quoteid', jobId),
    ])
    if (checks.some(Boolean)) {
        throw new Error('This WOF cannot be deleted because its linked Job has assignment, dispatch, office-update, or quote history. Cancel the WOF instead or contact an administrator.')
    }
}

export async function deleteWofInspection(token: string, inspectionId: string): Promise<void> {
    const response = await fetch(`${API_URL}/gr_wofinspections(${inspectionId})`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!response.ok && response.status !== 404) {
        const detail = await response.text()
        throw new Error(`The WOF Inspection could not be deleted: ${detail || `${response.status} ${response.statusText}`}`)
    }
}

async function createInspection(token: string, input: CreateWofInput, jobId: string) {
    const performer = input.assignmentMode === 'internal'
        ? { 'gr_InternalInspector@odata.bind': `/gr_mechanics(${input.internalInspectorId})` }
        : { 'gr_ExternalProvider@odata.bind': `/gr_serviceproviders(${input.externalProviderId})` }
    const response = await fetch(`${API_URL}/gr_wofinspections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
            gr_name: `WOF - ${input.equipment.gr_fleet || input.equipment.gr_serial || 'Equipment'}`,
            gr_registrationnumbersnapshot: input.equipment.gr_registrationnumber || null,
            gr_previouswofexpiry: input.equipment.gr_currentwofexpiry || null,
            gr_wofresult: WOF_RESULTS.PLANNED,
            'gr_Job@odata.bind': `/gr_jobs(${jobId})`,
            'gr_Equipment@odata.bind': `/gr_equipments(${input.equipment.gr_equipmentid})`,
            ...performer,
        }),
    })
    if (!response.ok) throw new Error(`The WOF Job was created, but its Inspection record failed: ${await response.text()}`)
}

export async function createWof(token: string, input: CreateWofInput, job: JobSaveInput) {
    const jobId = await createJob(token, job, 'wof')
    await createInspection(token, input, jobId)
    if (input.scheduledDate) await createJobScheduleOption(token, { jobId, scheduleType: SCHEDULE_TYPE.ANY_TIME, scheduleDate: input.scheduledDate, confirmed: true })
    return jobId
}

async function patch(token: string, path: string, body: Record<string, unknown>, action: string) {
    const response = await fetch(`${API_URL}/${path}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`${action}: ${await response.text()}`)
}

export async function updateWof(token: string, input: UpdateWofInput) {
    const internal = input.assignmentMode === 'internal'
    await patch(token, `gr_jobs(${input.jobId})`, {
        gr_jobnumber: input.jobNumber.trim() || null,
        gr_description: input.description.trim(),
        'gr_Equipment@odata.bind': `/gr_equipments(${input.equipment.gr_equipmentid})`,
        'gr_Site@odata.bind': input.equipment.gr_Site?.gr_siteid ? `/gr_sites(${input.equipment.gr_Site.gr_siteid})` : null,
        'gr_Mechanic@odata.bind': internal && input.internalInspectorId ? `/gr_mechanics(${input.internalInspectorId})` : null,
    }, 'Failed to update the linked Job')
    try {
        await patch(token, `gr_wofinspections(${input.inspectionId})`, {
            'gr_Equipment@odata.bind': `/gr_equipments(${input.equipment.gr_equipmentid})`,
            'gr_InternalInspector@odata.bind': internal && input.internalInspectorId ? `/gr_mechanics(${input.internalInspectorId})` : null,
            'gr_ExternalProvider@odata.bind': !internal && input.externalProviderId ? `/gr_serviceproviders(${input.externalProviderId})` : null,
            gr_registrationnumbersnapshot: input.registrationNumberSnapshot.trim() || null,
            gr_previouswofexpiry: input.previousWofExpiry || null,
            gr_inspectiondate: input.inspectionDate || null,
            gr_newwofexpiry: input.newWofExpiry || null,
            gr_wofresult: input.result,
            gr_certificatenumber: input.certificateNumber.trim() || null,
            gr_notes: input.notes.trim() || null,
        }, 'Failed to update the WOF Inspection')
    } catch (error) {
        throw new Error(`The linked Job was updated, but the WOF Inspection was not. Retry after reviewing the current values. ${error instanceof Error ? error.message : ''}`, { cause: error })
    }
}
