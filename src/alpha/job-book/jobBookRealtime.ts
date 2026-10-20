import { subscribeToOperationalRealtimeRecovery } from '../shared/realtime/operationalRealtimeEvents.ts'
import type { JobBookKey } from './jobBookConfig.ts'

export type JobBookRealtimeEvent = {
    entryId: string
    book: JobBookKey
    operation: 'create' | 'update' | 'delete'
    changedAt: string
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const JOB_BOOK_CHANGED_BROWSER_EVENT = 'service-operations:job-book-changed'
const JOB_BOOK_KEYS = new Set<JobBookKey>(['auckland', 'waikato', 'hastings', 'christchurch'])

export function isJobBookRealtimeEvent(value: unknown): value is JobBookRealtimeEvent {
    const event = value as Partial<JobBookRealtimeEvent> | null
    return Boolean(event
        && typeof event.entryId === 'string'
        && GUID_PATTERN.test(event.entryId)
        && typeof event.book === 'string'
        && JOB_BOOK_KEYS.has(event.book as JobBookKey)
        && ['create', 'update', 'delete'].includes(event.operation ?? '')
        && typeof event.changedAt === 'string'
        && !Number.isNaN(Date.parse(event.changedAt)))
}

export function publishJobBookChange(event: JobBookRealtimeEvent) {
    window.dispatchEvent(new CustomEvent<JobBookRealtimeEvent>(JOB_BOOK_CHANGED_BROWSER_EVENT, { detail: event }))
}

export function subscribeToJobBookChanges(onEvent: (event?: JobBookRealtimeEvent) => void) {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail
        if (isJobBookRealtimeEvent(detail)) onEvent(detail)
    }
    window.addEventListener(JOB_BOOK_CHANGED_BROWSER_EVENT, listener)
    const unsubscribeRecovery = subscribeToOperationalRealtimeRecovery(() => onEvent())
    return () => {
        window.removeEventListener(JOB_BOOK_CHANGED_BROWSER_EVENT, listener)
        unsubscribeRecovery()
    }
}
