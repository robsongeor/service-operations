import { JOB_BOOK_ENTRY_STAGES, MANAGED_JOB_ENTRY_MARKER_COLUMNS, type JobBookRow } from './jobBookPrototype.ts'
import { JOB_BOOKS, jobNumberBelongsToBook, managedJobNumberFilter, type JobBookConfig } from './jobBookConfig.ts'
import { assertJobCreationLocation } from '../jobs/domain/jobCreationLocation.ts'
import { isEditableJobBookIntake, jobBookVoidBlockedReason, jobBookVoidReasonError } from './jobBookEntryWorkflow.ts'
import { UNIFIED_JOB_RUNTIME, UNIFIED_JOB_WALKTHROUGH, UNIFIED_JOB_SELECT } from '../jobs/domain/unifiedJobWorkflow.ts'
import { walkthroughJobAction } from '../jobs/services/unifiedJobWalkthroughApi.ts'
import { runJobWorkflow } from '../jobs/services/jobWorkflowApi.ts'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? ''

function trustedNextLink(value?: string) {
    if (!value) return undefined
    const next = new URL(value, DATAVERSE_URL)
    if (next.origin !== new URL(DATAVERSE_URL).origin) throw new Error('Dataverse returned an invalid Job Book continuation link.')
    return next.toString()
}

type JobBookApiRow = {
    '@odata.etag'?: string
    gr_jobid: string
    createdon: string
    gr_jobnumber: string | null
    gr_ordernumber: string | null
    gr_description: string | null
    gr_gtentered: boolean | null
    gr_timecloudentered: boolean | null
    gr_coordinatormanaged?: boolean | null
    gr_registrationvoid?: boolean
    gr_registrationvoidreason?: string | null
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet: string | null
        gr_alternatefleetnumbers?: string | null
        gr_serial: string | null
        gr_make: string | null
        gr_model: string | null
    }
    gr_Mechanic?: { gr_mechanicid: string; gr_name: string }
    gr_Contact?: { gr_contactid: string; gr_name: string }
    gr_Site?: {
        gr_siteid: string
        gr_name: string
        gr_address: string
        gr_Customer?: { gr_customerid: string; gr_name: string }
    }
}

type IntakeApiRow = {
    '@odata.etag'?: string
    gr_jobbookentryid?: string
    gr_waikatojobbookentryid?: string
    gr_hastingsjobbookentryid?: string
    gr_christchurchjobbookentryid?: string
    createdon: string
    gr_jobnumber: string
    gr_stage: number
    gr_voidreason?: string | null
    gr_mechanictext: string | null
    gr_fleetsnapshot: string | null
    gr_serialsnapshot: string | null
    gr_makesnapshot: string | null
    gr_modelsnapshot: string | null
    gr_customersnapshot: string | null
    gr_sitesnapshot: string | null
    gr_addresssnapshot: string | null
    gr_addressverified: boolean
    gr_addressnotfoundconfirmed: boolean
    gr_description: string
    gr_customerpo: string | null
    gr_entered: boolean
    gr_timecloudentered: boolean
    gr_equipmentreviewrequired: boolean
    gr_Mechanic?: { gr_mechanicid: string; gr_name: string }
    gr_Equipment?: { gr_equipmentid: string }
    gr_Customer?: { gr_customerid: string }
    gr_Site?: { gr_siteid: string }
    gr_Contact?: { gr_contactid: string; gr_name: string }
    gr_PromotedJob?: { gr_jobid: string }
    gr_registeredjob?: JobBookApiRow
}

const INTAKE_STAGE_TO_NAME = {
    122830000: JOB_BOOK_ENTRY_STAGES.INTAKE,
    122830001: JOB_BOOK_ENTRY_STAGES.PROMOTED,
    122830002: JOB_BOOK_ENTRY_STAGES.LEGACY,
    122830003: JOB_BOOK_ENTRY_STAGES.VOID,
    122830004: JOB_BOOK_ENTRY_STAGES.REGISTERED,
} as const

const INTAKE_STAGE = 122830000
const VOID_STAGE = 122830003

export class JobBookConflictError extends Error {
    constructor() {
        super('Someone else changed this entry. Reload the latest entry and review it before trying again.')
        this.name = 'JobBookConflictError'
    }
}

function localDate(isoDate: string) {
    return new Date(isoDate).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
}

export const JOB_BOOK_PAGE_SIZE = 100

export type JobBookPage = {
    records: JobBookRow[]
    nextLink?: string
}

export async function fetchRecentJobBookRows(accessToken: string, book: JobBookConfig = JOB_BOOKS.auckland, continuationLink?: string): Promise<JobBookPage> {
    const select = `gr_jobid,createdon,gr_jobnumber,gr_ordernumber,gr_description,gr_gtentered,gr_timecloudentered${UNIFIED_JOB_RUNTIME ? UNIFIED_JOB_SELECT : ''}`
    const expand = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_serial,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Contact($select=gr_contactid,gr_name)'
    const nextUrl = continuationLink
        ? trustedNextLink(continuationLink)
        : `${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${select}&$expand=${expand}&$filter=${managedJobNumberFilter(book)}&$orderby=createdon desc`
    if (!nextUrl) return { records: [] }
    const response = await fetch(nextUrl, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', Prefer: `odata.maxpagesize=${JOB_BOOK_PAGE_SIZE}` },
    })
    if (!response.ok) throw new Error('Managed Job Book entries could not be loaded.')
    const data = await response.json() as { value?: JobBookApiRow[]; '@odata.nextLink'?: string }
    return { records: (data.value ?? []).filter((job) => job.gr_jobnumber && jobNumberBelongsToBook(job.gr_jobnumber, book)).map((job) => mapManagedJobBookRow(job, book)), nextLink: trustedNextLink(data['@odata.nextLink']) }
}

export function mapManagedJobBookRow(job: JobBookApiRow, book: JobBookConfig): JobBookRow {
    return {
        jobBookKey: book.key,
        id: `dataverse-${book.key}-${job.gr_jobid}`,
        jobNumber: job.gr_jobnumber?.trim() ?? '',
        date: localDate(job.createdon),
        mechanicId: job.gr_Mechanic?.gr_mechanicid ?? '',
        mechanicName: job.gr_Mechanic?.gr_name ?? '',
        equipmentId: job.gr_Equipment?.gr_equipmentid ?? '',
        fleet: job.gr_Equipment?.gr_fleet?.trim() || job.gr_Equipment?.gr_serial?.trim() || '',
        alternateFleetNumbers: job.gr_Equipment?.gr_alternatefleetnumbers?.trim() || '',
        primaryFleet: job.gr_Equipment?.gr_fleet?.trim() || '',
        serial: job.gr_Equipment?.gr_serial?.trim() ?? '',
        make: job.gr_Equipment?.gr_make?.trim() ?? '',
        model: job.gr_Equipment?.gr_model?.trim() ?? '',
        customer: job.gr_Site?.gr_Customer?.gr_name?.trim() ?? '',
        customerId: job.gr_Site?.gr_Customer?.gr_customerid ?? '',
        description: job.gr_description?.trim() ?? '',
        site: job.gr_Site?.gr_name?.trim() ?? '',
        siteId: job.gr_Site?.gr_siteid ?? '',
        contactId: job.gr_Contact?.gr_contactid ?? '',
        contactName: job.gr_Contact?.gr_name?.trim() ?? '',
        address: job.gr_Site?.gr_address?.trim() ?? '',
        addressVerified: Boolean(job.gr_Site?.gr_address?.trim()),
        addressNotFoundConfirmed: false,
        customerPo: job.gr_ordernumber?.trim() ?? '',
        entered: Boolean(job.gr_gtentered),
        timecloudEntered: Boolean(job.gr_timecloudentered),
        equipmentConfigured: Boolean(job.gr_Equipment?.gr_fleet?.trim() || job.gr_Equipment?.gr_serial?.trim()),
        equipmentReviewRequired: UNIFIED_JOB_RUNTIME && !job.gr_Equipment,
        entryStage: job.gr_registrationvoid ? JOB_BOOK_ENTRY_STAGES.VOID : job.gr_coordinatormanaged === false ? JOB_BOOK_ENTRY_STAGES.REGISTERED : JOB_BOOK_ENTRY_STAGES.PROMOTED,
        voidReason: job.gr_registrationvoidreason ?? '',
        entrySource: 'dataverse-job',
        linkedJobId: job.gr_jobid,
        intakeRecordId: '',
        etag: job['@odata.etag'] ?? '',
        coordinatorManaged: job.gr_coordinatormanaged !== false,
    }
}

export async function updateManagedJobBookMarker(
    accessToken: string,
    row: JobBookRow,
    field: 'entered' | 'timecloudEntered',
    value: boolean,
): Promise<Pick<JobBookRow, 'entered' | 'timecloudEntered' | 'etag'>> {
    if (row.entryStage === JOB_BOOK_ENTRY_STAGES.VOID) throw new Error('Void entries are read-only.')
    if (!row.linkedJobId || !row.etag) throw new Error('Reload this Job before saving the entry marker.')
    const dataverseField = MANAGED_JOB_ENTRY_MARKER_COLUMNS[field]
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${row.linkedJobId})?$select=gr_gtentered,gr_timecloudentered`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'If-Match': row.etag,
            Prefer: 'return=representation',
        },
        body: JSON.stringify({ [dataverseField]: value }),
    })
    if (response.status === 412) throw new Error('Someone else changed this Job. Reload the page before trying again.')
    if (!response.ok) throw new Error(`The ${field === 'entered' ? 'GT Entry' : 'Timecloud Entry'} marker was not saved.`)
    const saved = await response.json() as Pick<JobBookApiRow, '@odata.etag' | 'gr_gtentered' | 'gr_timecloudentered'>
    return {
        entered: Boolean(saved.gr_gtentered),
        timecloudEntered: Boolean(saved.gr_timecloudentered),
        etag: saved['@odata.etag'] ?? '',
    }
}

function mapIntakeRow(row: IntakeApiRow, book: JobBookConfig): JobBookRow {
    const intakeRecordId = String(row[book.idField as keyof IntakeApiRow] ?? '')
    if (UNIFIED_JOB_RUNTIME && row.gr_registeredjob) {
        const job = row.gr_registeredjob
        if (!job.gr_jobid || job.gr_jobnumber !== row.gr_jobnumber) throw new Error('The Job Book link needs reconciliation. No replacement Job or number was created.')
        return {
            ...mapManagedJobBookRow(job, book),
            registeredLedgerId: intakeRecordId, intakeRecordId, ledgerEtag: row['@odata.etag'] ?? '',
            allocationSnapshot: { customer: row.gr_customersnapshot ?? '', site: row.gr_sitesnapshot ?? '', address: row.gr_addresssnapshot ?? '', description: row.gr_description },
        }
    }
    return {
        jobBookKey: book.key,
        id: `intake-${book.key}-${intakeRecordId}`,
        jobNumber: row.gr_jobnumber,
        date: localDate(row.createdon),
        mechanicId: row.gr_Mechanic?.gr_mechanicid ?? '',
        mechanicName: row.gr_Mechanic?.gr_name ?? row.gr_mechanictext ?? '',
        equipmentId: row.gr_Equipment?.gr_equipmentid ?? '',
        fleet: row.gr_fleetsnapshot ?? '',
        serial: row.gr_serialsnapshot ?? '',
        make: row.gr_makesnapshot ?? '',
        model: row.gr_modelsnapshot ?? '',
        customer: row.gr_customersnapshot ?? '',
        customerId: row.gr_Customer?.gr_customerid ?? '',
        description: row.gr_description,
        site: row.gr_sitesnapshot ?? '',
        siteId: row.gr_Site?.gr_siteid ?? '',
        contactId: row.gr_Contact?.gr_contactid ?? '',
        contactName: row.gr_Contact?.gr_name?.trim() ?? '',
        address: row.gr_addresssnapshot ?? '',
        addressVerified: row.gr_addressverified,
        addressNotFoundConfirmed: row.gr_addressnotfoundconfirmed,
        customerPo: row.gr_customerpo ?? '',
        entered: row.gr_entered,
        timecloudEntered: row.gr_timecloudentered,
        equipmentConfigured: Boolean(row.gr_Equipment?.gr_equipmentid || row.gr_fleetsnapshot?.trim() || row.gr_serialsnapshot?.trim()),
        equipmentReviewRequired: row.gr_equipmentreviewrequired,
        entryStage: INTAKE_STAGE_TO_NAME[row.gr_stage as keyof typeof INTAKE_STAGE_TO_NAME] ?? JOB_BOOK_ENTRY_STAGES.LEGACY,
        voidReason: row.gr_voidreason ?? '',
        entrySource: 'dataverse-intake',
        linkedJobId: row.gr_PromotedJob?.gr_jobid ?? '',
        intakeRecordId,
        etag: row['@odata.etag'] ?? '',
    }
}

const INTAKE_SELECT = 'createdon,gr_jobnumber,gr_stage,gr_voidreason,gr_mechanictext,gr_fleetsnapshot,gr_serialsnapshot,gr_makesnapshot,gr_modelsnapshot,gr_customersnapshot,gr_sitesnapshot,gr_addresssnapshot,gr_addressverified,gr_addressnotfoundconfirmed,gr_description,gr_customerpo,gr_entered,gr_timecloudentered,gr_equipmentreviewrequired'
const INTAKE_EXPAND_WITHOUT_CONTACT = 'gr_Mechanic($select=gr_mechanicid,gr_name),gr_Equipment($select=gr_equipmentid),gr_Customer($select=gr_customerid),gr_Site($select=gr_siteid),gr_PromotedJob($select=gr_jobid)'
const INTAKE_EXPAND = `${INTAKE_EXPAND_WITHOUT_CONTACT},gr_Contact($select=gr_contactid,gr_name)`
const INTAKE_CONTACT_LOOKUP_ENABLED = import.meta.env?.VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED === 'true'

export function jobBookIntakeContactLookupIsAvailable() {
    return INTAKE_CONTACT_LOOKUP_ENABLED
}

function intakeExpand() {
    const expanded = INTAKE_CONTACT_LOOKUP_ENABLED ? INTAKE_EXPAND : INTAKE_EXPAND_WITHOUT_CONTACT
    return UNIFIED_JOB_RUNTIME ? `${expanded},gr_registeredjob($select=gr_jobid,createdon,gr_jobnumber,gr_ordernumber,gr_description,gr_gtentered,gr_timecloudentered${UNIFIED_JOB_SELECT};$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Contact($select=gr_contactid,gr_name))` : expanded
}

export async function fetchJobBookIntakeRows(accessToken: string, book: JobBookConfig = JOB_BOOKS.auckland, continuationLink?: string): Promise<JobBookPage> {
    const select = `${book.idField},${INTAKE_SELECT}`
    const nextUrl = continuationLink
        ? trustedNextLink(continuationLink)
        : `${DATAVERSE_URL}/api/data/v9.2/${book.tableSetName}?$select=${select}&$expand=${intakeExpand()}&$orderby=createdon desc`
    if (!nextUrl) return { records: [] }
    const response = await fetch(nextUrl, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', Prefer: `odata.maxpagesize=${JOB_BOOK_PAGE_SIZE}` },
    })
    if (!response.ok) throw new Error('Job Book Intake entries could not be loaded.')
    const data = await response.json() as { value?: IntakeApiRow[]; '@odata.nextLink'?: string }
    return {
        records: (data.value ?? []).map((row) => mapIntakeRow(row, book)),
        nextLink: trustedNextLink(data['@odata.nextLink']),
    }
}

function intakePayload(row: JobBookRow) {
    return {
        gr_mechanictext: row.mechanicName || null,
        gr_fleetsnapshot: row.fleet || null,
        gr_serialsnapshot: row.serial || null,
        gr_makesnapshot: row.make || null,
        gr_modelsnapshot: row.model || null,
        gr_customersnapshot: row.customer || null,
        gr_sitesnapshot: row.site || null,
        gr_addresssnapshot: row.address || null,
        gr_addressverified: row.addressVerified,
        gr_addressnotfoundconfirmed: row.addressNotFoundConfirmed,
        gr_description: row.description.trim(),
        gr_customerpo: row.customerPo || null,
        gr_entered: row.entered,
        gr_timecloudentered: row.timecloudEntered,
        gr_equipmentreviewrequired: row.equipmentReviewRequired,
        ...(row.mechanicId ? { 'gr_Mechanic@odata.bind': `/gr_mechanics(${row.mechanicId})` } : {}),
        ...(row.equipmentId && !row.equipmentId.startsWith('prototype-') ? { 'gr_Equipment@odata.bind': `/gr_equipments(${row.equipmentId})` } : {}),
        ...(row.customerId && !row.customerId.startsWith('prototype-') ? { 'gr_Customer@odata.bind': `/gr_customers(${row.customerId})` } : {}),
        ...(row.siteId && !row.siteId.startsWith('prototype-') ? { 'gr_Site@odata.bind': `/gr_sites(${row.siteId})` } : {}),
        ...(INTAKE_CONTACT_LOOKUP_ENABLED && row.contactId ? { 'gr_Contact@odata.bind': `/gr_contacts(${row.contactId})` } : {}),
    }
}

export async function createJobBookIntakeRow(accessToken: string, row: JobBookRow): Promise<JobBookRow> {
    if (row.intakeRecordId || row.linkedJobId || row.entryStage !== JOB_BOOK_ENTRY_STAGES.INTAKE) throw new Error('Only new Intake entries can allocate a Job Book number.')
    assertJobCreationLocation({ ...row, equipmentId: row.equipmentReviewRequired ? '' : row.equipmentId })
    const book = JOB_BOOKS[row.jobBookKey]
    const select = `${book.idField},${INTAKE_SELECT}`
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/${book.tableSetName}?$select=${select}&$expand=${intakeExpand()}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify({ ...intakePayload(row), gr_stage: INTAKE_STAGE }),
    })
    if (!response.ok) throw new Error('The Intake entry was not saved. No Job Number was allocated.')
    return mapIntakeRow(await response.json() as IntakeApiRow, book)
}

export async function updateJobBookIntakeRow(accessToken: string, row: JobBookRow, correctionsOnly = false): Promise<JobBookRow> {
    if (!isEditableJobBookIntake(row)) throw new Error('Only unpromoted Intake entries can be edited. Void entries are read-only.')
    const current = await readCurrentIntakeVersion(accessToken, row)
    if (!isEditableJobBookIntake(current)) throw new Error('This entry is no longer editable.')
    const payload: Record<string, unknown> = intakePayload(row)
    if (correctionsOnly) {
        for (const key of ['gr_mechanictext', 'gr_Mechanic@odata.bind', 'gr_entered', 'gr_timecloudentered']) delete payload[key]
    }
    return patchIntakeRow(accessToken, row, payload)
}

export async function fetchJobBookIntakeRow(accessToken: string, row: Pick<JobBookRow, 'jobBookKey' | 'intakeRecordId'>): Promise<JobBookRow> {
    if (!row.intakeRecordId) throw new Error('Select a saved Intake entry first.')
    const book = JOB_BOOKS[row.jobBookKey]
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/${book.tableSetName}(${row.intakeRecordId})?$select=${book.idField},${INTAKE_SELECT}&$expand=${intakeExpand()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('The latest Job Book entry could not be loaded. No changes were saved.')
    const record = await response.json() as IntakeApiRow
    if (record[book.idField as keyof IntakeApiRow] !== row.intakeRecordId || !(record.gr_stage in INTAKE_STAGE_TO_NAME)) throw new Error('The latest Job Book entry could not be verified. No changes were saved.')
    return mapIntakeRow(record, book)
}

async function readCurrentIntakeVersion(accessToken: string, row: JobBookRow) {
    if (!row.intakeRecordId || !/^W\/"[^"]+"$/.test(row.etag)) throw new Error('Reload this Intake entry before saving changes.')
    const current = await fetchJobBookIntakeRow(accessToken, row)
    if (current.etag !== row.etag) throw new JobBookConflictError()
    return current
}

export async function voidJobBookIntakeRow(accessToken: string, row: JobBookRow, reason: string): Promise<JobBookRow> {
    const error = jobBookVoidBlockedReason(row) || jobBookVoidReasonError(reason)
    if (error) throw new Error(error)
    if (UNIFIED_JOB_RUNTIME && row.registeredLedgerId) {
        try {
            if (UNIFIED_JOB_WALKTHROUGH) await walkthroughJobAction(accessToken, 'void', { book: row.jobBookKey, ledgerId: row.registeredLedgerId, jobId: row.linkedJobId, jobEtag: row.etag, ledgerEtag: row.ledgerEtag, reason: reason.trim() })
            else await runJobWorkflow(accessToken, { kind: 'void', book: row.jobBookKey, ledgerId: row.registeredLedgerId, jobId: row.linkedJobId, jobEtag: row.etag, ledgerEtag: row.ledgerEtag ?? '', reason: reason.trim() })
        } catch (cause) {
            if (cause instanceof Error && cause.message.startsWith('Someone else')) throw new JobBookConflictError()
            throw cause
        }
        return fetchJobBookIntakeRow(accessToken, row)
    }
    const current = await readCurrentIntakeVersion(accessToken, row)
    const blocked = jobBookVoidBlockedReason(current)
    if (blocked) throw new Error(blocked)
    // A status-only, conditional write preserves the number, snapshots and factual markers.
    return patchIntakeRow(accessToken, row, { gr_stage: VOID_STAGE, gr_voidreason: reason.trim() })
}

export async function updateJobBookIntakeMarker(accessToken: string, row: JobBookRow, field: 'entered' | 'timecloudEntered', value: boolean): Promise<JobBookRow> {
    if (row.entryStage === JOB_BOOK_ENTRY_STAGES.VOID) throw new Error('Void entries are read-only.')
    const current = await readCurrentIntakeVersion(accessToken, row)
    if (current.entryStage === JOB_BOOK_ENTRY_STAGES.VOID) throw new Error('Void entries are read-only.')
    return patchIntakeRow(accessToken, row, { [field === 'entered' ? 'gr_entered' : 'gr_timecloudentered']: value })
}

async function patchIntakeRow(accessToken: string, row: JobBookRow, payload: Record<string, unknown>): Promise<JobBookRow> {
    const book = JOB_BOOKS[row.jobBookKey]
    const select = `${book.idField},${INTAKE_SELECT}`
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/${book.tableSetName}(${row.intakeRecordId})?$select=${select}&$expand=${intakeExpand()}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'If-Match': row.etag,
            Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
    })
    if (response.status === 412) throw new JobBookConflictError()
    if (!response.ok) throw new Error('The Intake changes were not saved.')
    return mapIntakeRow(await response.json() as IntakeApiRow, book)
}
