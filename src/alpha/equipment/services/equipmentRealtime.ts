import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'

export type EquipmentRealtimeEvent = {
    equipmentId: string
    operation: 'create' | 'update' | 'delete'
    changedAt: string
}
export type EquipmentRealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected'

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isEquipmentRealtimeEvent(value: unknown): value is EquipmentRealtimeEvent {
    const event = value as Partial<EquipmentRealtimeEvent> | null
    return Boolean(event
        && typeof event.equipmentId === 'string'
        && GUID_PATTERN.test(event.equipmentId)
        && ['create', 'update', 'delete'].includes(event.operation ?? '')
        && typeof event.changedAt === 'string'
        && !Number.isNaN(Date.parse(event.changedAt)))
}

export function startEquipmentRealtime(options: {
    apiUrl: string
    getAccessToken: () => Promise<string>
    onEvent: (event: EquipmentRealtimeEvent) => void
    onStatus: (status: EquipmentRealtimeStatus) => void
}) {
    const apiUrl = options.apiUrl.replace(/\/$/, '')
    if (!apiUrl) {
        options.onStatus('disabled')
        return () => undefined
    }

    let stopped = false
    let retryTimer: number | undefined
    const connection = new HubConnectionBuilder()
        .withUrl(apiUrl, { accessTokenFactory: options.getAccessToken })
        .withAutomaticReconnect([0, 2_000, 10_000, 30_000])
        .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
        .build()

    connection.on('equipmentChanged', (value: unknown) => {
        if (isEquipmentRealtimeEvent(value)) options.onEvent(value)
    })
    connection.onreconnecting(() => options.onStatus('connecting'))
    connection.onreconnected(() => options.onStatus('connected'))
    connection.onclose(() => {
        if (!stopped) options.onStatus('disconnected')
    })

    const connect = async () => {
        if (stopped || connection.state !== HubConnectionState.Disconnected) return
        options.onStatus('connecting')
        try {
            await connection.start()
            if (!stopped) options.onStatus('connected')
        } catch {
            if (stopped) return
            options.onStatus('disconnected')
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
