export type OperationalRealtimeRecoveryReason = 'reconnected' | 'visibility'

const RECOVERY_EVENT = 'service-operations:realtime-recovery'

export function publishOperationalRealtimeRecovery(reason: OperationalRealtimeRecoveryReason) {
    window.dispatchEvent(new CustomEvent<OperationalRealtimeRecoveryReason>(RECOVERY_EVENT, { detail: reason }))
}

export function subscribeToOperationalRealtimeRecovery(
    onRecovery: (reason: OperationalRealtimeRecoveryReason) => void,
) {
    const listener = (event: Event) => {
        const reason = (event as CustomEvent<unknown>).detail
        if (reason === 'reconnected' || reason === 'visibility') onRecovery(reason)
    }
    window.addEventListener(RECOVERY_EVENT, listener)
    return () => window.removeEventListener(RECOVERY_EVENT, listener)
}
