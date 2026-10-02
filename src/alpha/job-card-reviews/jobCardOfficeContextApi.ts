export type JobCardContact = { name?: string; phone?: string; email?: string }
const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? 'https://dataverse.invalid'

/** Current office-only context; never part of the anonymous portal or saved evidence. */
export async function fetchJobCardContact(accessToken: string, jobId: string): Promise<JobCardContact | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) throw new Error('A valid Job is required.')
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs(${jobId})?$select=gr_jobid&$expand=gr_Contact($select=gr_name,gr_phone,gr_email)`, { cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } })
    if (!response.ok) throw new Error('The current Job contact could not be loaded.')
    const job = await response.json() as { gr_Contact?: { gr_name?: string; gr_phone?: string; gr_email?: string } }
    return job.gr_Contact ? { name: job.gr_Contact.gr_name, phone: job.gr_Contact.gr_phone, email: job.gr_Contact.gr_email } : null
}
