import { subscribeToOperationalRealtimeRecovery } from '../../shared/realtime/operationalRealtimeEvents.ts'

export type StaffRealtimeEvent = {
    staffId: string
    operation: 'create' | 'update' | 'delete'
    changedAt: string
}

const STAFF_CHANGED_BROWSER_EVENT = 'service-operations:staff-changed'
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isStaffRealtimeEvent(value: unknown): value is StaffRealtimeEvent {
    const event = value as Partial<StaffRealtimeEvent> | null
    return Boolean(event
        && typeof event.staffId === 'string'
        && GUID_PATTERN.test(event.staffId)
        && ['create', 'update', 'delete'].includes(event.operation ?? '')
        && typeof event.changedAt === 'string'
        && !Number.isNaN(Date.parse(event.changedAt)))
}

export function publishStaffChange(event: StaffRealtimeEvent) {
    window.dispatchEvent(new CustomEvent<StaffRealtimeEvent>(STAFF_CHANGED_BROWSER_EVENT, { detail: event }))
}

export function subscribeToStaffChanges(onEvent: (event?: StaffRealtimeEvent) => void) {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail
        if (isStaffRealtimeEvent(detail)) onEvent(detail)
    }
    window.addEventListener(STAFF_CHANGED_BROWSER_EVENT, listener)
    const unsubscribeRecovery = subscribeToOperationalRealtimeRecovery(() => onEvent())
    return () => {
        window.removeEventListener(STAFF_CHANGED_BROWSER_EVENT, listener)
        unsubscribeRecovery()
    }
}
