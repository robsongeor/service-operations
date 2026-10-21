const { expectedReturns } = require('./jobCardExpectedReturns')

const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const MAXIMUM_JOB_IDS = 100
const JOB_BATCH_SIZE = 20
const MAXIMUM_RECORDS_PER_BATCH = 500
const WITH_TECHNICIAN = 122830000
const ACTION_REQUIRED = 122830002

const normalize = (value) => String(value || '').trim().toLowerCase()

function trustedCollectionResponse(body) {
    return body && Array.isArray(body.value) && !body['@odata.nextLink']
}

function lifecycleKey(record) {
    return normalize(record.assignmentId) || 'primary'
}

function hasAmbiguousLatestLifecycle(records) {
    const groups = new Map()
    records.forEach((record) => {
        const key = lifecycleKey(record)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(record)
    })
    return [...groups.values()].some((items) => {
        const newest = [...items].sort((left, right) => String(right.createdOn).localeCompare(String(left.createdOn)))[0]
        return items.filter((item) => String(item.createdOn) === String(newest?.createdOn)).length > 1
    })
}

function lastChangedOn(records) {
    return records.map((record) => [record.reviewedOn, record.submittedOn, record.withdrawnOn, record.createdOn].find((value) => Number.isFinite(Date.parse(value))))
        .filter(Boolean).sort().at(-1) || undefined
}

function conflictSummary(jobId, jobStatus) {
    return {
        jobId,
        jobStatus,
        expectedTechnicianCount: 0,
        currentRequiredTechnicianCount: 0,
        returnedCount: 0,
        state: 'conflict',
        officeAttentionRecommended: true,
    }
}

function summarizeJob(jobId, job, assignments, records) {
    if (!job) return { ...conflictSummary(jobId), state: 'unavailable' }
    const jobStatus = Number(job.gr_status)
    if (hasAmbiguousLatestLifecycle(records)
        || assignments.some((assignment) => !GUID.test(assignment.gr_jobassignmentid || '') || !GUID.test(assignment._gr_mechanic_value || ''))) {
        return conflictSummary(jobId, jobStatus)
    }
    const returns = expectedReturns(job, assignments, records)
    if (!returns.length) return conflictSummary(jobId, jobStatus)
    const recordGroups = new Map()
    records.forEach((record) => {
        const key = lifecycleKey(record)
        if (!recordGroups.has(key)) recordGroups.set(key, [])
        recordGroups.get(key).push(record)
    })
    const changedAssignment = returns.some((item) => item.state === 'notSent' && (recordGroups.get(normalize(item.assignmentId) || 'primary') || []).length > 0)
    if (changedAssignment) return conflictSummary(jobId, jobStatus)
    const returnedCount = returns.filter((item) => item.state === 'received').length
    const states = returns.map((item) => item.state)
    let state
    if (returnedCount === returns.length) state = 'ready'
    else if (returnedCount > 0) state = 'partial'
    else if (states.includes('expired')) state = 'expired'
    else if (states.includes('awaiting')) state = 'awaiting'
    else state = 'not-sent'
    return {
        jobId,
        jobStatus,
        expectedTechnicianCount: returns.length,
        currentRequiredTechnicianCount: returns.length,
        returnedCount,
        state,
        officeAttentionRecommended: state === 'expired'
            || states.includes('withdrawn')
            || (state === 'ready' && jobStatus === WITH_TECHNICIAN),
        ...(lastChangedOn(records) ? { lastChangedOn: lastChangedOn(records) } : {}),
        actionRequiredPreserved: jobStatus === ACTION_REQUIRED,
    }
}

function normalizeJobIds(body) {
    if (!body || body.action !== 'coordinationSummary' || !Array.isArray(body.jobIds) || body.jobIds.length < 1 || body.jobIds.length > MAXIMUM_JOB_IDS) return null
    const values = body.jobIds.map((value) => typeof value === 'string' ? value.trim().toLowerCase() : '')
    if (values.some((value) => !GUID.test(value)) || new Set(values).size !== values.length) return null
    if (Object.keys(body).some((key) => !['action', 'jobIds'].includes(key))) return null
    return values
}

async function readDataverseBatch({ origin, authorization, jobIds, fetchImpl }) {
    const headers = { Authorization: authorization, Accept: 'application/json', Prefer: 'odata.maxpagesize=500' }
    const jobFilter = jobIds.map((jobId) => `gr_jobid eq ${jobId}`).join(' or ')
    const assignmentFilter = jobIds.map((jobId) => `_gr_job_value eq ${jobId}`).join(' or ')
    const [jobsResponse, assignmentsResponse] = await Promise.all([
        fetchImpl(`${origin}/api/data/v9.2/gr_jobs?$select=gr_jobid,gr_status,_gr_mechanic_value&$filter=${encodeURIComponent(`(${jobFilter})`)}`, { headers, redirect: 'error' }),
        fetchImpl(`${origin}/api/data/v9.2/gr_jobassignments?$select=gr_jobassignmentid,_gr_job_value,_gr_mechanic_value,gr_jobcardstatus&$filter=${encodeURIComponent(`(${assignmentFilter}) and statecode eq 0`)}&$top=501`, { headers, redirect: 'error' }),
    ])
    if ([jobsResponse, assignmentsResponse].some((response) => response.status === 401 || response.status === 403)) {
        const error = new Error('access')
        error.statusCode = 403
        throw error
    }
    if (!jobsResponse.ok || !assignmentsResponse.ok) throw new Error('dataverse')
    const [jobs, assignments] = await Promise.all([jobsResponse.json(), assignmentsResponse.json()])
    if (!trustedCollectionResponse(jobs) || !trustedCollectionResponse(assignments) || assignments.value.length > 500) throw new Error('incomplete')
    return { jobs: jobs.value, assignments: assignments.value }
}

async function coordinationSummary({ body, origin, authorization, store, fetchImpl = fetch }) {
    const jobIds = normalizeJobIds(body)
    if (!jobIds || !origin || !/^Bearer\s+\S+$/i.test(authorization || '')) {
        const error = new Error('invalid')
        error.statusCode = 400
        throw error
    }
    const summaries = []
    for (let start = 0; start < jobIds.length; start += JOB_BATCH_SIZE) {
        const batchIds = jobIds.slice(start, start + JOB_BATCH_SIZE)
        const [{ jobs, assignments }, records] = await Promise.all([
            readDataverseBatch({ origin, authorization, jobIds: batchIds, fetchImpl }),
            store.listByJobIds(batchIds, MAXIMUM_RECORDS_PER_BATCH + 1),
        ])
        if (!Array.isArray(records) || records.length > MAXIMUM_RECORDS_PER_BATCH) throw new Error('incomplete')
        const jobsById = new Map(jobs.map((job) => [normalize(job.gr_jobid), job]))
        batchIds.forEach((jobId) => summaries.push(summarizeJob(
            jobId,
            jobsById.get(jobId),
            assignments.filter((assignment) => normalize(assignment._gr_job_value) === jobId),
            records.filter((record) => normalize(record.sourceJobId) === jobId),
        )))
    }
    return { items: summaries }
}

module.exports = {
    coordinationSummary,
    normalizeJobIds,
    summarizeJob,
    _test: { MAXIMUM_JOB_IDS, JOB_BATCH_SIZE, MAXIMUM_RECORDS_PER_BATCH, hasAmbiguousLatestLifecycle },
}
