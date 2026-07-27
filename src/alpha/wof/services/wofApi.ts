import type { JobSaveInput } from '../../jobs/types/jobSave.types'
import { createJob } from '../../jobs/services/jobsApi'
import { JOB_STATUSES } from '../../jobs/types/jobStatus.types'
import { JOB_TYPES } from '../../jobs/types/jobType.types'
import type { Equipment } from '../../jobs/types/equipment.types'
import { createJobScheduleOption } from '../../jobs/services/jobScheduleApi'
import { SCHEDULE_TYPE } from '../../jobs/types/jobSchedule.types'
import type { CreateWofInput, ServiceProvider, TechnicianQualification, UpdateWofInput, WofInspection } from '../types/wof.types'
import { WOF_RESULTS } from '../types/wof.types'
import { getWofJobCreationDisposition, normalizeWofDateOnly, verifyWofExpiryWithRetry, wofDatesMatch } from '../utils/wofRules'
import { newZealandDateOnly } from '../../shared/dates/dateOnly'

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

const WOF_INSPECTION_SELECT = 'gr_wofinspectionid,createdon,gr_name,gr_registrationnumbersnapshot,gr_previouswofexpiry,gr_inspectiondate,gr_newwofexpiry,gr_wofresult,gr_certificatenumber,gr_notes,_gr_job_value,_gr_equipment_value'
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
    const performer = input.assignmentMode === 'internal' && input.internalInspectorId
        ? { 'gr_InternalInspector@odata.bind': `/gr_mechanics(${input.internalInspectorId})` }
        : input.assignmentMode === 'external' && input.externalProviderId
            ? { 'gr_ExternalProvider@odata.bind': `/gr_serviceproviders(${input.externalProviderId})` }
            : {}
    const response = await fetch(`${API_URL}/gr_wofinspections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
            gr_name: `WOF - ${input.equipment.gr_fleet || input.equipment.gr_serial || 'Equipment'}`,
            gr_registrationnumbersnapshot: input.equipment.gr_registrationnumber || null,
            gr_previouswofexpiry: normalizeWofDateOnly(input.equipment.gr_currentwofexpiry) || null,
            gr_wofresult: WOF_RESULTS.PLANNED,
            'gr_Job@odata.bind': `/gr_jobs(${jobId})`,
            'gr_Equipment@odata.bind': `/gr_equipments(${input.equipment.gr_equipmentid})`,
            ...performer,
        }),
    })
    if (!response.ok) throw new Error(`The WOF Job was created, but its Inspection record failed: ${await response.text()}`)
}

type ActiveWofJob = { gr_jobid: string; gr_jobnumber?: string | null }

async function findActiveWofJob(token: string, equipment: Equipment): Promise<ActiveWofJob | undefined> {
    const activeJobs = await getJson<{ gr_jobid: string; gr_jobnumber?: string | null }>(token,
        `gr_jobs?$select=gr_jobid,gr_jobnumber&$filter=_gr_equipment_value eq ${equipment.gr_equipmentid} and gr_jobtype eq ${JOB_TYPES.WOF} and gr_status ne ${JOB_STATUSES.COMPLETE}&$orderby=createdon desc&$top=1`)
    return activeJobs[0]
}

async function assertNoActiveWofJob(token: string, equipment: Equipment) {
    const activeJob = await findActiveWofJob(token, equipment)
    if (activeJob) throw new Error(`An active WOF Job${activeJob.gr_jobnumber ? ` (${activeJob.gr_jobnumber})` : ''} already exists for this Equipment. Open the existing Job instead.`)

    const records = await getJson<WofInspectionDataverseRow>(token,
        `gr_wofinspections?$select=${WOF_INSPECTION_SELECT}&$expand=${WOF_INSPECTION_EXPAND}&$filter=_gr_equipment_value eq ${equipment.gr_equipmentid}&$orderby=createdon desc&$top=1`)
    const latest = records[0] && mapWofInspection(records[0])
    if (!latest?.gr_Job) return

    const completedCycle = latest.gr_wofresult === WOF_RESULTS.CANCELLED || latest.gr_Job.gr_status === JOB_STATUSES.COMPLETE
        && Boolean(latest.gr_newwofexpiry)
        && latest.gr_newwofexpiry === equipment.gr_currentwofexpiry
    if (!completedCycle) {
        throw new Error(`An active WOF Job${latest.gr_Job.gr_jobnumber ? ` (${latest.gr_Job.gr_jobnumber})` : ''} already exists for this Equipment. Open the existing Job instead.`)
    }
}

export async function createWofJobFromJobDrawer(token: string, equipment: Equipment, job: JobSaveInput) {
    const existingJob = await findActiveWofJob(token, equipment)
    if (existingJob) {
        const linkedInspections = await getJson<{ gr_wofinspectionid: string }>(token,
            `gr_wofinspections?$select=gr_wofinspectionid&$filter=_gr_job_value eq ${existingJob.gr_jobid}&$top=1`)
        if (getWofJobCreationDisposition(true, linkedInspections.length > 0) === 'existing') {
            throw new Error(`An active WOF Job${existingJob.gr_jobnumber ? ` (${existingJob.gr_jobnumber})` : ''} already exists for this Equipment. Open the existing Job instead.`)
        }
        await createInspection(token, {
            equipment,
            jobNumber: existingJob.gr_jobnumber || job.jobNumber,
            description: job.description,
            scheduledDate: '',
            assignmentMode: 'internal',
            internalInspectorId: job.mechanicId,
        }, existingJob.gr_jobid)
        return existingJob.gr_jobid
    }

    await assertNoActiveWofJob(token, equipment)
    const jobId = await createJob(token, job, 'wof')
    await createInspection(token, {
        equipment,
        jobNumber: job.jobNumber,
        description: job.description,
        scheduledDate: '',
        assignmentMode: 'internal',
        internalInspectorId: job.mechanicId,
    }, jobId)
    return jobId
}

export async function createWof(token: string, input: CreateWofInput, job: JobSaveInput) {
    await assertNoActiveWofJob(token, input.equipment)
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
    if (input.result === WOF_RESULTS.PASSED && input.newWofExpiry) {
        await patch(token, `gr_equipments(${input.equipment.gr_equipmentid})`, {
            gr_currentwofexpiry: input.newWofExpiry,
            gr_lastwofcompleted: input.inspectionDate || null,
        }, 'The Inspection was saved, but the Equipment WOF expiry could not be updated')
    }
}

export async function updateWofExpiryForCompletion(
    token: string,
    input: { jobId: string; equipmentId: string; newExpiry: string; completionDate: string },
) {
    const records = await getJson<WofInspectionDataverseRow>(
        token,
        `gr_wofinspections?$select=${WOF_INSPECTION_SELECT}&$filter=_gr_job_value eq ${input.jobId}&$top=2`,
    )
    if (records.length !== 1) {
        throw new Error(records.length === 0
            ? 'The linked WOF Inspection could not be found. The Job was not completed.'
            : 'More than one WOF Inspection is linked to this Job. The Job was not completed.')
    }
    const inspection = records[0]
    if (inspection._gr_equipment_value?.toLowerCase() !== input.equipmentId.toLowerCase()) {
        throw new Error('The linked WOF Inspection does not reference the Job Equipment. The Job was not completed.')
    }

    const readSavedExpiries = async () => {
        const [savedInspection] = await getJson<WofInspectionDataverseRow>(
            token,
            `gr_wofinspections?$select=gr_wofinspectionid,gr_newwofexpiry,_gr_equipment_value&$filter=gr_wofinspectionid eq ${inspection.gr_wofinspectionid}&$top=1`,
        )
        const equipmentResponse = await fetch(
            `${API_URL}/gr_equipments(${input.equipmentId})?$select=gr_currentwofexpiry`,
            { cache: 'no-store', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-cache' } },
        )
        if (!equipmentResponse.ok) throw new Error('The Equipment WOF expiry could not be verified. The Job was not completed.')
        const savedEquipment = await equipmentResponse.json() as { gr_currentwofexpiry?: string | null }
        return [savedInspection?.gr_newwofexpiry, savedEquipment.gr_currentwofexpiry]
    }

    const existingExpiries = await readSavedExpiries()
    if (wofDatesMatch(existingExpiries[1], input.newExpiry) && !wofDatesMatch(existingExpiries[0], input.newExpiry)) {
        throw new Error('The new WOF expiry must be later than the current expiry.')
    }
    if (existingExpiries.every((value) => wofDatesMatch(value, input.newExpiry))) return

    const completionDateOnly = newZealandDateOnly(input.completionDate)
    if (!completionDateOnly) throw new Error('The Job completion date could not be resolved in New Zealand time.')

    await patch(token, `gr_wofinspections(${inspection.gr_wofinspectionid})`, {
        gr_inspectiondate: completionDateOnly,
        gr_newwofexpiry: input.newExpiry,
        gr_wofresult: WOF_RESULTS.PASSED,
    }, 'The WOF Inspection expiry could not be updated')
    await patch(token, `gr_equipments(${input.equipmentId})`, {
        gr_currentwofexpiry: input.newExpiry,
        gr_lastwofcompleted: completionDateOnly,
    }, 'The Equipment WOF expiry could not be updated')

    await verifyWofExpiryWithRetry(readSavedExpiries, input.newExpiry)
}
