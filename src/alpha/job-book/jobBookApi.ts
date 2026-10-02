import { JOB_BOOK_ENTRY_STAGES, MANAGED_JOB_ENTRY_MARKER_COLUMNS, type JobBookRow } from './jobBookPrototype'
import { JOB_BOOKS, jobNumberBelongsToBook, managedJobNumberFilter, type JobBookConfig } from './jobBookConfig'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

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
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet: string | null
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
}

const INTAKE_STAGE_TO_NAME = {
    122830000: JOB_BOOK_ENTRY_STAGES.INTAKE,
    122830001: JOB_BOOK_ENTRY_STAGES.PROMOTED,
    122830002: JOB_BOOK_ENTRY_STAGES.LEGACY,
    122830003: JOB_BOOK_ENTRY_STAGES.VOID,
} as const

function localDate(isoDate: string) {
    return new Date(isoDate).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
}

export const JOB_BOOK_PAGE_SIZE = 100

export type JobBookPage = {
    records: JobBookRow[]
    nextLink?: string
}

export async function fetchRecentJobBookRows(accessToken: string, book: JobBookConfig = JOB_BOOKS.auckland, continuationLink?: string): Promise<JobBookPage> {
    const select = 'gr_jobid,createdon,gr_jobnumber,gr_ordernumber,gr_description,gr_gtentered,gr_timecloudentered'
    const expand = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Contact($select=gr_contactid,gr_name)'
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
    return { records: (data.value ?? []).filter((job) => job.gr_jobnumber && jobNumberBelongsToBook(job.gr_jobnumber, book)).map((job) => ({
        jobBookKey: book.key,
        id: `dataverse-${book.key}-${job.gr_jobid}`,
        jobNumber: job.gr_jobnumber?.trim() ?? '',
        date: localDate(job.createdon),
        mechanicId: job.gr_Mechanic?.gr_mechanicid ?? '',
        mechanicName: job.gr_Mechanic?.gr_name ?? '',
        equipmentId: job.gr_Equipment?.gr_equipmentid ?? '',
        fleet: job.gr_Equipment?.gr_fleet?.trim() || job.gr_Equipment?.gr_serial?.trim() || '',
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
        equipmentReviewRequired: false,
        entryStage: JOB_BOOK_ENTRY_STAGES.PROMOTED,
        entrySource: 'dataverse-job',
        linkedJobId: job.gr_jobid,
        intakeRecordId: '',
        etag: job['@odata.etag'] ?? '',
    })), nextLink: trustedNextLink(data['@odata.nextLink']) }
}

export async function updateManagedJobBookMarker(
    accessToken: string,
    row: JobBookRow,
    field: 'entered' | 'timecloudEntered',
    value: boolean,
): Promise<Pick<JobBookRow, 'entered' | 'timecloudEntered' | 'etag'>> {
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
        entryStage: INTAKE_STAGE_TO_NAME[row.gr_stage as keyof typeof INTAKE_STAGE_TO_NAME] ?? JOB_BOOK_ENTRY_STAGES.INTAKE,
        entrySource: 'dataverse-intake',
        linkedJobId: row.gr_PromotedJob?.gr_jobid ?? '',
        intakeRecordId,
        etag: row['@odata.etag'] ?? '',
    }
}

const INTAKE_SELECT = 'createdon,gr_jobnumber,gr_stage,gr_mechanictext,gr_fleetsnapshot,gr_serialsnapshot,gr_makesnapshot,gr_modelsnapshot,gr_customersnapshot,gr_sitesnapshot,gr_addresssnapshot,gr_addressverified,gr_addressnotfoundconfirmed,gr_description,gr_customerpo,gr_entered,gr_timecloudentered,gr_equipmentreviewrequired'
const INTAKE_EXPAND_WITHOUT_CONTACT = 'gr_Mechanic($select=gr_mechanicid,gr_name),gr_Equipment($select=gr_equipmentid),gr_Customer($select=gr_customerid),gr_Site($select=gr_siteid),gr_PromotedJob($select=gr_jobid)'
const INTAKE_EXPAND = `${INTAKE_EXPAND_WITHOUT_CONTACT},gr_Contact($select=gr_contactid,gr_name)`
const INTAKE_CONTACT_LOOKUP_ENABLED = import.meta.env.VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED === 'true'

export function jobBookIntakeContactLookupIsAvailable() {
    return INTAKE_CONTACT_LOOKUP_ENABLED
}

function intakeExpand() {
    return INTAKE_CONTACT_LOOKUP_ENABLED ? INTAKE_EXPAND : INTAKE_EXPAND_WITHOUT_CONTACT
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
        gr_stage: 122830000,
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
        body: JSON.stringify(intakePayload(row)),
    })
    if (!response.ok) throw new Error('The Intake entry was not saved. No Job Number was allocated.')
    return mapIntakeRow(await response.json() as IntakeApiRow, book)
}

export async function updateJobBookIntakeRow(accessToken: string, row: JobBookRow): Promise<JobBookRow> {
    if (!row.intakeRecordId || !row.etag) throw new Error('Reload this Intake entry before saving changes.')
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
        body: JSON.stringify(intakePayload(row)),
    })
    if (response.status === 412) throw new Error('Someone else changed this Intake entry. Reload the page before trying again.')
    if (!response.ok) throw new Error('The Intake changes were not saved.')
    return mapIntakeRow(await response.json() as IntakeApiRow, book)
}
