import { createContext, useContext } from 'react'
import type { OperationalRealtimeStatus } from './operationalRealtime'

export const OperationalRealtimeStatusContext = createContext<OperationalRealtimeStatus>('disabled')

export function useOperationalRealtimeStatus() {
    return useContext(OperationalRealtimeStatusContext)
}
