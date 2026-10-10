// Office-approved evidence only. This does not complete a Job or advance maintenance plans.
const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const enabled = () => process.env.JOB_CARD_METER_APPROVAL_ENABLED === 'true'
const nzToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function validReadingDate(value, today = nzToday()) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value && value <= today
}
function failure(message, statusCode = 400) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}
function readApproval(record) {
    try { return JSON.parse(record.meterApprovalJson || 'null') } catch { return null }
}
function approvalReference(approval) {
    // Bind eligibility to the approved value, date and equipment. A later manual edit
    // must not inherit approval merely because it retained the review identifier.
    return [approval.reviewId, approval.hours, approval.recordedDate, approval.equipmentId].join('|')
}
function prepareMeterApproval(record, input, actor, approvedOn) {
    if (!enabled()) {
        if (input != null) throw failure('Hour-meter approval has not been enabled on this backend.')
        return {}
    }
    if (record.hourMeter == null) {
        if (input != null) throw failure('There is no submitted hour-meter reading to approve.')
        return {}
    }
    if (!GUID.test(record.equipmentId || '') || !GUID.test(record.sourceJobId || '') || !GUID.test(record.reviewId || '')) throw failure('Resolve the Job and equipment before approving this reading.')
    if (!input || input.confirmed !== true || Object.keys(input).some((key) => !['confirmed', 'hours', 'recordedDate', 'exceptionReason'].includes(key))) throw failure('Confirm the submitted hour-meter reading and its date.')
    if (!Number.isSafeInteger(input.hours) || input.hours < 0 || input.hours > 2147483647) throw failure('The approved hour-meter reading must be a non-negative whole number.')
    if (!validReadingDate(input.recordedDate)) throw failure('Enter the actual meter-reading date, not a future date.')
    const reason = typeof input.exceptionReason === 'string' ? input.exceptionReason.trim() : ''
    if (reason.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(reason)) throw failure('The meter exception note is invalid.')
    if ((input.hours !== record.hourMeter || (Number.isFinite(record.currentHourMeter) && (input.hours < record.currentHourMeter || input.hours - record.currentHourMeter >= 1000))) && !reason) throw failure('Explain the correction, lower reading or large meter increase before approval.')
    const approval = { reviewId: record.reviewId, jobId: record.sourceJobId, equipmentId: record.equipmentId,
        hours: input.hours, recordedDate: input.recordedDate, approvedOn,
        approvedBy: actor, exceptionReason: reason }
    return { meterApprovalJson: JSON.stringify(approval), meterSyncStatus: 'pending', meterSyncError: '' }
}
function meterProjection(record) {
    return { meterApprovalAvailable: enabled(), hourMeterRecordedDate: record.hourMeterRecordedDate || undefined,
        meterApproval: readApproval(record) || undefined, meterSyncStatus: record.meterSyncStatus || undefined,
        meterSyncError: record.meterSyncError || undefined }
}
async function syncApprovedMeter({ record, origin, authorization, fetchImpl = fetch }) {
    if (!enabled()) throw failure('Hour-meter approval has not been enabled on this backend.', 503)
    const approval = readApproval(record)
    if (!approval || !GUID.test(approval.jobId || '') || !GUID.test(approval.equipmentId || '')
        || approval.reviewId !== record.reviewId || approval.jobId !== record.sourceJobId || approval.equipmentId !== record.equipmentId
        || !Number.isSafeInteger(approval.hours) || approval.hours < 0 || approval.hours > 2147483647
        || !validReadingDate(approval.recordedDate) || !approval.approvedBy?.userId) throw failure('No valid office-approved meter reading is available.')
    if (!origin || !/^Bearer\s+\S+$/i.test(authorization || '')) throw failure('The meter synchronization identity is unavailable.', 503)
    const url = `${origin}/api/data/v9.2/gr_jobs(${approval.jobId})`
    const response = await fetchImpl(`${url}?$select=gr_jobid,gr_status,statecode,gr_registrationvoid,gr_hourmeter,gr_hourmeterreadingtype,gr_hourmeterrecordeddate,gr_hourmeterapprovalreference,_gr_equipment_value&$expand=gr_Equipment($select=gr_currenthourmeter,gr_currenthourmeterrecordeddate)`, { headers: { Authorization: authorization, Accept: 'application/json' } })
    if (!response.ok) throw failure('The current Job could not be checked for meter approval.', 503)
    const job = await response.json()
    if (String(job.gr_jobid).toLowerCase() !== approval.jobId.toLowerCase() || String(job._gr_equipment_value).toLowerCase() !== approval.equipmentId.toLowerCase()) throw failure('Equipment has changed since this card was sent. Operations must reconcile the reading.', 409)
    if (job.statecode !== 0 || job.gr_registrationvoid === true || !Number.isInteger(job.gr_status)) throw failure('This Job is inactive, void or its status is unavailable. Operations must reconcile the reading.', 409)
    const date = job.gr_hourmeterrecordeddate?.slice(0, 10)
    if (job.gr_hourmeterapprovalreference === approvalReference(approval)) {
        if (job.gr_hourmeter === approval.hours && date === approval.recordedDate && job.gr_hourmeterreadingtype === 122830000) return 'applied'
        throw failure('The previously approved Job reading has been edited. Operations must reconcile it before another update.', 409)
    }
    if (job.gr_status === 122830003) throw failure('This Job is already operationally complete. Operations must reconcile its completion evidence.', 409)
    if (date && date > approval.recordedDate) return 'superseded'
    if (date === approval.recordedDate && job.gr_hourmeter != null && job.gr_hourmeter !== approval.hours) throw failure('This Job already has a different reading for the same date. Operations must resolve the conflict.', 409)
    const baseline = job.gr_Equipment?.gr_currenthourmeter
    const baselineDate = job.gr_Equipment?.gr_currenthourmeterrecordeddate?.slice(0, 10)
    if (Number.isFinite(baseline) && (!baselineDate || approval.recordedDate >= baselineDate)
        && (approval.hours < baseline || approval.hours - baseline >= 1000) && !approval.exceptionReason) throw failure('This reading is lower than the current meter or increases it by 1,000+ hours. An office exception note is required.', 409)
    const etag = job['@odata.etag'] || response.headers.get('ETag')
    if (!/^(W\/)?"[^"\r\n]+"$/.test(etag || '')) throw failure('The Job version could not be checked.', 503)
    const update = await fetchImpl(url, { method: 'PATCH', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify({ gr_hourmeter: approval.hours, gr_hourmeterrecordeddate: approval.recordedDate,
            gr_hourmeterreadingtype: 122830000, gr_hourmeterapprovalreference: approvalReference(approval) }) })
    if (update.status === 412) throw failure('The Job changed during meter approval. Refresh and retry.', 409)
    if (!update.ok) throw failure('The approved reading could not be saved to the Job. Check backend permissions and retry.', 503)
    return 'applied'
}
module.exports = { enabled, validReadingDate, prepareMeterApproval, meterProjection, readApproval, syncApprovedMeter, approvalReference }
