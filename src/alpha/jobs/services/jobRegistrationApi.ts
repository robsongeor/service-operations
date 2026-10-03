import { JOB_BOOKS, jobNumberBelongsToBook, type JobBookKey } from '../../job-book/jobBookConfig.ts'

export type RegisterJobBookCommand = Readonly<{
    kind: 'register'
    /** Generated once when confirmation begins; retain this same ID/body after an uncertain response. */
    requestId: string
    book: JobBookKey
    description: string
    orderNumber?: string
    siteId: string
    equipmentId?: string
    equipmentUnknown: boolean
    contactId?: string
    mechanicId?: string
}>
export type AllocateJobBookNumberCommand = Readonly<{
    kind: 'allocate'
    requestId: string
    book: JobBookKey
    jobId: string
    etag: string
}>
export type JobRegistrationCommand = RegisterJobBookCommand | AllocateJobBookNumberCommand
export type JobRegistrationResult = Readonly<{
    jobId: string
    ledgerId: string
    book: JobBookKey
    jobNumber: string
    etag: string
    replayed: boolean
}>
export class JobRegistrationError extends Error {
    readonly kind: 'disabled' | 'invalid' | 'conflict' | 'rejected' | 'unknown'
    constructor(kind: JobRegistrationError['kind'], message: string) {
        super(message)
        this.name = 'JobRegistrationError'
        this.kind = kind
    }
}

const GUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const EMPTY_ID = '00000000-0000-0000-0000-000000000000'
const unknownResult = () => new JobRegistrationError('unknown', 'The save could not be confirmed. Keep this request and retry it; do not start another entry or request another number.')

function id(value: string) {
    if (typeof value !== 'string' || !GUID.test(value) || value === EMPTY_ID) throw new JobRegistrationError('invalid', 'A valid saved record or request ID is required.')
    return value.toLowerCase()
}
function text(value: string | undefined, maximum: number, required = false) {
    if (value != null && typeof value !== 'string') throw new JobRegistrationError('invalid', 'Enter valid text.')
    const result = value?.trim() ?? ''
    const hasUnsupportedControl = [...result].some((character) => character.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(character))
    if ((required && !result) || result.length > maximum || hasUnsupportedControl) {
        throw new JobRegistrationError('invalid', `Enter valid text of at most ${maximum.toLocaleString()} characters.`)
    }
    return result
}

export function buildJobRegistrationAction(command: JobRegistrationCommand) {
    if (!command || (command.kind !== 'register' && command.kind !== 'allocate')) throw new JobRegistrationError('invalid', 'Select a supported registration action.')
    const allowed = command.kind === 'register'
        ? ['kind', 'requestId', 'book', 'description', 'orderNumber', 'siteId', 'equipmentId', 'equipmentUnknown', 'contactId', 'mechanicId']
        : ['kind', 'requestId', 'book', 'jobId', 'etag']
    if (Object.keys(command).some((field) => !allowed.includes(field))) throw new JobRegistrationError('invalid', 'Registration cannot change operational controls or accept additional fields.')
    if (!Object.hasOwn(JOB_BOOKS, command.book)) throw new JobRegistrationError('invalid', 'Select a supported regional Job Book.')
    const parameters: Record<string, string | boolean> = { RequestId: id(command.requestId), Book: command.book }
    if (command.kind === 'allocate') {
        const version = typeof command.etag === 'string' && command.etag.match(/^W\/"([0-9]+)"$/)
        if (!version) throw new JobRegistrationError('invalid', 'Reload the Job to obtain its exact current version.')
        parameters.JobId = id(command.jobId)
        parameters.ExpectedRowVersion = version[1]
    } else {
        if (typeof command.equipmentUnknown !== 'boolean' || command.equipmentUnknown === Boolean(command.equipmentId)) throw new JobRegistrationError('invalid', 'Select Equipment or explicitly confirm it is not known yet.')
        parameters.Description = text(command.description, 4000, true)
        parameters.OrderNumber = text(command.orderNumber, 100)
        parameters.SiteId = id(command.siteId)
        parameters.EquipmentUnknown = command.equipmentUnknown
        if (command.equipmentId) parameters.EquipmentId = id(command.equipmentId)
        if (command.contactId) parameters.ContactId = id(command.contactId)
        if (command.mechanicId) parameters.MechanicId = id(command.mechanicId)
    }
    return {
        action: command.kind === 'register' ? 'gr_RegisterJobBookJob' : 'gr_AllocateJobBookNumber',
        parameters: Object.freeze(parameters),
        expectedJobId: command.kind === 'register' ? parameters.RequestId : parameters.JobId,
    }
}

/** No direct table writes, fallback allocation, silent retries, login, or request-ID generation here. */
export function createJobRegistrationClient(options: { apiUrl: string; enabled: boolean; fetcher?: typeof fetch }) {
    return async (accessToken: string, command: JobRegistrationCommand): Promise<JobRegistrationResult> => {
        if (!options.enabled) throw new JobRegistrationError('disabled', 'Unified Job registration is not enabled. No changes were made.')
        const { action, parameters, expectedJobId } = buildJobRegistrationAction(command)
        const book = parameters.Book as JobBookKey
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
            const code = typeof message === 'string' ? message.match(/\[JOB_REGISTRATION_([A-Z_]+)\]/)?.[1] : undefined
            if (response.status === 412 || code === 'CONFLICT' || code === 'ALREADY_NUMBERED' || code === 'REQUEST_REUSED') {
                throw new JobRegistrationError('conflict', 'This Job or request changed elsewhere. Reload and review it before continuing; do not overwrite its number.')
            }
            if (response.status === 401 || response.status === 403) throw new JobRegistrationError('rejected', 'Your current access does not permit this registration action.')
            if (code === 'INVALID' || code === 'SPECIALIST' || code === 'NOT_FOUND') throw new JobRegistrationError('rejected', 'The current Job details are not eligible for registration. Reload and check the Customer, Site, Equipment and technician.')
            if (code === 'INCONSISTENT' || code === 'CONFIGURATION' || response.status === 404) throw new JobRegistrationError('rejected', 'Registration needs administrator setup or reconciliation. No replacement number should be requested.')
            throw unknownResult()
        }
        try {
            const result = await response.json() as Record<string, unknown>
            if (id(result.JobId as string) !== expectedJobId || id(result.LedgerId as string) !== parameters.RequestId || result.Book !== book ||
                typeof result.JobNumber !== 'string' || result.JobNumber.length > 30 || !jobNumberBelongsToBook(result.JobNumber, JOB_BOOKS[book]) ||
                result.JobNumber !== result.JobNumber.trim().toUpperCase() || typeof result.WasReplay !== 'boolean' ||
                typeof result.JobRowVersion !== 'string' || !/^[0-9]+$/.test(result.JobRowVersion)) throw unknownResult()
            return { jobId: expectedJobId as string, ledgerId: parameters.RequestId as string, book, jobNumber: result.JobNumber, etag: `W/"${result.JobRowVersion}"`, replayed: result.WasReplay }
        } catch { throw unknownResult() }
    }
}

const environment = import.meta.env
export const registerOrAllocateJob = createJobRegistrationClient({
    apiUrl: `${environment?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`,
    enabled: environment?.VITE_UNIFIED_JOB_REGISTRATION_ENABLED === 'true',
})
