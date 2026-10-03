import { JOB_BOOK_ENTRY_STAGES, type JobBookRow } from './jobBookPrototype.ts'

// Matches gr_voidreason's provisioned Memo capacity in every regional table.
export const JOB_BOOK_VOID_REASON_MAX_LENGTH = 1000

export function isEditableJobBookIntake(row: JobBookRow) {
    return row.entryStage === JOB_BOOK_ENTRY_STAGES.INTAKE
        && row.entrySource === 'dataverse-intake' && Boolean(row.intakeRecordId) && !row.linkedJobId
}

export function jobBookVoidBlockedReason(row: JobBookRow) {
    const registered = Boolean(row.registeredLedgerId && row.linkedJobId && row.entryStage === JOB_BOOK_ENTRY_STAGES.REGISTERED && row.coordinatorManaged === false)
    if (!isEditableJobBookIntake(row) && !registered) return 'Only unpromoted Intake or unmanaged Job Book entries can be marked as void.'
    if (row.entered || row.timecloudEntered) return 'This entry is marked as entered in GreenTree or Timecloud and cannot be voided. Any cancellation must be handled in the owning system.'
    // Missing marker data is not evidence that neither system has received the entry.
    if (row.entered !== false || row.timecloudEntered !== false) return 'Reload this entry to verify its GreenTree and Timecloud markers.'
    return ''
}

export function jobBookVoidReasonError(reason: string) {
    if (!reason.trim()) return 'Enter a reason for marking this entry as void.'
    if (reason.trim().length > JOB_BOOK_VOID_REASON_MAX_LENGTH) return `Keep the reason to ${JOB_BOOK_VOID_REASON_MAX_LENGTH} characters or fewer.`
    return ''
}

export function canUpdateJobBookMarkers(row: JobBookRow, allowManagedJobMarkerUpdates: boolean) {
    if (row.entryStage === JOB_BOOK_ENTRY_STAGES.VOID) return false
    if (row.linkedJobId || row.entryStage === JOB_BOOK_ENTRY_STAGES.PROMOTED || row.entrySource === 'dataverse-job') {
        return allowManagedJobMarkerUpdates && Boolean(row.linkedJobId)
    }
    return row.entrySource === 'dataverse-intake' && Boolean(row.intakeRecordId)
}
