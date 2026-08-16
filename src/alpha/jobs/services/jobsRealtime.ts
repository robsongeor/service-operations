import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'

export type JobsRealtimeEvent = {
    jobId: string
    operation: 'create' | 'update' | 'delete'
    changedAt: string
}
export type JobsRealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected'

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isJobsRealtimeEvent(value: unknown): value is JobsRealtimeEvent {
    const event = value as Partial<JobsRealtimeEvent> | null
    return Boolean(event
        && typeof event.jobId === 'string'
        && GUID_PATTERN.test(event.jobId)
        && ['create', 'update', 'delete'].includes(event.operation ?? '')
        && typeof event.changedAt === 'string'
        && !Number.isNaN(Date.parse(event.changedAt)))
}

export function startJobsRealtime(options: {
    apiUrl: string
    getAccessToken: () => Promise<string>
    onEvent: (event: JobsRealtimeEvent) => void
    onStatus: (status: JobsRealtimeStatus) => void
    onReconnected?: () => void
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

    connection.on('jobChanged', (value: unknown) => {
        if (isJobsRealtimeEvent(value)) options.onEvent(value)
    })
    connection.onreconnecting(() => options.onStatus('connecting'))
    connection.onreconnected(() => {
        options.onStatus('connected')
        options.onReconnected?.()
    })
    connection.onclose(() => { if (!stopped) options.onStatus('disconnected') })

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
