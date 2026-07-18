import type { Job } from '../types/job.types'

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
