import { JOB_BOOKS, type JobBookKey } from '../../job-book/jobBookConfig.ts'

export type ManageJobBookJobCommand = Readonly<{
    kind: 'manage'
    jobId: string
    jobEtag: string
}>
export type VoidRegisteredJobBookEntryCommand = Readonly<{
    kind: 'void'
    book: JobBookKey
    jobId: string
    ledgerId: string
    jobEtag: string
    ledgerEtag: string
    reason: string
}>
export type QueueInitialJobDispatchCommand = Readonly<{
    kind: 'dispatch'
    requestId: string
    jobId: string
    jobEtag: string
    recipientEmail: string
    subject: string
    body: string
}>
export type JobWorkflowCommand = ManageJobBookJobCommand | VoidRegisteredJobBookEntryCommand | QueueInitialJobDispatchCommand
export type JobWorkflowResult = Readonly<{
    jobId: string
    ledgerId?: string
    dispatchId?: string
    jobEtag?: string
    ledgerEtag?: string
    coordinatorManaged?: boolean
    registrationVoid?: boolean
    replayed: boolean
}>

export class JobWorkflowError extends Error {
    readonly kind: 'disabled' | 'invalid' | 'conflict' | 'rejected' | 'unknown'
    constructor(kind: JobWorkflowError['kind'], message: string) {
        super(message)
        this.name = 'JobWorkflowError'
        this.kind = kind
    }
}

const GUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const EMPTY_ID = '00000000-0000-0000-0000-000000000000'
const unknownResult = () => new JobWorkflowError('unknown', 'The change could not be confirmed. Reload the Job and regional entry before trying again.')

function id(value: string) {
    if (typeof value !== 'string' || !GUID.test(value) || value === EMPTY_ID) throw new JobWorkflowError('invalid', 'A valid saved record ID is required.')
    return value.toLowerCase()
}
function version(value: string) {
    const match = typeof value === 'string' && value.match(/^W\/"([0-9]+)"$/)
    if (!match) throw new JobWorkflowError('invalid', 'Reload the record to obtain its exact current version.')
    return match[1]
}
function reason(value: string) {
    if (typeof value !== 'string') throw new JobWorkflowError('invalid', 'Enter a Void reason.')
    const result = value.trim()
    const unsupported = [...result].some((character) => character.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(character))
    if (!result || result.length > 1000 || unsupported) throw new JobWorkflowError('invalid', 'Enter a Void reason of at most 1,000 characters.')
    return result
}
function boundedText(value: string, maximum: number, label: string) {
    if (typeof value !== 'string') throw new JobWorkflowError('invalid', `Enter a valid ${label}.`)
    const result = value.trim()
    const unsupported = [...result].some((character) => character.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(character))
    if (!result || result.length > maximum || unsupported) throw new JobWorkflowError('invalid', `Enter a valid ${label} of at most ${maximum.toLocaleString()} characters.`)
    return result
}
function email(value: string) {
    const result = boundedText(value, 320, 'technician email').toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new JobWorkflowError('invalid', 'The assigned technician needs a valid email address.')
    return result
}

export function buildJobWorkflowAction(command: JobWorkflowCommand) {
    if (!command || !['manage', 'void', 'dispatch'].includes(command.kind)) throw new JobWorkflowError('invalid', 'Select a supported Job workflow action.')
    const allowed = command.kind === 'manage'
        ? ['kind', 'jobId', 'jobEtag']
        : command.kind === 'void'
            ? ['kind', 'book', 'jobId', 'ledgerId', 'jobEtag', 'ledgerEtag', 'reason']
            : ['kind', 'requestId', 'jobId', 'jobEtag', 'recipientEmail', 'subject', 'body']
    if (Object.keys(command).some((field) => !allowed.includes(field))) throw new JobWorkflowError('invalid', 'The workflow action cannot change unrelated Job, scheduling, evidence or marker fields.')
    const parameters: Record<string, string> = {
        JobId: id(command.jobId),
        ExpectedJobRowVersion: version(command.jobEtag),
    }
    if (command.kind === 'void') {
        if (!Object.hasOwn(JOB_BOOKS, command.book)) throw new JobWorkflowError('invalid', 'Select a supported regional Job Book.')
        parameters.Book = command.book
        parameters.LedgerId = id(command.ledgerId)
        parameters.ExpectedLedgerRowVersion = version(command.ledgerEtag)
        parameters.Reason = reason(command.reason)
    } else if (command.kind === 'dispatch') {
        parameters.RequestId = id(command.requestId)
        parameters.RecipientEmail = email(command.recipientEmail)
        parameters.Subject = boundedText(command.subject, 500, 'email subject')
        parameters.Body = boundedText(command.body, 100000, 'email body')
    }
    return {
        action: command.kind === 'manage' ? 'gr_ManageJobBookJob' : command.kind === 'void' ? 'gr_VoidRegisteredJobBookEntry' : 'gr_QueueInitialJobDispatch',
        parameters: Object.freeze(parameters),
    }
}

/** No direct table-write fallback, silent retry, login, or role/capability input is permitted here. */
export function createJobWorkflowClient(options: { apiUrl: string; enabled: boolean; fetcher?: typeof fetch }) {
    return async (accessToken: string, command: JobWorkflowCommand): Promise<JobWorkflowResult> => {
        if (!options.enabled) throw new JobWorkflowError('disabled', 'Unified Job workflow changes are not enabled. No changes were made.')
        const { action, parameters } = buildJobWorkflowAction(command)
        let response: Response
        try {
            response = await (options.fetcher ?? fetch)(`${options.apiUrl.replace(/\/$/, '')}/${action}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
                body: JSON.stringify(parameters),
            })
        } catch { throw unknownResult() }
        if (!response.ok) {
            const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
            const message = body?.error?.message
            const code = typeof message === 'string' ? message.match(/\[JOB_WORKFLOW_([A-Z_]+)\]/)?.[1] : undefined
            if (response.status === 412 || code === 'CONFLICT' || code === 'REQUEST_REUSED') throw new JobWorkflowError('conflict', 'The Job, regional entry or retained request changed elsewhere. Reload before continuing.')
            if (response.status === 401 || response.status === 403 || code === 'FORBIDDEN') throw new JobWorkflowError('rejected', 'Your current access does not permit this workflow action.')
            if (code === 'INVALID' || code === 'NOT_FOUND') throw new JobWorkflowError('rejected', 'This Job is no longer eligible for the requested workflow action. Reload and review it.')
            if (code === 'INCONSISTENT' || code === 'CONFIGURATION' || response.status === 404) throw new JobWorkflowError('rejected', 'The Job and regional entry need administrator setup or reconciliation.')
            throw unknownResult()
        }
        try {
            const result = await response.json() as Record<string, unknown>
            const expectedJob = parameters.JobId
            if (command.kind === 'dispatch') {
                if (id(result.DispatchId as string) !== parameters.RequestId || typeof result.WasReplay !== 'boolean') throw unknownResult()
                return { jobId: expectedJob, dispatchId: parameters.RequestId, replayed: result.WasReplay }
            }
            const expectedLedger = command.kind === 'void' ? parameters.LedgerId : undefined
            if (id(result.JobId as string) !== expectedJob ||
                (expectedLedger !== undefined && id(result.LedgerId as string) !== expectedLedger) ||
                typeof result.JobRowVersion !== 'string' || !/^[0-9]+$/.test(result.JobRowVersion) ||
                (expectedLedger !== undefined && (typeof result.LedgerRowVersion !== 'string' || !/^[0-9]+$/.test(result.LedgerRowVersion))) ||
                typeof result.CoordinatorManaged !== 'boolean' || typeof result.RegistrationVoid !== 'boolean' || typeof result.WasReplay !== 'boolean' ||
                (command.kind === 'manage' && (!result.CoordinatorManaged || result.RegistrationVoid)) ||
                (command.kind === 'void' && (result.CoordinatorManaged || !result.RegistrationVoid))) throw unknownResult()
            return {
                jobId: expectedJob,
                ledgerId: expectedLedger,
                jobEtag: `W/"${result.JobRowVersion}"`,
                ledgerEtag: expectedLedger === undefined ? undefined : `W/"${result.LedgerRowVersion}"`,
                coordinatorManaged: result.CoordinatorManaged,
                registrationVoid: result.RegistrationVoid,
                replayed: result.WasReplay,
            }
        } catch { throw unknownResult() }
    }
}

const environment = import.meta.env
export const JOB_WORKFLOW_ENABLED = environment?.VITE_UNIFIED_JOB_WORKFLOW_ENABLED === 'true'
export const runJobWorkflow = createJobWorkflowClient({
    apiUrl: `${environment?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`,
    enabled: JOB_WORKFLOW_ENABLED,
})
