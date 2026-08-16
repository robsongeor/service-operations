import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'

export type StaffRealtimeEvent = {
    staffId: string
    operation: 'create' | 'update' | 'delete'
    changedAt: string
}

export type StaffRealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected'

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

export function subscribeToStaffChanges(onEvent: (event: StaffRealtimeEvent) => void) {
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail
        if (isStaffRealtimeEvent(detail)) onEvent(detail)
    }
    window.addEventListener(STAFF_CHANGED_BROWSER_EVENT, listener)
    return () => window.removeEventListener(STAFF_CHANGED_BROWSER_EVENT, listener)
}

export function startStaffRealtime(options: {
    apiUrl: string
    getAccessToken: () => Promise<string>
    onEvent: (event: StaffRealtimeEvent) => void
    onStatus?: (status: StaffRealtimeStatus) => void
}) {
    const apiUrl = options.apiUrl.replace(/\/$/, '')
    if (!apiUrl) {
        options.onStatus?.('disabled')
        return () => undefined
    }

    let stopped = false
    let retryTimer: number | undefined
    const connection = new HubConnectionBuilder()
        .withUrl(apiUrl, { accessTokenFactory: options.getAccessToken })
        .withAutomaticReconnect([0, 2_000, 10_000, 30_000])
        .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
        .build()

    connection.on('staffChanged', (value: unknown) => {
        if (isStaffRealtimeEvent(value)) options.onEvent(value)
    })
    connection.onreconnecting(() => options.onStatus?.('connecting'))
    connection.onreconnected(() => options.onStatus?.('connected'))
    connection.onclose(() => { if (!stopped) options.onStatus?.('disconnected') })

    const connect = async () => {
        if (stopped || connection.state !== HubConnectionState.Disconnected) return
        options.onStatus?.('connecting')
        try {
            await connection.start()
            if (!stopped) options.onStatus?.('connected')
        } catch {
            if (stopped) return
            options.onStatus?.('disconnected')
            retryTimer = window.setTimeout(() => { void connect() }, 15_000)
        }
    }
    void connect()

    return () => {
        stopped = true
        if (retryTimer !== undefined) window.clearTimeout(retryTimer)
        void connection.stop()
    }
}
