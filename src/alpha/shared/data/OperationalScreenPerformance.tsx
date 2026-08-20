import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { OperationalScreenName } from './OperationalDataClient'
import { useOperationalDataClient } from './OperationalDataClientContext'
import { OperationalScreenReadyContext } from './OperationalScreenPerformanceContext'

const SCREEN_BY_PATH: Readonly<Record<string, OperationalScreenName>> = {
    '/jobs': 'Jobs',
    '/customers': 'Customer Dashboard',
    '/equipment': 'Equipment',
    '/scheduling': 'Scheduling',
    '/wof': 'WOF',
}

type ActiveVisit = {
    screen: OperationalScreenName
    startedAt: number
    ready: boolean
}

function OperationalScreenPerformanceRecorder({ children }: { children: ReactNode }) {
    const location = useLocation()
    const client = useOperationalDataClient()
    const activeVisit = useRef<ActiveVisit | null>(null)
    const screen = SCREEN_BY_PATH[location.pathname]

    useLayoutEffect(() => {
        if (!screen) {
            activeVisit.current = null
            return
        }
        activeVisit.current = { screen, startedAt: performance.now(), ready: false }
        client.recordScreenVisit(screen)
    }, [client, location.key, location.pathname, screen])

    const markReady = useCallback((readyScreen: OperationalScreenName) => {
        const visit = activeVisit.current
        if (!visit || visit.ready || visit.screen !== readyScreen) return
        visit.ready = true
        client.recordScreenReady(readyScreen, performance.now() - visit.startedAt)
    }, [client])

    return <OperationalScreenReadyContext.Provider value={markReady}>{children}</OperationalScreenReadyContext.Provider>
}

export function OperationalScreenPerformanceProvider({ children }: { children: ReactNode }) {
    if (!import.meta.env.DEV) return children
    return <OperationalScreenPerformanceRecorder>{children}</OperationalScreenPerformanceRecorder>
}
