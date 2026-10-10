const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const normal = (v) => String(v || '').toLowerCase()
function expectedReturns(job, assignments, records) {
    const roster = [
        ...(job._gr_mechanic_value ? [{ assignmentId: '', technicianId: job._gr_mechanic_value, name: job.gr_Mechanic?.gr_name || 'Primary technician' }] : []),
        ...assignments.map((a) => ({ assignmentId: a.gr_jobassignmentid, technicianId: a._gr_mechanic_value, name: a.gr_Mechanic?.gr_name || 'Additional technician' })),
    ]
    return roster.map((person) => {
        const latest = records.filter((r) => normal(r.assignmentId) === normal(person.assignmentId))
            .sort((a, b) => String(b.createdOn).localeCompare(String(a.createdOn)) || String(b.tokenHash).localeCompare(String(a.tokenHash)))[0]
        const matching = Boolean(person.technicianId) && latest && normal(latest.technicianId) === normal(person.technicianId)
        const state = !matching ? 'notSent' : latest.status === 'withdrawn' ? 'withdrawn'
            : ['pendingReview', 'reviewed'].includes(latest.status) ? 'received'
                : latest.status === 'expired' || (latest.status === 'active' && Date.parse(latest.expiresOn) <= Date.now()) ? 'expired' : 'awaiting'
        return { ...person, state }
    })
}
async function readExpectedReturns({ jobId, records, origin, authorization, fetchImpl = fetch }) {
    if (!GUID.test(jobId) || records.length >= 501) throw new Error('Expected technician returns could not be verified.')
    const headers = { Authorization: authorization, Accept: 'application/json', Prefer: 'odata.maxpagesize=500' }
    const response = await fetchImpl(`${origin}/api/data/v9.2/gr_jobs(${jobId})?$select=gr_jobid,gr_status,_gr_mechanic_value&$expand=gr_Mechanic($select=gr_name)`, { headers })
    if (!response.ok) throw new Error('The current primary technician could not be verified.')
    const job = await response.json()
    if (normal(job.gr_jobid) !== normal(jobId)) throw new Error('The expected Job could not be verified.')
    const jobEtag = job['@odata.etag'] || response.headers.get('ETag')
    if (!/^(W\/)?"[^"\r\n]+"$/.test(jobEtag || '')) throw new Error('The Job version could not be verified.')
    const assigned = await fetchImpl(`${origin}/api/data/v9.2/gr_jobassignments?$select=gr_jobassignmentid,_gr_mechanic_value&$expand=gr_Mechanic($select=gr_name)&$filter=${encodeURIComponent(`_gr_job_value eq ${jobId} and statecode eq 0`)}&$top=501`, { headers })
    if (!assigned.ok) throw new Error('Additional technician assignments could not be verified.')
    const data = await assigned.json()
    if (!Array.isArray(data.value) || data.value.length >= 501 || data['@odata.nextLink']) throw new Error('The expected technician roster is incomplete.')
    if (data.value.some((assignment) => !GUID.test(assignment.gr_jobassignmentid || '') || !GUID.test(assignment._gr_mechanic_value || ''))) throw new Error('An assigned technician could not be verified.')
    return { items: expectedReturns(job, data.value, records), jobEtag }
}
module.exports = { expectedReturns, readExpectedReturns }
