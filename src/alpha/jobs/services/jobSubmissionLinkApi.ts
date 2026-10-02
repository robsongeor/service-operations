import type { Job } from '../types/job.types'
import type { JobAssignment } from '../types/jobAssignment.types'

type SubmissionLinkResponse = { path: string; expiresOn: string }

export class ActiveSubmissionLinkError extends Error {}

export function jobHasActiveSubmissionLink(job: Job, now = Date.now()) {
    const expiresOn = Date.parse(job.gr_techniciansubmissiontokenexpireson ?? '')
    return Boolean(job.gr_techniciansubmissiontokenhash && job.gr_techniciansubmissiontokenused === false && Number.isFinite(expiresOn) && expiresOn > now)
}

function localSnapshot(job: Job, assignment?: JobAssignment) {
    const technician = assignment?.gr_Mechanic ?? job.gr_Mechanic
    return {
        jobNumber: job.gr_jobnumber,
        jobType: job.gr_jobtype,
        workRequired: assignment?.gr_workinstructions || job.gr_description,
        equipmentId: job.gr_Equipment?.gr_equipmentid,
        equipmentDisplayName: [job.gr_Equipment?.gr_make, job.gr_Equipment?.gr_model].filter(Boolean).join(' '),
        fleetNumber: job.gr_Equipment?.gr_fleet,
        currentHourMeter: job.gr_Equipment?.gr_currenthourmeter,
        customerName: job.gr_Site?.gr_Customer?.gr_name,
        siteName: job.gr_Site?.gr_name,
        technicianId: technician?.gr_mechanicid,
        technicianName: technician?.gr_name,
        technicianEmail: technician?.gr_email,
    }
}

export async function generateJobSubmissionLink(accessToken: string, job: Job, assignment?: JobAssignment, replaceActive = false) {
    const response = await fetch('/api/jobsubmission', {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generate',
            jobId: job.gr_jobid,
            assignmentId: assignment?.gr_jobassignmentid,
            replaceActive,
            snapshot: import.meta.env.DEV ? localSnapshot(job, assignment) : undefined,
        }),
    })
    if (response.status === 409) throw new ActiveSubmissionLinkError('An active technician link already exists.')
    if (!response.ok) throw new Error('The secure Job Card link could not be created. Please try again.')
    const body = await response.json() as SubmissionLinkResponse
    if (!body.path?.startsWith('/portal/job/')) throw new Error('The secure Job Card link could not be created. Please try again.')
    return { url: new URL(body.path, window.location.origin).toString(), expiresOn: body.expiresOn }
}
