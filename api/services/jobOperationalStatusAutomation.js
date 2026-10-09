const JOB_STATUS_ALLOCATED = 122830000
const JOB_STATUS_UNALLOCATED = 122830001
const JOB_STATUS_COMPLETION_REVIEW = 122830004

function lifecycleKey(record) {
    const assignmentId = String(record.assignmentId || '').trim().toLowerCase()
    return assignmentId || 'primary'
}

function isNewerLifecycleRecord(candidate, current) {
    const candidateCreated = Date.parse(candidate.createdOn)
    const currentCreated = Date.parse(current.createdOn)
    if (Number.isFinite(candidateCreated) && Number.isFinite(currentCreated) && candidateCreated !== currentCreated) {
        return candidateCreated > currentCreated
    }
    return String(candidate.tokenHash || '').localeCompare(String(current.tokenHash || '')) > 0
}

function latestTechnicianLifecycles(records) {
    const latest = new Map()
    records.forEach((record) => {
        const key = lifecycleKey(record)
        const current = latest.get(key)
        if (!current || isNewerLifecycleRecord(record, current)) latest.set(key, record)
    })
    return [...latest.values()]
}

function allRequiredTechnicianSubmissionsReceived(records) {
    // A truncated history cannot prove that every technician lifecycle has been accounted for.
    if (!records.length || records.length >= 501) return false
    const required = latestTechnicianLifecycles(records)
        .filter((record) => !['withdrawn', 'superseded'].includes(record.status))
    return required.length > 0 && required.every((record) => ['pendingReview', 'reviewed'].includes(record.status))
}

function hasCurrentTechnicianOwnership(records, now = Date.now()) {
    return records.some((record) => ['pendingReview', 'reviewed'].includes(record.status)
        || (record.status === 'active' && Date.parse(record.expiresOn) > now))
}

async function transitionAllocatedJob({ jobId, targetStatus, dataverseOrigin, authorization, fetchImpl = fetch }) {
    if (!dataverseOrigin || !/^Bearer\s+\S+$/i.test(authorization || '')) return false
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const currentResponse = await fetchImpl(
            `${dataverseOrigin}/api/data/v9.2/gr_jobs(${jobId})?$select=gr_jobid,gr_status`,
            { headers: { Authorization: authorization, Accept: 'application/json' } },
        )
        if (!currentResponse.ok) throw new Error('The Job status could not be verified.')
        const current = await currentResponse.json()
        if (String(current.gr_jobid || '').toLowerCase() !== jobId.toLowerCase()) throw new Error('The Job could not be verified.')
        if (current.gr_status !== JOB_STATUS_ALLOCATED) return false
        const etag = current['@odata.etag'] || currentResponse.headers.get('ETag') || ''
        if (!/^(W\/)?"[^"\r\n]+"$/.test(etag)) throw new Error('The Job version could not be verified.')
        const updateResponse = await fetchImpl(`${dataverseOrigin}/api/data/v9.2/gr_jobs(${jobId})`, {
            method: 'PATCH',
            headers: {
                Authorization: authorization,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'If-Match': etag,
            },
            body: JSON.stringify({ gr_status: targetStatus }),
        })
        if (updateResponse.status === 412) continue
        if (!updateResponse.ok) throw new Error('The Job status could not be updated automatically.')
        return true
    }
    throw new Error('The Job changed while its status was being updated.')
}

async function moveJobToCompletionReviewAfterAllRequiredSubmissions(options) {
    if (!allRequiredTechnicianSubmissionsReceived(options.records)) return false
    return transitionAllocatedJob({ ...options, targetStatus: JOB_STATUS_COMPLETION_REVIEW })
}

async function returnJobToUnallocatedAfterFinalWithdrawal({ jobId, records, dataverseOrigin, authorization, fetchImpl = fetch }) {
    if (hasCurrentTechnicianOwnership(records)) return false
    return transitionAllocatedJob({ jobId, targetStatus: JOB_STATUS_UNALLOCATED, dataverseOrigin, authorization, fetchImpl })
}

module.exports = {
    allRequiredTechnicianSubmissionsReceived,
    moveJobToCompletionReviewAfterAllRequiredSubmissions,
    returnJobToUnallocatedAfterFinalWithdrawal,
    _test: {
        allRequiredTechnicianSubmissionsReceived,
        latestTechnicianLifecycles,
        hasCurrentTechnicianOwnership,
        JOB_STATUS_ALLOCATED,
        JOB_STATUS_UNALLOCATED,
        JOB_STATUS_COMPLETION_REVIEW,
    },
}
