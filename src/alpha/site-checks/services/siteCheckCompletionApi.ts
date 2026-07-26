import { buildJobUpdateFields } from '../../jobs/services/jobsApi.ts'
import type { JobSaveInput } from '../../jobs/types/jobSave.types.ts'
import { JOB_STATUSES, type JobStatus } from '../../jobs/types/jobStatus.types.ts'
import { JOB_TYPES } from '../../jobs/types/jobType.types.ts'
import { newZealandDateOnly } from '../../shared/dates/dateOnly.ts'
import { calculateNextSiteCheckDueDate, calculateSiteCheckProgress } from '../domain/siteCheckCalculations.ts'
import {
    SITE_CHECK_STATUSES,
    type SiteCheck,
    type SiteCheckJobProgressInput,
    type SiteCheckSchedule,
} from '../types/siteCheck.types.ts'

const DEFAULT_API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CompletionJob = SiteCheckJobProgressInput & {
    gr_jobid: string
    gr_jobtype: number
    gr_completeddate?: string | null
    _gr_equipment_value?: string | null
    _gr_site_value?: string | null
    '@odata.etag': string
}

type CompletionContext = {
    job: CompletionJob
    siteCheck: SiteCheck
    schedule: SiteCheckSchedule
    jobs: CompletionJob[]
}

type ChangeRequest = {
    entityPath: string
    etag: string
    fields: Record<string, unknown>
}

export type SiteCheckJobStatusInput = {
    jobId: string
    status: JobStatus
    pendingSave?: JobSaveInput
    completedOn?: string
}

export type SiteCheckJobStatusResult = {
    completedDate?: string
    siteCheckCompleted: boolean
    alreadyApplied: boolean
}

type ServiceOptions = {
    apiUrl?: string
    fetcher?: typeof fetch
}

function requireGuid(value: string, label: string) {
    const normalized = value.trim().replace(/[{}]/g, '').toLowerCase()
    if (!GUID_PATTERN.test(normalized)) {
        throw new Error(`${label} is invalid. Refresh the page and try again.`)
    }
    return normalized
}

function sameId(first?: string | null, second?: string | null) {
    return Boolean(first && second && first.toLowerCase() === second.toLowerCase())
}

function requireEtag(record: { '@odata.etag'?: string }, label: string) {
    if (!record['@odata.etag']) {
        throw new Error(`${label} does not include a concurrency version. Refresh and try again.`)
    }
    return record['@odata.etag']
}

async function dataverseJson<T>(
    token: string,
    path: string,
    action: string,
    options: ServiceOptions,
): Promise<T> {
    const response = await (options.fetcher ?? fetch)(`${options.apiUrl ?? DEFAULT_API_URL}/${path}`, {
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
        },
    })
    if (!response.ok) throw new Error(`${action} Refresh the page and try again.`)
    return response.json() as Promise<T>
}

async function loadContext(
    token: string,
    jobId: string,
    options: ServiceOptions,
): Promise<CompletionContext | null> {
    const job = await dataverseJson<CompletionJob>(
        token,
        `gr_jobs(${jobId})?$select=gr_jobid,gr_jobtype,gr_status,gr_completeddate,_gr_sitecheck_value,_gr_equipment_value,_gr_site_value`,
        'The authoritative Job could not be loaded.',
        options,
    )
    if (!job._gr_sitecheck_value) return null

    const siteCheckId = requireGuid(job._gr_sitecheck_value, 'Parent Site Check identifier')
    const siteCheck = await dataverseJson<SiteCheck>(
        token,
        `gr_sitechecks(${siteCheckId})?$select=gr_sitecheckid,gr_name,gr_status,gr_startedon,gr_completedon,gr_frequencysnapshot,gr_duedatesnapshot,gr_expectedjobcount,gr_creationrequestkey,_gr_sitecheckschedule_value,_gr_site_value,_gr_assignedtechnician_value`,
        'The authoritative Site Check could not be loaded.',
        options,
    )
    const scheduleId = requireGuid(siteCheck._gr_sitecheckschedule_value, 'Site Check Schedule identifier')
    const filter = encodeURIComponent(`_gr_sitecheck_value eq ${siteCheckId}`)
    const [schedule, jobsResponse] = await Promise.all([
        dataverseJson<SiteCheckSchedule>(
            token,
            `gr_sitecheckschedules(${scheduleId})?$select=gr_sitecheckscheduleid,gr_name,gr_enabled,gr_frequency,gr_nextduedate,gr_lastcompleteddate,_gr_site_value,_gr_activesitecheck_value`,
            'The authoritative Site Check Schedule could not be loaded.',
            options,
        ),
        dataverseJson<{ value?: CompletionJob[] }>(
            token,
            `gr_jobs?$select=gr_jobid,gr_jobtype,gr_status,gr_completeddate,_gr_sitecheck_value,_gr_equipment_value,_gr_site_value&$filter=${filter}`,
            'The generated Site Check Jobs could not be loaded.',
            options,
        ),
    ])
    return { job, siteCheck, schedule, jobs: jobsResponse.value ?? [] }
}

function validateContext(context: CompletionContext, input: SiteCheckJobStatusInput) {
    if (context.job.gr_jobtype !== JOB_TYPES.SITE_CHECK) {
        throw new Error('Only a Site Check Job may link to a Site Check occurrence.')
    }
    if (context.jobs.some((job) =>
        job.gr_jobtype !== JOB_TYPES.SITE_CHECK
        || !sameId(job._gr_sitecheck_value, context.siteCheck.gr_sitecheckid),
    )) {
        throw new Error('The Site Check contains an invalid generated Job relationship.')
    }
    const progress = calculateSiteCheckProgress(context.jobs, context.siteCheck.gr_expectedjobcount)
    if (progress.hasIntegrityMismatch) {
        throw new Error(
            `Site Check completion is blocked because ${progress.total} Jobs exist but ${progress.expected} were expected.`,
        )
    }
    if (context.siteCheck.gr_status === SITE_CHECK_STATUSES.COMPLETE
        && input.status !== JOB_STATUSES.COMPLETE) {
        throw new Error('A generated Job cannot be reopened after its Site Check is complete.')
    }
    if (input.pendingSave) {
        if (input.pendingSave.jobType !== JOB_TYPES.SITE_CHECK) {
            throw new Error('A generated Site Check Job must retain the Site Check Job Type.')
        }
        if (!sameId(input.pendingSave.equipmentId, context.job._gr_equipment_value)) {
            throw new Error('A generated Site Check Job must retain its original Equipment.')
        }
        if (!sameId(input.pendingSave.siteId, context.job._gr_site_value)) {
            throw new Error('A generated Site Check Job must retain its original Site.')
        }
    }
    if (context.siteCheck.gr_status !== SITE_CHECK_STATUSES.COMPLETE) {
        if (!sameId(context.schedule._gr_activesitecheck_value, context.siteCheck.gr_sitecheckid)) {
            throw new Error('The Site Check is not the active occurrence on its Schedule.')
        }
        if (context.schedule.gr_frequency !== context.siteCheck.gr_frequencysnapshot) {
            throw new Error('The Site Check cadence no longer matches its Schedule. Refresh before completing it.')
        }
    }
}

function buildChangeSet(requests: ChangeRequest[]) {
    const batchBoundary = `batch_${crypto.randomUUID()}`
    const changeBoundary = `changeset_${crypto.randomUUID()}`
    const lines = [
        `--${batchBoundary}`,
        `Content-Type: multipart/mixed; boundary=${changeBoundary}`,
        '',
    ]
    requests.forEach((request, index) => {
        lines.push(
            `--${changeBoundary}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${index + 1}`,
            '',
            `PATCH /api/data/v9.2/${request.entityPath} HTTP/1.1`,
            'Accept: application/json',
            'Content-Type: application/json; type=entry',
            `If-Match: ${request.etag}`,
            '',
            JSON.stringify(request.fields),
            '',
        )
    })
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')
    return { body: lines.join('\r\n'), contentType: `multipart/mixed; boundary=${batchBoundary}` }
}

function nestedFailureStatus(body: string) {
    const statuses = [...body.matchAll(/HTTP\/1\.1\s+(\d{3})/g)].map((match) => Number(match[1]))
    return statuses.find((status) => status >= 400)
}

async function executeAtomicChanges(
    token: string,
    requests: ChangeRequest[],
    options: ServiceOptions,
) {
    const batch = buildChangeSet(requests)
    const response = await (options.fetcher ?? fetch)(`${options.apiUrl ?? DEFAULT_API_URL}/$batch`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': batch.contentType,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'If-None-Match': 'null',
        },
        body: batch.body,
    })
    const body = await response.text()
    const nestedFailure = nestedFailureStatus(body)
    if (!response.ok || nestedFailure) {
        const error = new Error(
            response.status === 412 || nestedFailure === 412
                ? 'The Job or Site Check changed while completion was being saved.'
                : 'Dataverse rejected the atomic Site Check completion transaction.',
        )
        Object.assign(error, { status: nestedFailure ?? response.status })
        throw error
    }
    if ([...body.matchAll(/HTTP\/1\.1\s+2\d{2}/g)].length !== requests.length) {
        throw new Error('Dataverse did not confirm every Site Check completion operation.')
    }
}

function jobFields(input: SiteCheckJobStatusInput, completedDate?: string) {
    if (input.pendingSave) {
        return buildJobUpdateFields({
            ...input.pendingSave,
            status: input.status,
            completedDate: completedDate ?? input.pendingSave.completedDate,
        })
    }
    return {
        gr_status: input.status,
        ...(completedDate ? { gr_completeddate: completedDate } : {}),
    }
}

function willCompleteSiteCheck(context: CompletionContext, status: JobStatus) {
    if (status !== JOB_STATUSES.COMPLETE) return false
    const projected = context.jobs.map((job) =>
        sameId(job.gr_jobid, context.job.gr_jobid) ? { ...job, gr_status: status } : job
    )
    return calculateSiteCheckProgress(projected, context.siteCheck.gr_expectedjobcount).isComplete
}

function completionRequests(
    context: CompletionContext,
    input: SiteCheckJobStatusInput,
    completedOn: string,
): ChangeRequest[] {
    const completedDate = newZealandDateOnly(completedOn)
    return [
        {
            entityPath: `gr_jobs(${context.job.gr_jobid})`,
            etag: requireEtag(context.job, 'The Job'),
            fields: jobFields(input, completedOn),
        },
        {
            entityPath: `gr_sitechecks(${context.siteCheck.gr_sitecheckid})`,
            etag: requireEtag(context.siteCheck, 'The Site Check'),
            fields: {
                gr_status: SITE_CHECK_STATUSES.COMPLETE,
                gr_completedon: completedOn,
            },
        },
        {
            entityPath: `gr_sitecheckschedules(${context.schedule.gr_sitecheckscheduleid})`,
            etag: requireEtag(context.schedule, 'The Site Check Schedule'),
            fields: {
                gr_lastcompleteddate: completedDate,
                gr_nextduedate: calculateNextSiteCheckDueDate(
                    completedDate,
                    context.siteCheck.gr_frequencysnapshot,
                ),
                'gr_ActiveSiteCheck@odata.bind': null,
            },
        },
    ]
}

async function patchJob(
    token: string,
    context: CompletionContext,
    input: SiteCheckJobStatusInput,
    completedOn: string | undefined,
    options: ServiceOptions,
) {
    const response = await (options.fetcher ?? fetch)(
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_jobs(${context.job.gr_jobid})`,
        {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'If-Match': requireEtag(context.job, 'The Job'),
            },
            body: JSON.stringify(jobFields(input, completedOn)),
        },
    )
    if (!response.ok) {
        throw new Error(response.status === 412
            ? 'The Job changed while its status was being saved. Refresh and retry.'
            : 'The Site Check Job status could not be saved.')
    }
}

function completionCommitted(context: CompletionContext) {
    return context.siteCheck.gr_status === SITE_CHECK_STATUSES.COMPLETE
        && context.jobs.length === context.siteCheck.gr_expectedjobcount
        && context.jobs.every((job) => job.gr_status === JOB_STATUSES.COMPLETE)
        && !context.schedule._gr_activesitecheck_value
        && Boolean(context.siteCheck.gr_completedon)
}

async function reconcileCompletedOccurrence(
    token: string,
    context: CompletionContext,
    options: ServiceOptions,
) {
    if (context.siteCheck.gr_status === SITE_CHECK_STATUSES.COMPLETE) return completionCommitted(context)
    const progress = calculateSiteCheckProgress(context.jobs, context.siteCheck.gr_expectedjobcount)
    if (!progress.isComplete) return false
    const completedOn = context.jobs
        .map((job) => job.gr_completeddate)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? new Date().toISOString()
    const completedDate = newZealandDateOnly(completedOn)
    await executeAtomicChanges(token, [
        {
            entityPath: `gr_sitechecks(${context.siteCheck.gr_sitecheckid})`,
            etag: requireEtag(context.siteCheck, 'The Site Check'),
            fields: { gr_status: SITE_CHECK_STATUSES.COMPLETE, gr_completedon: completedOn },
        },
        {
            entityPath: `gr_sitecheckschedules(${context.schedule.gr_sitecheckscheduleid})`,
            etag: requireEtag(context.schedule, 'The Site Check Schedule'),
            fields: {
                gr_lastcompleteddate: completedDate,
                gr_nextduedate: calculateNextSiteCheckDueDate(
                    completedDate,
                    context.siteCheck.gr_frequencysnapshot,
                ),
                'gr_ActiveSiteCheck@odata.bind': null,
            },
        },
    ], options)
    return true
}

async function reconcileWithReload(
    token: string,
    context: CompletionContext,
    options: ServiceOptions,
) {
    try {
        return await reconcileCompletedOccurrence(token, context, options)
    } catch (error) {
        const refreshed = await loadContext(token, context.job.gr_jobid, options)
        if (refreshed && completionCommitted(refreshed)) return true
        throw new Error(
            'The Site Check completion result could not be confirmed. Refresh before retrying.',
            { cause: error },
        )
    }
}

export async function updateSiteCheckJobStatus(
    token: string,
    rawInput: SiteCheckJobStatusInput,
    options: ServiceOptions = {},
): Promise<SiteCheckJobStatusResult | null> {
    const input = { ...rawInput, jobId: requireGuid(rawInput.jobId, 'Job identifier') }
    let context = await loadContext(token, input.jobId, options)
    if (!context) return null
    validateContext(context, input)

    if (context.job.gr_status === input.status) {
        const siteCheckCompleted = input.status === JOB_STATUSES.COMPLETE
            ? await reconcileWithReload(token, context, options)
            : completionCommitted(context)
        return {
            completedDate: context.job.gr_completeddate ?? undefined,
            siteCheckCompleted,
            alreadyApplied: true,
        }
    }

    const completedOn = input.status === JOB_STATUSES.COMPLETE
        ? input.completedOn ?? input.pendingSave?.completedDate ?? new Date().toISOString()
        : undefined
    try {
        if (willCompleteSiteCheck(context, input.status)) {
            await executeAtomicChanges(token, completionRequests(context, input, completedOn!), options)
            return { completedDate: completedOn, siteCheckCompleted: true, alreadyApplied: false }
        }
        await patchJob(token, context, input, completedOn, options)
    } catch (error) {
        context = await loadContext(token, input.jobId, options)
        if (!context) {
            throw new Error(
                'The Site Check Job relationship changed while its status was being saved. Refresh before retrying.',
                { cause: error },
            )
        }
        validateContext(context, input)
        if (context && context.job.gr_status === input.status) {
            try {
                const siteCheckCompleted = await reconcileWithReload(token, context, options)
                return {
                    completedDate: context.job.gr_completeddate ?? completedOn,
                    siteCheckCompleted,
                    alreadyApplied: true,
                }
            } catch {
                // Fall through to the safe unknown-outcome error below.
            }
        }
        throw new Error(
            'The Site Check Job update result could not be confirmed. Refresh before retrying.',
            { cause: error },
        )
    }

    context = await loadContext(token, input.jobId, options)
    const siteCheckCompleted = context
        ? await reconcileWithReload(token, context, options)
        : false
    return { completedDate: completedOn, siteCheckCompleted, alreadyApplied: false }
}
