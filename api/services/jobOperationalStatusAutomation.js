const JOB_STATUS_ALLOCATED = 122830000
const JOB_STATUS_UNALLOCATED = 122830001
const JOB_STATUS_COMPLETION_REVIEW = 122830004
const MAX_PENDING_RECONCILIATION_JOBS = 100
const { enabled: meterApprovalEnabled, syncApprovedMeter } = require('./jobCardMeterApproval')
const { readExpectedReturns } = require('./jobCardExpectedReturns')
const { getJobCardMeterDataverseApplicationToken } = require('./dataverseApplicationToken')

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

async function transitionAllocatedJob({ jobId, targetStatus, dataverseOrigin, authorization, expectedJobEtag, fetchImpl = fetch }) {
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
        if (expectedJobEtag && etag !== expectedJobEtag) throw new Error('The Job changed after its technician returns were checked.')
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
    const expected = await readExpectedReturns({ ...options, origin: options.dataverseOrigin })
    if (!expected.items.length || !expected.items.every((item) => ['received', 'withdrawn'].includes(item.state))) return false
    return transitionAllocatedJob({ ...options, expectedJobEtag: expected.jobEtag, targetStatus: JOB_STATUS_COMPLETION_REVIEW })
}

async function reconcilePendingCompletionReviews({
    store,
    dataverseOrigin,
    authorization,
    fetchImpl = fetch,
    maxJobs = MAX_PENDING_RECONCILIATION_JOBS,
    acquireMeterToken = getJobCardMeterDataverseApplicationToken,
}) {
    // Cursor discovery is independent of office state, so filing a card cannot discard retries.
    const page = store.listReconciliationPage ? await store.listReconciliationPage(maxJobs) : null
    const pending = page ? page.records : await store.listPending(maxJobs + 1)
    const jobIds = [...new Set(pending.map((record) => String(record.sourceJobId || '').trim().toLowerCase()).filter(Boolean))]
    const boundedJobIds = jobIds.slice(0, maxJobs)
    const result = {
        pendingRecords: pending.length,
        jobsChecked: 0,
        eligible: 0,
        movedToCompletionReview: 0,
        unchanged: 0,
        failed: 0,
        meterApplied: 0,
        meterFailed: 0,
        truncated: page ? Boolean(page.next) : pending.length > maxJobs || jobIds.length > maxJobs,
    }
    for (const jobId of boundedJobIds) {
        result.jobsChecked += 1
        try {
            const records = await store.listByJobId(jobId, 501)
            if (!allRequiredTechnicianSubmissionsReceived(records)) {
                result.unchanged += 1
                continue
            }
            result.eligible += 1
            const updated = await moveJobToCompletionReviewAfterAllRequiredSubmissions({
                jobId,
                records,
                dataverseOrigin,
                authorization,
                fetchImpl,
            })
            if (updated) result.movedToCompletionReview += 1
            else result.unchanged += 1
        } catch {
            result.failed += 1
        }
    }
    // Resolve at most once per batch and only if there is approved work. A failed credential
    // lookup must not fall back to the caller or prevent ordinary status reconciliation.
    let meterAuthorization
    if (meterApprovalEnabled() && pending.some((record) => record.meterApprovalJson && ['pending', 'failed'].includes(record.meterSyncStatus))) {
        try { meterAuthorization = `Bearer ${await acquireMeterToken({ fetchImpl })}` } catch { /* Count each pending failure below. */ }
    }
    if (meterApprovalEnabled()) for (const record of pending) {
        if (!record.meterApprovalJson || !['pending', 'failed'].includes(record.meterSyncStatus)) continue
        try {
            const status = await syncApprovedMeter({ record, origin: dataverseOrigin, authorization: meterAuthorization, fetchImpl })
            await store.replace({ ...record, meterSyncStatus: status, meterSyncError: '', meterSyncedOn: new Date().toISOString() }, record.etag)
            result.meterApplied += 1
        } catch {
            result.meterFailed += 1
            // Preserve the durable approval and revisit it on the next cursor cycle.
        }
    }
    if (page) await store.saveReconciliationCursor(page.next)
    return result
}

async function returnJobToUnallocatedAfterFinalWithdrawal({ jobId, records, dataverseOrigin, authorization, fetchImpl = fetch }) {
    if (hasCurrentTechnicianOwnership(records)) return false
    return transitionAllocatedJob({ jobId, targetStatus: JOB_STATUS_UNALLOCATED, dataverseOrigin, authorization, fetchImpl })
}

module.exports = {
    allRequiredTechnicianSubmissionsReceived,
    moveJobToCompletionReviewAfterAllRequiredSubmissions,
    reconcilePendingCompletionReviews,
    returnJobToUnallocatedAfterFinalWithdrawal,
    _test: {
        allRequiredTechnicianSubmissionsReceived,
        latestTechnicianLifecycles,
        hasCurrentTechnicianOwnership,
        JOB_STATUS_ALLOCATED,
        JOB_STATUS_UNALLOCATED,
        JOB_STATUS_COMPLETION_REVIEW,
        MAX_PENDING_RECONCILIATION_JOBS,
    },
}
