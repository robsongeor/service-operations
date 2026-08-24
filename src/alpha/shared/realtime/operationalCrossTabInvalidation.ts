import type { OperationalRealtimeResource } from './operationalRealtimeInvalidation.ts'

const LOCAL_INVALIDATION_EVENT = 'service-operations:operational-data-invalidated'
const CHANNEL_VERSION = 1

type CrossTabInvalidationMessage = Readonly<{
    version: typeof CHANNEL_VERSION
    senderId: string
    resources: OperationalRealtimeResource[]
}>

function normalizeResources(resources: readonly OperationalRealtimeResource[]) {
    return [...new Set(resources)].filter((resource) => resource === 'jobs' || resource === 'equipment' || resource === 'quotes')
}

function scopeHash(scope: string) {
    let hash = 0x811c9dc5
    for (let index = 0; index < scope.length; index += 1) {
        hash ^= scope.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(36)
}

function isCrossTabInvalidationMessage(value: unknown): value is CrossTabInvalidationMessage {
    if (!value || typeof value !== 'object') return false
    const message = value as Partial<CrossTabInvalidationMessage>
    return message.version === CHANNEL_VERSION
        && typeof message.senderId === 'string'
        && message.senderId.length > 0
        && message.senderId.length <= 100
        && Array.isArray(message.resources)
        && message.resources.length > 0
        && message.resources.length <= 3
        && message.resources.every((resource) => resource === 'jobs' || resource === 'equipment' || resource === 'quotes')
}

function createSenderId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function operationalCrossTabChannelName(scope: string) {
    return `service-operations:operational-data:${scopeHash(scope)}`
}

export function publishLocalOperationalInvalidation(resource: OperationalRealtimeResource) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<OperationalRealtimeResource>(LOCAL_INVALIDATION_EVENT, {
        detail: resource,
    }))
}

export function subscribeToLocalOperationalInvalidations(
    callback: (resource: OperationalRealtimeResource) => void,
) {
    if (typeof window === 'undefined') return () => undefined
    const listener = (event: Event) => {
        const resource = (event as CustomEvent<unknown>).detail
        if (resource === 'jobs' || resource === 'equipment' || resource === 'quotes') callback(resource)
    }
    window.addEventListener(LOCAL_INVALIDATION_EVENT, listener)
    return () => window.removeEventListener(LOCAL_INVALIDATION_EVENT, listener)
}

export function createOperationalCrossTabInvalidation(
    scope: string,
    onInvalidation: (resources: readonly OperationalRealtimeResource[]) => void,
) {
    const disabled = () => ({ publish: () => undefined, close: () => undefined })
    if (typeof BroadcastChannel === 'undefined') return disabled()

    const senderId = createSenderId()
    let channel: BroadcastChannel
    try {
        channel = new BroadcastChannel(operationalCrossTabChannelName(scope))
    } catch {
        return disabled()
    }
    channel.onmessage = (event: MessageEvent<unknown>) => {
        if (!isCrossTabInvalidationMessage(event.data) || event.data.senderId === senderId) return
        onInvalidation(normalizeResources(event.data.resources))
    }

    return {
        publish(resources: readonly OperationalRealtimeResource[]) {
            const normalized = normalizeResources(resources)
            if (normalized.length === 0) return
            channel.postMessage({ version: CHANNEL_VERSION, senderId, resources: normalized } satisfies CrossTabInvalidationMessage)
        },
        close() {
            channel.close()
        },
    }
}
