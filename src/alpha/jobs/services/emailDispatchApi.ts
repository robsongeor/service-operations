import type {
    EmailDispatchInput,
    EmailDispatchResult,
} from '../types/emailDispatch.types'

const API_URL = `${import.meta.env.VITE_DATAVERSE_URL}/api/data/v9.2`

function headers(token: string, includeContentType = false) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    }
}

async function errorMessage(response: Response, action: string) {
    const responseText = await response.text()
    try {
        const parsed = JSON.parse(responseText)
        return `${action}: ${parsed.error?.message || responseText}`
    } catch {
        return `${action}: ${responseText || `${response.status} ${response.statusText}`}`
    }
}

export async function createEmailDispatch(
    token: string,
    input: EmailDispatchInput,
): Promise<string> {
    const fields: Record<string, string | boolean> = {
        gr_name: `Job email to ${input.recipientName}`,
        gr_recipientemail: input.recipientEmail,
        gr_recipientname: input.recipientName,
        gr_subject: input.subject,
        gr_body: input.body,
        gr_emailsent: false,
        gr_requestedon: new Date().toISOString(),
        'gr_Job@odata.bind': `/gr_jobs(${input.jobId})`,
    }
    if (input.assignmentId) {
        fields['gr_JobAssignment@odata.bind'] = `/gr_jobassignments(${input.assignmentId})`
    }

    const response = await fetch(`${API_URL}/gr_emaildispatchs`, {
        method: 'POST',
        headers: {
            ...headers(token, true),
            Prefer: 'return=representation',
        },
        body: JSON.stringify(fields),
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'Failed to start email flow'))
    const created = await response.json()
    return created.gr_emaildispatchid
}

async function fetchEmailDispatch(token: string, dispatchId: string): Promise<EmailDispatchResult> {
    const response = await fetch(
        `${API_URL}/gr_emaildispatchs(${dispatchId})?$select=gr_emaildispatchid,gr_emailsent,gr_completedon,gr_errormessage`,
        { cache: 'no-store', headers: headers(token) },
    )
    if (!response.ok) throw new Error(await errorMessage(response, 'Failed to read email flow result'))
    return response.json()
}

export async function waitForEmailDispatch(
    token: string,
    dispatchId: string,
    timeoutMs = 45000,
): Promise<EmailDispatchResult> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        const result = await fetchEmailDispatch(token, dispatchId)
        if (result.gr_errormessage) throw new Error(result.gr_errormessage)
        if (result.gr_emailsent) return result
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
    }
    throw new Error('The email flow did not complete within 45 seconds. Check its Power Automate run history.')
}
