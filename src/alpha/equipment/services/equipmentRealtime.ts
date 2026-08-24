export type EquipmentRealtimeEvent = {
    equipmentId: string
    operation: 'create' | 'update' | 'delete'
    changedAt: string
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EQUIPMENT_CHANGED_BROWSER_EVENT = 'service-operations:equipment-changed'

export function isEquipmentRealtimeEvent(value: unknown): value is EquipmentRealtimeEvent {
    const event = value as Partial<EquipmentRealtimeEvent> | null
    return Boolean(event
        && typeof event.equipmentId === 'string'
        && GUID_PATTERN.test(event.equipmentId)
        && ['create', 'update', 'delete'].includes(event.operation ?? '')
        && typeof event.changedAt === 'string'
        && !Number.isNaN(Date.parse(event.changedAt)))
}

export function publishEquipmentChange(event: EquipmentRealtimeEvent) {
    window.dispatchEvent(new CustomEvent<EquipmentRealtimeEvent>(EQUIPMENT_CHANGED_BROWSER_EVENT, { detail: event }))
}

export function subscribeToEquipmentChanges(onEvent: (event: EquipmentRealtimeEvent) => void) {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail
        if (isEquipmentRealtimeEvent(detail)) onEvent(detail)
    }
    window.addEventListener(EQUIPMENT_CHANGED_BROWSER_EVENT, listener)
    return () => window.removeEventListener(EQUIPMENT_CHANGED_BROWSER_EVENT, listener)
}
