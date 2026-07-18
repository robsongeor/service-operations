import type { Job } from '../types/job.types'
import type { JobAssignment } from '../types/jobAssignment.types'

export type JobEmail = {
    recipientEmail: string
    recipientName: string
    subject: string
    body: string
}

function jobDetails(job: Job) {
    return `Job: ${job.gr_jobnumber ?? 'Unnumbered'}

Description:
${job.gr_description ?? 'No description'}

Equipment:
${job.gr_Equipment
        ? `${job.gr_Equipment.gr_fleet} - ${job.gr_Equipment.gr_make} ${job.gr_Equipment.gr_model}`
        : 'N/A'}

Site:
${job.gr_Site?.gr_name ?? 'N/A'}`
}

export function buildPrimaryJobEmail(job: Job): JobEmail {
    if (!job.gr_Mechanic?.gr_email) {
        throw new Error('The primary technician needs an email address before the job can be sent.')
    }

    return {
        recipientEmail: job.gr_Mechanic.gr_email,
        recipientName: job.gr_Mechanic.gr_name,
        subject: `Job ${job.gr_jobnumber ?? 'Unnumbered'}`,
        body: `Hi ${job.gr_Mechanic.gr_name},

You have been assigned the following job.

${jobDetails(job)}`,
    }
}

export function buildAssignmentJobEmail(job: Job, assignment: JobAssignment): JobEmail {
    const mechanic = assignment.gr_Mechanic
    if (!mechanic?.gr_email) {
        throw new Error('This technician needs an email address before the job can be sent.')
    }

    return {
        recipientEmail: mechanic.gr_email,
        recipientName: mechanic.gr_name,
        subject: `Job ${job.gr_jobnumber ?? 'Unnumbered'}`,
        body: `Hi ${mechanic.gr_name},

You have been added to the following job.

${jobDetails(job)}`,
    }
}
