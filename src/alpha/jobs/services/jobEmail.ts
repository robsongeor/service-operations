import type { Job } from '../types/job.types'
import type { JobAssignment } from '../types/jobAssignment.types'
import { buildTechnicianEmailSubject } from '../utils/technicianMailto.ts'

export type JobEmail = {
    recipientEmail: string
    recipientName: string
    subject: string
    body: string
}

export type JobEmailDraft = {
    recipientEmail: string
    subject: string
}

export type JobEmailDeliveryState = {
    status: 'sending' | 'sent' | 'failed'
    message: string
}

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

export function buildTechnicianJobCardHtml(job: Job, technicianName: string, submissionUrl: string) {
    const equipment = job.gr_Equipment
    const site = job.gr_Site
    const contact = job.gr_Contact
    const firstName = compact(technicianName).split(' ')[0] || 'there'
    const equipmentName = compact([equipment?.gr_make, equipment?.gr_model].filter(Boolean).join(' '))
    const description = html(job.gr_description?.trim() || 'No work description supplied.').replace(/\r?\n/g, '<br>')
    const safeUrl = html(submissionUrl)
    const jobNumber = compact(job.gr_jobnumber) || 'Not supplied'

    return `<!doctype html><html><body style="margin:0;padding:0;background:#f2f6f4;font-family:Arial,sans-serif;color:#17251f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f4"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #d9e3de;border-radius:12px;overflow:hidden"><tr><td style="padding:22px 26px;background:#0f665d;color:#ffffff"><div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.8">Service Operations</div><div style="margin-top:5px;font-size:25px;font-weight:800">Job ${html(jobNumber)}</div></td></tr><tr><td style="padding:24px 26px"><p style="margin:0 0 18px;font-size:15px;line-height:1.55">Hi ${html(firstName)},<br>Please see the assigned Job details below.</p><div style="margin:0 0 20px;padding:16px 18px;background:#f5f8f7;border-left:4px solid #168478;border-radius:6px"><div style="margin-bottom:6px;color:#66736d;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Work required</div><div style="font-size:16px;font-weight:700;line-height:1.5">${description}</div></div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${detailRow('Equipment', equipmentName)}${detailRow('Fleet number', equipment?.gr_fleet)}${detailRow('Serial number', equipment?.gr_serial)}${detailRow('Customer', site?.gr_Customer?.gr_name)}${detailRow('Site', site?.gr_name)}${detailRow('Address', site?.gr_address)}${detailRow('Site contact', contact?.gr_name)}${detailRow('Contact phone', contact?.gr_phone)}${detailRow('Order number', job.gr_ordernumber)}</table><table role="presentation" cellspacing="0" cellpadding="0" style="margin:25px 0 16px"><tr><td style="border-radius:7px;background:#11766b"><a href="${safeUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">Open Job Card</a></td></tr></table><p style="margin:0;color:#66736d;font-size:12px;line-height:1.5">This secure link is unique to Job ${html(jobNumber)} and may only be submitted once.</p></td></tr></table></td></tr></table></body></html>`
}

export function buildPrimaryJobEmail(job: Job, submissionUrl: string, draft?: JobEmailDraft): JobEmail {
    if (!job.gr_Mechanic?.gr_email) {
        throw new Error('The primary technician needs an email address before the job can be sent.')
    }

    return {
        recipientEmail: draft?.recipientEmail.trim() || job.gr_Mechanic.gr_email,
        recipientName: job.gr_Mechanic.gr_name,
        subject: draft?.subject.trim() || buildTechnicianEmailSubject(job),
        body: buildTechnicianJobCardHtml(job, job.gr_Mechanic.gr_name, submissionUrl),
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
