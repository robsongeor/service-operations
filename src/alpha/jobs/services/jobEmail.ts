import type { Job } from '../types/job.types'
import type { JobAssignment } from '../types/jobAssignment.types'

export function emailJobToMechanic(job: Job) {
    if (!job.gr_Mechanic?.gr_email) {
        alert('Mechanic has no email')
        return
    }

    const subject = `Job ${job.gr_jobnumber ?? 'Unnumbered'}`

    const body = `
Job: ${job.gr_jobnumber ?? 'Unnumbered'}

Description:
${job.gr_description ?? 'No description'}

Equipment:
${job.gr_Equipment
            ? `${job.gr_Equipment.gr_fleet} - ${job.gr_Equipment.gr_make} ${job.gr_Equipment.gr_model}`
            : 'N/A'}

Site:
${job.gr_Site?.gr_name ?? 'N/A'}
`

    const mailto = `mailto:${job.gr_Mechanic.gr_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    window.location.href = mailto
}

export function emailJobAssignment(job: Job, assignment: JobAssignment) {
    const mechanic = assignment.gr_Mechanic
    if (!mechanic?.gr_email) {
        alert('This technician has no email address')
        return
    }

    const subject = `Job ${job.gr_jobnumber ?? 'Unnumbered'}`
    const instructions = assignment.gr_workinstructions?.trim()
        ? `\n\nWork instructions:\n${assignment.gr_workinstructions.trim()}`
        : ''
    const body = `Hi ${mechanic.gr_name},

You have been assigned job ${job.gr_jobnumber ?? 'Unnumbered'}.

Description:
${job.gr_description ?? 'No description'}${instructions}

Equipment:
${job.gr_Equipment
        ? `${job.gr_Equipment.gr_fleet} - ${job.gr_Equipment.gr_make} ${job.gr_Equipment.gr_model}`
        : 'N/A'}

Site:
${job.gr_Site?.gr_name ?? 'N/A'}
`

    window.location.href = `mailto:${mechanic.gr_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
