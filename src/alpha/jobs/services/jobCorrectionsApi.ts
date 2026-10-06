import type { Job } from '../types/job.types.ts'
import type { Site } from '../types/site.types.ts'
import { assertJobDescriptionLength } from '../domain/jobDescription.ts'
import { UNIFIED_JOB_WALKTHROUGH, UNIFIED_JOB_SELECT } from '../domain/unifiedJobWorkflow.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SELECT = `gr_jobid,createdon,gr_jobnumber,gr_status,gr_ordernumber,gr_description,gr_jobtype,gr_servicetype,gr_gtentered,gr_timecloudentered,_gr_sitecheck_value${UNIFIED_JOB_WALKTHROUGH ? UNIFIED_JOB_SELECT : ''}`
const EXPAND = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_serial,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name,gr_email),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)'

export type CorrectableJob = Job & { gr_gtentered: boolean | null; gr_timecloudentered: boolean | null }
export type JobCorrectionsInput = {
    description: string
    orderNumber: string
    equipmentId: string
    mechanicId: string
    customerId: string
    siteId: string
    contactId: string
}
const INPUT_FIELDS = new Set(['description', 'orderNumber', 'equipmentId', 'mechanicId', 'customerId', 'siteId', 'contactId'])

export class JobCorrectionConflictError extends Error {
    constructor() {
        super('Someone else changed this Job. Reload the latest details and review your corrections before saving again.')
        this.name = 'JobCorrectionConflictError'
    }
}

export class JobCorrectionRefreshError extends Error {
    constructor() {
        super('Your corrections were saved, but the updated Job could not be loaded. Reload the details before making any more changes.')
        this.name = 'JobCorrectionRefreshError'
    }
}

function requiredId(value: string) {
    if (!GUID.test(value)) throw new Error('Select a valid saved record before saving corrections.')
    return value.toLowerCase()
}

function jobUrl(jobId: string) {
    return `${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${requiredId(jobId)})?$select=${SELECT}&$expand=${EXPAND}`
}

function jobRecordUrl(jobId: string) {
    return `${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${requiredId(jobId)})`
}

function headers(token: string) {
    return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

export async function fetchJobForCorrection(token: string, jobId: string, signal?: AbortSignal): Promise<CorrectableJob> {
    const response = await fetch(jobUrl(jobId), { cache: 'no-store', signal, headers: headers(token) })
    if (!response.ok) throw new Error(response.status === 404 ? 'This Job no longer exists.' : 'Job details could not be loaded. Check your access and try again.')
    const job = await response.json() as CorrectableJob
    if (job.gr_jobid?.toLowerCase() !== jobId.toLowerCase()) throw new Error('The requested Job could not be verified.')
    return { ...job, '@odata.etag': job['@odata.etag'] || response.headers.get('ETag') || undefined }
}

/** Deliberately separate from updateJob: never write coordinator fields or submission evidence. */
export function buildJobCorrectionsPatch(original: Job, input: JobCorrectionsInput): Record<string, string | null> {
    if (original.gr_registrationvoid) throw new Error('Void entries are read-only.')
    if (Object.keys(input).some((key) => !INPUT_FIELDS.has(key))) throw new Error('Only recorded Job details can be corrected here.')
    if ([...INPUT_FIELDS].some((key) => typeof input[key as keyof JobCorrectionsInput] !== 'string')) throw new Error('Complete the correction details before saving.')
    const description = input.description.trim()
    if (!description) throw new Error('Enter a Job description before saving.')
    assertJobDescriptionLength(description)
    for (const id of [input.equipmentId, input.mechanicId, input.customerId, input.siteId, input.contactId]) if (id) requiredId(id)
    if (Boolean(input.customerId) !== Boolean(input.siteId)) throw new Error('Select both a Customer and its Site before saving.')
    if (input.contactId && !input.siteId) throw new Error('Select a Site for the Contact before saving.')
    const patch: Record<string, string | null> = {}
    if (description !== (original.gr_description ?? '').trim()) patch.gr_description = description
    if (input.orderNumber.trim() !== (original.gr_ordernumber ?? '').trim()) patch.gr_ordernumber = input.orderNumber.trim() || null
    for (const [name, collection, value, previous] of [
        ['gr_Equipment', 'gr_equipments', input.equipmentId, original.gr_Equipment?.gr_equipmentid],
        ['gr_Mechanic', 'gr_mechanics', input.mechanicId, original.gr_Mechanic?.gr_mechanicid],
        ['gr_Site', 'gr_sites', input.siteId, original.gr_Site?.gr_siteid],
        ['gr_Contact', 'gr_contacts', input.contactId, original.gr_Contact?.gr_contactid],
    ]) {
        if ((value ?? '').toLowerCase() !== (previous ?? '').toLowerCase()) {
            patch[`${name}@odata.bind`] = value ? `/${collection}(${requiredId(value)})` : null
        }
    }
    return patch
}

export async function saveJobCorrections(token: string, original: CorrectableJob, input: JobCorrectionsInput): Promise<CorrectableJob> {
    const etag = original['@odata.etag']
    if (!etag || !/^(W\/)?"[^"\r\n]+"$/.test(etag)) throw new Error('Reload the Job before saving. Its current version is unavailable.')
    const patch = buildJobCorrectionsPatch(original, input)
    if (input.siteId) {
        const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_sites(${requiredId(input.siteId)})?$select=gr_siteid&$expand=gr_Customer($select=gr_customerid)`, { cache: 'no-store', headers: headers(token) })
        if (!result.ok) throw new Error('The selected Site could not be verified. Try again.')
        const site = await result.json() as Site
        if (site.gr_siteid?.toLowerCase() !== input.siteId.toLowerCase() || site.gr_Customer?.gr_customerid?.toLowerCase() !== input.customerId.toLowerCase()) throw new Error('The selected Site does not belong to this Customer. Select the Site again.')
    }
    // Historical Contacts can be retained unchanged; new relationships must belong to the selected Site.
    if (input.contactId && ('gr_Site@odata.bind' in patch || 'gr_Contact@odata.bind' in patch)) {
        const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_sitecontacts?$select=gr_sitecontactid&$filter=_gr_site_value eq ${requiredId(input.siteId)} and _gr_contact_value eq ${requiredId(input.contactId)}&$top=1`, { cache: 'no-store', headers: headers(token) })
        if (!result.ok || !(await result.json() as { value?: unknown[] }).value?.length) throw new Error('The selected Contact is not linked to this Site. Select the Contact again.')
    }
    if (!Object.keys(patch).length) return original
    const response = await fetch(jobRecordUrl(original.gr_jobid), {
        method: 'PATCH',
        headers: { ...headers(token), 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(patch),
    })
    if (response.status === 412) throw new JobCorrectionConflictError()
    if (!response.ok) throw new Error(response.status === 403 ? 'You do not have permission to correct this Job. No changes were saved.' : 'Job corrections could not be saved. Reload the Job before trying again.')
    try {
        return await fetchJobForCorrection(token, original.gr_jobid)
    } catch {
        throw new JobCorrectionRefreshError()
    }
}
