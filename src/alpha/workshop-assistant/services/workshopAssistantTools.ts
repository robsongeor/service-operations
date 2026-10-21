import { fetchEquipmentById, searchEquipment } from '../../jobs/services/equipmentApi.ts'
import { fetchEquipmentJobs, fetchJobCore } from '../../jobs/services/jobsApi.ts'
import { fetchJobOfficeUpdatesForJobs } from '../../jobs/services/jobOfficeUpdatesApi.ts'
import type { Job } from '../../jobs/types/job.types.ts'
import { normalizeWorkshopEquipmentQuery } from '../domain/workshopIdentifier.ts'
import type { WorkshopAssistantSource, WorkshopAssistantToolName, WorkshopAssistantToolResult } from '../types/workshopAssistant.types.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''
const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const JOB_SELECT = 'gr_jobid,createdon,gr_jobnumber,gr_status,gr_ordernumber,gr_description,gr_jobtype,gr_jobcardstatus,gr_currentofficeaction,gr_officeactionowner,gr_officeattentionrequired'
const JOB_EXPAND = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_serial,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))'

function text(value: unknown, maximum = 1200) {
    return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function requiredText(value: unknown, label: string, maximum = 100) {
    const normalized = text(value, maximum)
    if (!normalized) throw new Error(`${label} is required.`)
    return normalized
}

function requiredGuid(value: unknown, label: string) {
    const normalized = text(value, 64).toLowerCase()
    if (!GUID.test(normalized)) throw new Error(`${label} is invalid.`)
    return normalized
}

function escapeODataString(value: string) {
    return value.replaceAll("'", "''")
}

function jobSource(job: Job): WorkshopAssistantSource {
    return {
        kind: 'job',
        id: job.gr_jobid,
        label: job.gr_jobnumber ? `Job ${job.gr_jobnumber}` : 'Unnumbered Job',
        detail: [job.gr_Equipment?.gr_fleet, job.gr_Site?.gr_Customer?.gr_name].filter(Boolean).join(' · '),
    }
}

function jobSummary(job: Job) {
    return {
        id: job.gr_jobid,
        number: job.gr_jobnumber,
        createdOn: job.createdon,
        status: job.gr_status,
        orderNumber: job.gr_ordernumber,
        description: text(job.gr_description),
        jobType: job.gr_jobtype,
        jobCardStatus: job.gr_jobcardstatus,
        equipment: job.gr_Equipment ? {
            id: job.gr_Equipment.gr_equipmentid,
            fleet: job.gr_Equipment.gr_fleet,
            alternateFleetNumbers: job.gr_Equipment.gr_alternatefleetnumbers,
            serial: job.gr_Equipment.gr_serial,
            make: job.gr_Equipment.gr_make,
            model: job.gr_Equipment.gr_model,
        } : null,
        customer: job.gr_Site?.gr_Customer?.gr_name ?? null,
        site: job.gr_Site ? { id: job.gr_Site.gr_siteid, name: job.gr_Site.gr_name, address: job.gr_Site.gr_address } : null,
        technician: job.gr_Mechanic?.gr_name ?? null,
        officeAction: job.gr_currentofficeaction ?? null,
        officeActionOwner: job.gr_officeactionowner ?? null,
        officeAttentionRequired: job.gr_officeattentionrequired === true,
    }
}

async function searchJobs(accessToken: string, rawQuery: unknown, signal?: AbortSignal) {
    const query = requiredText(rawQuery, 'A Job search', 100)
    const escaped = escapeODataString(query)
    const clauses = [`gr_jobnumber eq '${escaped}'`, `contains(gr_jobnumber,'${escaped}')`]
    if (query.length >= 3) clauses.push(`contains(gr_description,'${escaped}')`, `contains(gr_ordernumber,'${escaped}')`)
    const url = new URL(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs`)
    url.searchParams.set('$select', JOB_SELECT)
    url.searchParams.set('$expand', JOB_EXPAND)
    url.searchParams.set('$filter', clauses.join(' or '))
    url.searchParams.set('$orderby', 'createdon desc')
    url.searchParams.set('$top', '8')
    const response = await fetch(url, {
        cache: 'no-store', signal,
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Cache-Control': 'no-cache' },
    })
    if (!response.ok) throw new Error('Job search is unavailable.')
    return ((await response.json()) as { value?: Job[] }).value ?? []
}

export async function runWorkshopAssistantTool(
    accessToken: string,
    name: WorkshopAssistantToolName,
    args: Record<string, unknown>,
    signal?: AbortSignal,
): Promise<WorkshopAssistantToolResult> {
    if (name === 'search_equipment') {
        const query = normalizeWorkshopEquipmentQuery(requiredText(args.query, 'An Equipment search', 100))
        const items = (await searchEquipment(accessToken, query, {}, signal)).slice(0, 8)
        return {
            output: { items: items.map((item) => ({
                id: item.gr_equipmentid,
                fleet: item.gr_fleet,
                alternateFleetNumbers: item.gr_alternatefleetnumbers,
                serial: item.gr_serial,
                make: item.gr_make,
                model: item.gr_model,
                customer: item.gr_Site?.gr_Customer?.gr_name ?? null,
                site: item.gr_Site?.gr_name ?? null,
            })) },
            sources: items.map((item) => ({
                kind: 'equipment' as const,
                id: item.gr_equipmentid,
                label: item.gr_fleet ? `Equipment ${item.gr_fleet}` : 'Equipment',
                detail: [item.gr_make, item.gr_model, item.gr_Site?.gr_Customer?.gr_name].filter(Boolean).join(' · '),
            })),
        }
    }

    if (name === 'get_equipment_context') {
        const equipmentId = requiredGuid(args.equipment_id, 'The Equipment ID')
        const [equipment, jobs] = await Promise.all([
            fetchEquipmentById(accessToken, equipmentId, signal),
            fetchEquipmentJobs(accessToken, equipmentId, signal),
        ])
        if (!equipment) throw new Error('The Equipment could not be found.')
        const recentJobs = jobs.slice(0, 8)
        return {
            output: {
                equipment: {
                    id: equipment.gr_equipmentid,
                    fleet: equipment.gr_fleet,
                    alternateFleetNumbers: equipment.gr_alternatefleetnumbers,
                    serial: equipment.gr_serial,
                    make: equipment.gr_make,
                    model: equipment.gr_model,
                    currentHourMeter: equipment.gr_currenthourmeter,
                    customer: equipment.gr_Site?.gr_Customer?.gr_name ?? null,
                    site: equipment.gr_Site ? { name: equipment.gr_Site.gr_name, address: equipment.gr_Site.gr_address } : null,
                },
                recentJobs: recentJobs.map(jobSummary),
            },
            sources: [
                {
                    kind: 'equipment', id: equipment.gr_equipmentid,
                    label: equipment.gr_fleet ? `Equipment ${equipment.gr_fleet}` : 'Equipment',
                    detail: [equipment.gr_make, equipment.gr_model, equipment.gr_Site?.gr_Customer?.gr_name].filter(Boolean).join(' · '),
                },
                ...recentJobs.map(jobSource),
            ],
        }
    }

    if (name === 'search_jobs') {
        const items = await searchJobs(accessToken, args.query, signal)
        return { output: { items: items.map(jobSummary) }, sources: items.map(jobSource) }
    }

    if (name === 'get_job_context') {
        const jobId = requiredGuid(args.job_id, 'The Job ID')
        const [job, updates] = await Promise.all([
            fetchJobCore(accessToken, jobId, signal),
            fetchJobOfficeUpdatesForJobs(accessToken, [jobId], signal),
        ])
        if (!job) throw new Error('The Job could not be found.')
        return {
            output: {
                job: jobSummary(job),
                officeUpdates: updates.slice(0, 5).map((update) => ({
                    text: text(update.text, 500),
                    createdAt: update.createdAt,
                    createdByName: update.createdByName ?? null,
                })),
            },
            sources: [jobSource(job)],
        }
    }

    throw new Error('That Workshop Assistant tool is not available.')
}
