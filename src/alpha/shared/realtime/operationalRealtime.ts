import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { isEquipmentRealtimeEvent, type EquipmentRealtimeEvent } from '../../equipment/services/equipmentRealtime.ts'
import { isJobsRealtimeEvent, type JobsRealtimeEvent } from '../../jobs/services/jobsRealtime.ts'
import { isStaffRealtimeEvent, type StaffRealtimeEvent } from '../../mechanics/services/staffRealtime.ts'

export type OperationalRealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected'

export function startOperationalRealtime(options: {
    apiUrl: string
    getAccessToken: () => Promise<string>
    onJobEvent: (event: JobsRealtimeEvent) => void
    onEquipmentEvent: (event: EquipmentRealtimeEvent) => void
    onStaffEvent: (event: StaffRealtimeEvent) => void
    onStatus: (status: OperationalRealtimeStatus) => void
    onReconnected: () => void
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
        if (isJobsRealtimeEvent(value)) options.onJobEvent(value)
    })
    connection.on('equipmentChanged', (value: unknown) => {
        if (isEquipmentRealtimeEvent(value)) options.onEquipmentEvent(value)
    })
    connection.on('staffChanged', (value: unknown) => {
        if (isStaffRealtimeEvent(value)) options.onStaffEvent(value)
    })
    connection.onreconnecting(() => options.onStatus('connecting'))
    connection.onreconnected(() => {
        options.onStatus('connected')
        options.onReconnected()
    })

    const scheduleConnect = () => {
        if (stopped || retryTimer !== undefined) return
        retryTimer = window.setTimeout(() => {
            retryTimer = undefined
            void connect()
        }, 15_000)
    }
    connection.onclose(() => {
        if (stopped) return
        options.onStatus('disconnected')
        scheduleConnect()
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
            scheduleConnect()
        }
    }
    void connect()

    return () => {
        stopped = true
        if (retryTimer !== undefined) window.clearTimeout(retryTimer)
        void connection.stop()
    }
}
