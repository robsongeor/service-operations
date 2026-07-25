import type { Job } from '../types/job.types'

const collapseWhitespace = (value?: string | null) =>
    (value ?? '').replace(/\s+/g, ' ').trim()

const truncate = (value: string, maximumLength: number) =>
    value.length > maximumLength
        ? `${value.slice(0, maximumLength - 3).trimEnd()}...`
        : value

const section = (heading: string, lines: string[]) =>
    lines.length > 0 ? `${heading}\n-----------\n${lines.join('\n')}` : ''

export function isValidTechnicianEmail(value?: string | null) {
    const email = collapseWhitespace(value)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function buildTechnicianEmailSubject(job: Job) {
    const jobNumber = collapseWhitespace(job.gr_jobnumber)
    const customer = collapseWhitespace(job.gr_Site?.gr_Customer?.gr_name)
    const description = truncate(collapseWhitespace(job.gr_description), 70)
    const subjectParts = [jobNumber ? `Job ${jobNumber}` : 'Service Job', customer, description]
        .filter(Boolean)

    return truncate(subjectParts.join(' - '), 150)
}

export function buildTechnicianEmailBody(
    job: Job,
    technicianName: string,
    submissionUrl: string,
) {
    const equipment = job.gr_Equipment
    const equipmentDetails = [
        collapseWhitespace([equipment?.gr_make, equipment?.gr_model].filter(Boolean).join(' ')),
        equipment?.gr_fleet ? `Fleet: ${collapseWhitespace(equipment.gr_fleet)}` : '',
        equipment?.gr_serial ? `Serial: ${collapseWhitespace(equipment.gr_serial)}` : '',
    ].filter(Boolean)
    const contactDetails = [
        job.gr_Contact?.gr_name ? `Name: ${collapseWhitespace(job.gr_Contact.gr_name)}` : '',
        job.gr_Contact?.gr_phone ? `Phone: ${collapseWhitespace(job.gr_Contact.gr_phone)}` : '',
        job.gr_Contact?.gr_email ? `Email: ${collapseWhitespace(job.gr_Contact.gr_email)}` : '',
    ].filter(Boolean)
    const customerSiteDetails = [
        job.gr_Site?.gr_Customer?.gr_name
            ? `Customer: ${collapseWhitespace(job.gr_Site.gr_Customer.gr_name)}`
            : '',
        job.gr_Site?.gr_name ? `Site: ${collapseWhitespace(job.gr_Site.gr_name)}` : '',
        job.gr_Site?.gr_address ? `Address: ${collapseWhitespace(job.gr_Site.gr_address)}` : '',
    ].filter(Boolean)
    const firstName = collapseWhitespace(technicianName).split(' ')[0] || 'there'
    const sections = [
        `Hi ${firstName},\n\nPlease see the job details below.`,
        section('JOB NUMBER', [collapseWhitespace(job.gr_jobnumber) || 'Not supplied']),
        section('EQUIPMENT', equipmentDetails),
        job.gr_description
            ? section('WORK REQUIRED', [truncate(collapseWhitespace(job.gr_description), 600)])
            : '',
        section('CUSTOMER / SITE', customerSiteDetails),
        section('SITE CONTACT', contactDetails),
        section('ORDER NUMBER', [collapseWhitespace(job.gr_ordernumber) || 'Not supplied']),
        section('COMPLETE JOB CARD', [
            'Use the secure link below to enter the current hour meter and Job story:',
            '',
            `Open Job Card: ${submissionUrl}`,
            '',
            'This link is unique to this Job and may only be submitted once.',
        ]),
        'Thanks',
    ].filter(Boolean)

    return sections.join('\n\n')
}

export function buildMailtoUrl({
    recipient,
    subject,
    body,
}: {
    recipient: string
    subject: string
    body: string
}) {
    if (!isValidTechnicianEmail(recipient)) {
        throw new Error('A valid technician email address is required.')
    }

    return `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
