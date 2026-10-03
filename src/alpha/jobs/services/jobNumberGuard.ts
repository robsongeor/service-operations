import {
    assertJobCanReceiveNumber,
    requireJobNumberEtag,
    requireJobNumberRecordId,
    type JobNumberRecord,
} from '../domain/jobNumberPolicy.ts'
import { buildDataverseIdFilterBatches } from '../../shared/dataverse/boundedDataverseFilters.ts'

/** Bounded authoritative preflight; the subsequent changeset must use these same exact ETags. */
export async function verifyUnnumberedJobs(
    token: string,
    apiUrl: string,
    jobs: readonly JobNumberRecord[],
) {
    const ids = jobs.map((job) => requireJobNumberRecordId(job.gr_jobid))
    const latest = new Map<string, JobNumberRecord>()
    for (const filter of buildDataverseIdFilterBatches('gr_jobid', ids)) {
        const query = new URLSearchParams({
            '$select': 'gr_jobid,gr_jobnumber', '$filter': filter, '$top': '40',
        })
        const response = await fetch(`${apiUrl}/gr_jobs?${query}`, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        })
        if (!response.ok) throw new Error('The current Job numbers could not be checked. No numbers were saved.')
        const result = await response.json() as { value?: JobNumberRecord[]; '@odata.nextLink'?: string }
        if (!Array.isArray(result.value) || result['@odata.nextLink']) {
            throw new Error('The selected Jobs could not be fully checked. Reload before allocating numbers.')
        }
        for (const row of result.value) {
            assertNumberProjection(row)
            const id = requireJobNumberRecordId(row.gr_jobid)
            if (latest.has(id) || !ids.includes(id)) throw new Error('The selected Jobs could not be reliably checked.')
            latest.set(id, row)
        }
    }
    for (const job of jobs) {
        const current = latest.get(requireJobNumberRecordId(job.gr_jobid))
        if (!current) throw new Error('A selected Job is no longer available. Reload before allocating numbers.')
        assertJobCanReceiveNumber(current)
        if (requireJobNumberEtag(current) !== requireJobNumberEtag(job)) {
            throw new Error('One or more Jobs changed elsewhere. Reload before allocating numbers.')
        }
    }
}

export async function readJobNumberForDeletion(token: string, apiUrl: string, jobId: string) {
    const id = requireJobNumberRecordId(jobId)
    const response = await fetch(`${apiUrl}/gr_jobs(${id})?$select=gr_jobid,gr_jobnumber`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error('The Job could not be checked. Nothing was deleted.')
    const job = await response.json() as JobNumberRecord
    assertNumberProjection(job)
    if (requireJobNumberRecordId(job.gr_jobid) !== id) throw new Error('The requested Job could not be checked.')
    requireJobNumberEtag(job)
    return job
}

function assertNumberProjection(row: JobNumberRecord) {
    if (!row || (row.gr_jobnumber !== null && typeof row.gr_jobnumber !== 'string')) {
        throw new Error('The current Job number could not be checked. Reload before continuing.')
    }
}
