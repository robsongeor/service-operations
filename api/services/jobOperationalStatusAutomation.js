const JOB_STATUS_ALLOCATED = 122830000
const JOB_STATUS_UNALLOCATED = 122830001

function hasCurrentTechnicianOwnership(records, now = Date.now()) {
    return records.some((record) => ['pendingReview', 'reviewed'].includes(record.status)
        || (record.status === 'active' && Date.parse(record.expiresOn) > now))
}

async function returnJobToUnallocatedAfterFinalWithdrawal({ jobId, records, dataverseOrigin, authorization, fetchImpl = fetch }) {
    if (!dataverseOrigin || !/^Bearer\s+\S+$/i.test(authorization || '') || hasCurrentTechnicianOwnership(records)) return false
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const currentResponse = await fetchImpl(
            `${dataverseOrigin}/api/data/v9.2/gr_jobs(${jobId})?$select=gr_jobid,gr_status`,
            { headers: { Authorization: authorization, Accept: 'application/json' } },
        )
        if (!currentResponse.ok) throw new Error('The withdrawn Job status could not be verified.')
        const current = await currentResponse.json()
        if (String(current.gr_jobid || '').toLowerCase() !== jobId.toLowerCase()) throw new Error('The withdrawn Job could not be verified.')
        if (current.gr_status !== JOB_STATUS_ALLOCATED) return false
        const etag = current['@odata.etag'] || currentResponse.headers.get('ETag') || ''
        if (!/^(W\/)?"[^"\r\n]+"$/.test(etag)) throw new Error('The withdrawn Job version could not be verified.')
        const updateResponse = await fetchImpl(`${dataverseOrigin}/api/data/v9.2/gr_jobs(${jobId})`, {
            method: 'PATCH',
            headers: {
                Authorization: authorization,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'If-Match': etag,
            },
            body: JSON.stringify({ gr_status: JOB_STATUS_UNALLOCATED }),
        })
        if (updateResponse.status === 412) continue
        if (!updateResponse.ok) throw new Error('The withdrawn Job could not be returned to Unallocated.')
        return true
    }
    throw new Error('The withdrawn Job changed while its status was being updated.')
}

module.exports = {
    returnJobToUnallocatedAfterFinalWithdrawal,
    _test: { hasCurrentTechnicianOwnership, JOB_STATUS_ALLOCATED, JOB_STATUS_UNALLOCATED },
}
