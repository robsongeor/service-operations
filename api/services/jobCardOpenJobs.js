// Office-only projection. Successful dispatch is authoritative; generating a link is not a send.
const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const normalize = (value) => String(value || '').trim().toLowerCase()
const allocatedNumber = (value) => /^(?:WJ|HJ|CJ)?\d+$/i.test(String(value || '').trim()) && /[1-9]/.test(value)
const dispatchKey = (row) => [normalize(row._gr_job_value), normalize(row._gr_jobassignment_value), normalize(row.gr_recipientemail)].join(':')

async function readDispatches(origin, authorization, limit) {
    const url = new URL('/api/data/v9.2/gr_emaildispatchs', origin)
    url.searchParams.set('$select', 'gr_emaildispatchid,_gr_job_value,_gr_jobassignment_value,gr_recipientname,gr_recipientemail,gr_emailsent,gr_requestedon,gr_completedon')
    url.searchParams.set('$filter', 'gr_emailsent eq true and _gr_job_value ne null')
    url.searchParams.set('$orderby', 'gr_requestedon desc,gr_emaildispatchid desc')
    url.searchParams.set('$top', String(limit))
    url.searchParams.set('$expand', 'gr_Job($select=gr_jobid,gr_jobnumber,gr_jobtype,gr_description,gr_techniciansubmissionsubmittedon,gr_jobcardsubmittedon;$expand=gr_Equipment($select=gr_fleet,gr_make,gr_model,gr_serial),gr_Site($select=gr_name;$expand=gr_Customer($select=gr_name))),gr_JobAssignment($select=gr_jobassignmentid,_gr_job_value,gr_submittedon)')
    const rows = []
    const visited = new Set()
    let next = url.href
    while (next && rows.length < limit) {
        const page = new URL(next, url)
        if (page.origin !== url.origin || page.pathname !== url.pathname || page.username || page.password || visited.has(page.href) || visited.size >= 20) throw new Error('Dispatch pagination could not be verified.')
        visited.add(page.href)
        const response = await fetch(page, { headers: { Authorization: authorization, Accept: 'application/json' }, redirect: 'error' })
        if (!response.ok) throw new Error('Successful Job dispatches could not be read. Check reviewer access to Email Dispatch and Jobs.')
        const body = await response.json()
        if (!Array.isArray(body.value)) throw new Error('The dispatch response was incomplete.')
        rows.push(...body.value.slice(0, limit - rows.length))
        next = body['@odata.nextLink']
    }
    return rows
}

function wasSubmitted(dispatch, record) {
    if (!['pendingReview', 'reviewed'].includes(record.status)) return false
    if (normalize(record.sourceJobId) !== normalize(dispatch._gr_job_value)
        || normalize(record.assignmentId) !== normalize(dispatch._gr_jobassignment_value)) return false
    // Missing recipient on old snapshots is treated conservatively; do not claim it is still open.
    if (record.technicianEmail && normalize(record.technicianEmail) !== normalize(dispatch.gr_recipientemail)) return false
    return Date.parse(record.submittedOn) >= Date.parse(dispatch.gr_requestedon)
}

function cycleForDispatch(dispatch, records) {
    const completedOn = Date.parse(dispatch.gr_completedon)
    return records.filter((record) => normalize(record.sourceJobId) === normalize(dispatch._gr_job_value)
        && normalize(record.assignmentId) === normalize(dispatch._gr_jobassignment_value)
        && (!record.technicianEmail || normalize(record.technicianEmail) === normalize(dispatch.gr_recipientemail))
        && Number.isFinite(Date.parse(record.createdOn)) && Date.parse(record.createdOn) <= completedOn)
        .sort((left, right) => String(right.createdOn).localeCompare(String(left.createdOn)))[0]
}

function cycleIsOpen(record) {
    // Expiry is not a return: keep the office's outstanding paperwork visible.
    return !record || ['active', 'expired'].includes(record.status)
}

function hasLegacySubmission(dispatch) {
    // Read only recorded timestamps, never old status labels, and never change the archive.
    if (dispatch._gr_jobassignment_value) {
        const assignment = dispatch.gr_JobAssignment
        return normalize(assignment?.gr_jobassignmentid) === normalize(dispatch._gr_jobassignment_value)
            && normalize(assignment?._gr_job_value) === normalize(dispatch._gr_job_value)
            && Date.parse(assignment?.gr_submittedon) >= Date.parse(dispatch.gr_requestedon)
    }
    return [dispatch.gr_Job?.gr_techniciansubmissionsubmittedon, dispatch.gr_Job?.gr_jobcardsubmittedon]
        .some((date) => Date.parse(date) >= Date.parse(dispatch.gr_requestedon))
}

async function listOpenJobs({ origin, authorization, store, offset, limit }) {
    const dispatches = await readDispatches(origin, authorization, offset + limit + 1)
    const seen = new Set()
    const candidates = []
    for (const [index, dispatch] of dispatches.slice(0, offset + limit).entries()) {
        const key = dispatchKey(dispatch)
        if (seen.has(key)) continue
        seen.add(key)
        if (index < offset || dispatch.gr_emailsent !== true || !GUID.test(dispatch._gr_job_value || '')
            || !GUID.test(dispatch.gr_emaildispatchid || '') || !normalize(dispatch.gr_recipientemail)
            || !Number.isFinite(Date.parse(dispatch.gr_requestedon)) || !Number.isFinite(Date.parse(dispatch.gr_completedon))
            || normalize(dispatch.gr_Job?.gr_jobid) !== normalize(dispatch._gr_job_value)
            || !allocatedNumber(dispatch.gr_Job?.gr_jobnumber) || dispatch.gr_Job?.gr_jobtype === 122830004
            || hasLegacySubmission(dispatch)) continue
        candidates.push(dispatch)
    }
    const jobIds = [...new Set(candidates.map((row) => normalize(row._gr_job_value)))]
    const evidence = []
    // Batched relationship checks, never one request per row and never an unbounded evidence load.
    for (let start = 0; start < jobIds.length; start += 20) {
        const records = await store.listByJobIds(jobIds.slice(start, start + 20), 501)
        if (records.length > 500) throw new Error('Job Card history exceeds the safe Open jobs scan. No incomplete result was returned.')
        evidence.push(...records)
    }
    const items = candidates.filter((row) => {
        const cycle = cycleForDispatch(row, evidence)
        return cycleIsOpen(cycle) && !evidence.some((record) => wasSubmitted(row, record))
    }).map((row) => {
        const job = row.gr_Job
        const equipment = job.gr_Equipment
        const cycle = cycleForDispatch(row, evidence)
        return {
            dispatchId: row.gr_emaildispatchid, sourceJobId: row._gr_job_value,
            jobNumber: job.gr_jobnumber.trim(), sentOn: row.gr_completedon,
            linkExpired: Boolean(cycle && (cycle.status === 'expired' || Date.parse(cycle.expiresOn) <= Date.now())),
            technicianName: row.gr_recipientname || 'Technician', jobType: job.gr_jobtype,
            customerName: job.gr_Site?.gr_Customer?.gr_name, siteName: job.gr_Site?.gr_name,
            workRequired: job.gr_description, fleetNumber: equipment?.gr_fleet, equipmentSerial: equipment?.gr_serial,
            equipmentDisplayName: [equipment?.gr_make, equipment?.gr_model].filter(Boolean).join(' '),
            safetyIssueIdentified: false, furtherWorkRequired: false, photoCount: 0, officeActivities: [], isTerminal: false,
        }
    })
    const truncated = dispatches.length > offset + limit
    const hasMore = truncated && offset + limit < 500
    return { items, view: 'open', hasMore, nextOffset: hasMore ? offset + limit : undefined, truncated, scanLimitReached: truncated && !hasMore }
}

module.exports = { listOpenJobs, wasSubmitted, cycleForDispatch, cycleIsOpen }
