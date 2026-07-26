import { buildMailtoUrl } from '../../jobs/utils/technicianMailto.ts'

type AssignmentLinkResponse = {
    path: string
    expiresOn: string
    recipientEmail: string
    recipientName: string
}

export async function generateSiteCheckAssignmentLink(
    accessToken: string,
    siteCheckId: string,
) {
    const response = await fetch('/api/sitecheckassignment', {
        method: 'POST',
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generate', siteCheckId }),
    })
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null
        throw new Error(
            typeof body?.error === 'string'
                ? body.error
                : 'The secure Site Check link could not be created. Please try again.',
        )
    }
    const body = await response.json() as AssignmentLinkResponse
    if (!body.path?.startsWith('/portal/site-check/') || !body.recipientEmail || !body.recipientName) {
        throw new Error('The secure Site Check link could not be created. Please try again.')
    }
    return {
        ...body,
        url: new URL(body.path, window.location.origin).toString(),
    }
}

export type SiteCheckAssignmentEmailInput = {
    siteCheckId: string
    customerName: string
    siteName: string
    frequencyLabel: string
    dueDate?: string | null
    jobCount: number
}

export async function prepareSiteCheckAssignmentEmail(
    accessToken: string,
    input: SiteCheckAssignmentEmailInput,
) {
    const assignment = await generateSiteCheckAssignmentLink(accessToken, input.siteCheckId)
    return buildSiteCheckAssignmentMailto({
        ...input,
        recipientEmail: assignment.recipientEmail,
        recipientName: assignment.recipientName,
        assignmentUrl: assignment.url,
    })
}

export type PublicSiteCheckAssignment = {
    siteCheckName?: string
    customerName?: string
    siteName?: string
    technicianName?: string
    frequency?: number
    dueDate?: string
    startedOn?: string
    expectedJobCount: number
    jobs: Array<{
        jobId: string
        jobNumber?: string
        description?: string
        jobStatus?: number
        jobCardStatus?: number
        equipment?: {
            id: string
            fleet?: string
            make?: string
            model?: string
            serial?: string
        }
        checklist: Array<{
            snapshotItemId: string
            itemKey: string
            groupName: string
            prompt: string
            responseType: number
            displayOrder: number
            required: boolean
            commentRequiredOnNegative: boolean
            photoRequiredOnNegative: boolean
        }>
    }>
}

export async function fetchPublicSiteCheckAssignment(token: string) {
    const response = await fetch(
        `/api/sitecheckassignment?token=${encodeURIComponent(token)}`,
        { cache: 'no-store', headers: { Accept: 'application/json' } },
    )
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null
        throw new Error(typeof body?.error === 'string'
            ? body.error
            : 'This Site Check assignment is unavailable.')
    }
    return await response.json() as PublicSiteCheckAssignment
}

export type SiteCheckChecklistSubmission = {
    jobId: string
    story: string
    timeEntries: Array<{ date: string; hours: number; kilometres: number }>
    parts: string[]
    photos: Array<{ fileName: string; mimeType: string; size: number; data: string }>
    responses: Array<{
        snapshotItemId: string
        choiceAnswer?: number
        numericAnswer?: number
        comment?: string
    }>
}

export async function submitPublicSiteCheckJob(
    token: string,
    submission: SiteCheckChecklistSubmission,
) {
    const response = await fetch('/api/sitecheckassignment', {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'submitJob',
            token,
            ...submission,
        }),
    })
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: unknown } | null
        throw new Error(typeof body?.error === 'string'
            ? body.error
            : 'This machine Job Card could not be submitted.')
    }
    return await response.json() as { submitted: true; jobId: string; submittedOn: string }
}

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

export function buildSiteCheckAssignmentMailto(input: {
    recipientEmail: string
    recipientName: string
    customerName: string
    siteName: string
    frequencyLabel: string
    dueDate?: string | null
    jobCount: number
    assignmentUrl: string
}) {
    const firstName = collapseWhitespace(input.recipientName).split(' ')[0] || 'there'
    const cadence = collapseWhitespace(input.frequencyLabel)
    const site = collapseWhitespace(input.siteName)
    const customer = collapseWhitespace(input.customerName)
    const subject = `${cadence} Site Check - ${customer} - ${site}`
    const body = [
        `Hi ${firstName},`,
        '',
        `A ${cadence.toLowerCase()} Site Check is ready for ${customer} at ${site}.`,
        input.dueDate ? `Due date: ${input.dueDate}` : '',
        `Equipment Jobs: ${input.jobCount}`,
        '',
        'Open the Site Check assignment:',
        input.assignmentUrl,
        '',
        'This secure link contains the individual Job Cards for the Equipment assigned to you.',
        'Thanks',
    ].filter((line) => line !== '').join('\n')

    return buildMailtoUrl({
        recipient: input.recipientEmail,
        subject,
        body,
    })
}
