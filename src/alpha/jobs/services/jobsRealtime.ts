export type JobsRealtimeEvent = {
    jobId: string
    operation: 'create' | 'update' | 'delete'
    changedAt: string
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const JOB_CHANGED_BROWSER_EVENT = 'service-operations:job-changed'

export function isJobsRealtimeEvent(value: unknown): value is JobsRealtimeEvent {
    const event = value as Partial<JobsRealtimeEvent> | null
    return Boolean(event
        && typeof event.jobId === 'string'
        && GUID_PATTERN.test(event.jobId)
        && ['create', 'update', 'delete'].includes(event.operation ?? '')
        && typeof event.changedAt === 'string'
        && !Number.isNaN(Date.parse(event.changedAt)))
}

export function publishJobChange(event: JobsRealtimeEvent) {
    window.dispatchEvent(new CustomEvent<JobsRealtimeEvent>(JOB_CHANGED_BROWSER_EVENT, { detail: event }))
}

export function subscribeToJobChanges(onEvent: (event: JobsRealtimeEvent) => void) {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail
        if (isJobsRealtimeEvent(detail)) onEvent(detail)
    }
    window.addEventListener(JOB_CHANGED_BROWSER_EVENT, listener)
    return () => window.removeEventListener(JOB_CHANGED_BROWSER_EVENT, listener)
}
