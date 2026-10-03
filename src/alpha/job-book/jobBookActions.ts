import { JOB_BOOK_ENTRY_STAGES, type JobBookRow } from './jobBookPrototype.ts'
import type { NumberedJobBookClipboardSource } from '../jobs/utils/jobBookClipboard.ts'

export function jobBookCopyBlockedReason(row: JobBookRow) {
    if (row.entryStage === JOB_BOOK_ENTRY_STAGES.VOID) return 'Void entries cannot be copied into the order number book.'
    return row.jobNumber.trim() ? '' : 'A Job Number is required before copying into the order number book.'
}

export function jobBookEmailBlockedReason(row: JobBookRow, permitted: boolean) {
    if (!permitted) return 'This role cannot email managed Jobs.'
    if (row.entryStage === JOB_BOOK_ENTRY_STAGES.VOID) return 'Void entries cannot be emailed.'
    if (!row.linkedJobId) return 'A coordinator must create a managed Job before it can be emailed. Intake is not sent to technicians.'
    if (!row.jobNumber.trim()) return 'A Job Number is required before emailing.'
    if (!row.mechanicId) return 'A coordinator must assign a technician before this Job can be emailed.'
    return ''
}

/** Keeps Intake snapshots intact and uses the same numbered spreadsheet contract as Jobs. */
export function jobBookClipboardSource(row: JobBookRow): NumberedJobBookClipboardSource {
    return {
        gr_jobnumber: row.jobNumber,
        gr_Mechanic: { gr_name: row.mechanicName },
        gr_Equipment: { gr_fleet: row.primaryFleet ?? row.fleet, gr_alternatefleetnumbers: row.alternateFleetNumbers },
        gr_Site: { gr_Customer: { gr_name: row.customer } },
    }
}
