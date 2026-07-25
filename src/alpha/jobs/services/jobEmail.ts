import type { Job } from '../types/job.types'
import type { JobAssignment } from '../types/jobAssignment.types'
import { buildTechnicianEmailBody, buildTechnicianEmailSubject } from '../utils/technicianMailto'

export type JobEmail = {
    recipientEmail: string
    recipientName: string
    subject: string
    body: string
}

export function buildPrimaryJobEmail(job: Job, submissionUrl: string): JobEmail {
    if (!job.gr_Mechanic?.gr_email) {
        throw new Error('The primary technician needs an email address before the job can be sent.')
    }

    return {
        recipientEmail: job.gr_Mechanic.gr_email,
        recipientName: job.gr_Mechanic.gr_name,
        subject: buildTechnicianEmailSubject(job),
        body: buildTechnicianEmailBody(job, job.gr_Mechanic.gr_name, submissionUrl),
    }
}

export function buildAssignmentJobEmail(job: Job, assignment: JobAssignment, submissionUrl: string): JobEmail {
    const mechanic = assignment.gr_Mechanic
    if (!mechanic?.gr_email) {
        throw new Error('This technician needs an email address before the job can be sent.')
    }

    return {
        recipientEmail: mechanic.gr_email,
        recipientName: mechanic.gr_name,
        subject: buildTechnicianEmailSubject(job),
        body: buildTechnicianEmailBody(job, mechanic.gr_name, submissionUrl),
    }
}
