import { createContext, useContext, useEffect } from 'react'
import type { OperationalScreenName } from './OperationalDataClient'

export const OperationalScreenReadyContext = createContext<((screen: OperationalScreenName) => void) | null>(null)

export function useOperationalScreenReady(screen: OperationalScreenName, ready: boolean) {
    const markReady = useContext(OperationalScreenReadyContext)
    useEffect(() => {
        if (ready) markReady?.(screen)
    }, [markReady, ready, screen])
}
