import type { Job } from '../types/job.types'
import type { JobAssignment } from '../types/jobAssignment.types'
import { buildTechnicianEmailSubject } from '../utils/technicianMailto.ts'
import { formatFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers.ts'

export type JobEmail = {
    recipientEmail: string
    recipientName: string
    subject: string
    body: string
}

export type JobEmailDraft = {
    recipientEmail: string
    subject: string
    technicianComments?: string
}

export type JobEmailDeliveryState = {
    status: 'sending' | 'sent' | 'failed'
    message: string
}

export const TECHNICIAN_COMMENTS_MAX_LENGTH = 2000
export const ONLINE_JOB_CARD_ENABLED = false

const html = (value?: string | null) => (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const compact = (value?: string | null) => (value ?? '').replace(/\s+/g, ' ').trim()

function detailRow(label: string, value?: string | null) {
    const display = compact(value)
    if (!display) return ''
    return `<tr><td style="padding:5px 14px 5px 0;color:#66736d;font-size:12px;font-weight:700;vertical-align:top;white-space:nowrap">${html(label)}</td><td style="padding:5px 0;color:#17251f;font-size:14px;vertical-align:top">${html(display)}</td></tr>`
}

export function buildTechnicianJobCardHtml(
    job: Job,
    technicianName: string,
    _submissionUrl: string,
    technicianComments?: string,
) {
    if ((technicianComments?.length ?? 0) > TECHNICIAN_COMMENTS_MAX_LENGTH) {
        throw new Error(`Technician comments must be ${TECHNICIAN_COMMENTS_MAX_LENGTH} characters or fewer.`)
    }

    const equipment = job.gr_Equipment
    const site = job.gr_Site
    const contact = job.gr_Contact
    const firstName = compact(technicianName).split(' ')[0] || 'there'
    const equipmentName = compact([equipment?.gr_make, equipment?.gr_model].filter(Boolean).join(' '))
    const description = html(job.gr_description?.trim() || 'No work description supplied.').replace(/\r?\n/g, '<br>')
    const jobNumber = compact(job.gr_jobnumber) || 'Not supplied'
    const comments = technicianComments?.trim()
        ? `<div style="margin:0 0 20px;padding:16px 18px;background:#fff8e8;border-left:4px solid #c78319;border-radius:6px"><div style="margin-bottom:6px;color:#805719;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Comments for technician</div><div style="font-size:14px;line-height:1.55;white-space:pre-wrap">${html(technicianComments.trim()).replace(/\r?\n/g, '<br>')}</div></div>`
        : ''
    const details = [
        detailRow('Equipment', equipmentName),
        detailRow('Fleet number', formatFleetNumbers(equipment?.gr_fleet, equipment?.gr_alternatefleetnumbers)),
        detailRow('Serial number', equipment?.gr_serial),
        detailRow('Customer', site?.gr_Customer?.gr_name),
        detailRow('Site', site?.gr_name),
        detailRow('Address', site?.gr_address),
        detailRow('Site contact', contact?.gr_name || 'No site contact assigned'),
        detailRow('Contact phone', contact?.gr_phone),
        detailRow('Contact email', contact?.gr_email),
        detailRow('Order number', job.gr_ordernumber),
    ].join('')

    return `<!doctype html><html><body style="margin:0;padding:0;background:#f2f6f4;font-family:Arial,sans-serif;color:#17251f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f4"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #d9e3de;border-radius:12px;overflow:hidden"><tr><td style="padding:22px 26px;background:#0f665d;color:#ffffff"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.8">Service Operations</div><div style="margin-top:5px;font-size:25px;font-weight:800">Job ${html(jobNumber)}</div></td></tr><tr><td style="padding:24px 26px"><p style="margin:0 0 18px;font-size:15px;line-height:1.55">Hi ${html(firstName)},<br>Please see the assigned Job details below.</p><div style="margin:0 0 20px;padding:16px 18px;background:#f5f8f7;border-left:4px solid #168478;border-radius:6px"><div style="margin-bottom:6px;color:#66736d;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Work required</div><div style="font-size:16px;font-weight:700;line-height:1.5">${description}</div></div>${comments}<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${details}</table><div aria-disabled="true" style="display:inline-block;margin:25px 0 10px;padding:13px 22px;border-radius:7px;background:#dce3e0;color:#6a7771;font-size:15px;font-weight:700">Open Job Card — temporarily disabled</div><p style="margin:0;color:#66736d;font-size:12px;line-height:1.5">Online Job Card access is temporarily unavailable.</p></td></tr></table></td></tr></table></body></html>`
}

export function buildPrimaryJobEmail(job: Job, submissionUrl: string, draft?: JobEmailDraft): JobEmail {
    if (!job.gr_Mechanic?.gr_email) {
        throw new Error('The primary technician needs an email address before the job can be sent.')
    }

    return {
        recipientEmail: draft?.recipientEmail.trim() || job.gr_Mechanic.gr_email,
        recipientName: job.gr_Mechanic.gr_name,
        subject: draft?.subject.trim() || buildTechnicianEmailSubject(job),
        body: buildTechnicianJobCardHtml(
            job,
            job.gr_Mechanic.gr_name,
            submissionUrl,
            draft?.technicianComments,
        ),
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
        body: buildTechnicianJobCardHtml(job, mechanic.gr_name, submissionUrl),
    }
}
